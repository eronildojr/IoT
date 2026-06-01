/**
 * Máquina de estados da conversa de ocorrências (por telefone).
 *
 * Fluxo: new → awaiting_name → awaiting_location → awaiting_description → completed
 *
 * Regras:
 *  - localização é OBRIGATÓRIA e validada (só locationMessage avança);
 *  - áudio é transcrito pelo microserviço groupates_ai (/transcribe);
 *  - toda resposta é enviada via whatsmiau.sendText (que loga e respeita o
 *    feature flag WA_BOT_ENABLED);
 *  - estado é persistido em wa_sessions, então timeout/retomada é natural:
 *    uma nova mensagem sempre continua do estado salvo (sem perder dados).
 */
import axios from 'axios';
import { query, queryOne } from '../config/db';
import { sendText } from './whatsmiau';
import { runClassificationAndDispatch } from './waPipeline';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://groupates_ai:8090';
const RESUME_AFTER_MS = 30 * 60 * 1000; // 30 min — apenas para mensagem de retomada

const DEFAULT_WELCOME =
  'Olá! Seja bem-vindo(a). Vamos registrar sua ocorrência. Primeiro, informe seu nome.';
const ASK_LOCATION =
  'Obrigado! Agora envie sua *localização*: toque no clipe 📎 → Localização → Enviar localização atual.';
const ASK_LOCATION_AGAIN =
  'Preciso da sua *localização* para continuar. Toque no clipe 📎 → Localização → Enviar localização atual. ' +
  '(Não consigo seguir sem ela.)';
const ASK_DESCRIPTION =
  'Perfeito, localização recebida. Agora descreva o problema (pode escrever ou mandar um áudio).';
const CONFIRM_DONE =
  'Recebemos sua ocorrência. Estamos encaminhando para a equipe responsável.';
const NEW_OCCURRENCE_PROMPT =
  'É sobre uma *nova* ocorrência? Envie sua localização para começarmos: ' +
  'clipe 📎 → Localização → Enviar localização atual.';

type WaState = 'new' | 'awaiting_name' | 'awaiting_location' | 'awaiting_description' | 'completed';

interface ParsedMessage {
  type: 'text' | 'audio' | 'location' | 'image' | 'other';
  text?: string;
  audioUrl?: string;
  mime?: string;
  lat?: number;
  lng?: number;
}

/** Extrai de forma defensiva o conteúdo de data (messages.upsert). */
export function parseIncoming(data: any): ParsedMessage {
  const msg = data?.message || {};

  // Texto
  if (typeof msg.conversation === 'string' && msg.conversation.trim()) {
    return { type: 'text', text: msg.conversation.trim() };
  }
  if (msg.extendedTextMessage?.text) {
    return { type: 'text', text: String(msg.extendedTextMessage.text).trim() };
  }

  // Áudio — mediaUrl pode vir em data.mediaUrl (Whatsmiau) ou no próprio nó
  if (msg.audioMessage) {
    const url = data?.mediaUrl || msg.audioMessage.url || data?.message?.audioMessage?.url;
    const mime = (msg.audioMessage.mimetype || 'audio/ogg').split(';')[0].trim();
    return { type: 'audio', audioUrl: url, mime };
  }

  // Localização — degreesLatitude/degreesLongitude (defensivo: nem sempre documentado)
  if (msg.locationMessage) {
    const loc = msg.locationMessage;
    const lat = Number(loc.degreesLatitude ?? loc.latitude ?? loc.lat);
    const lng = Number(loc.degreesLongitude ?? loc.longitude ?? loc.lng);
    return { type: 'location', lat, lng };
  }

  if (msg.imageMessage) {
    const url = data?.mediaUrl || msg.imageMessage.url;
    return { type: 'image', audioUrl: url };
  }

  return { type: 'other' };
}

function validCoords(lat?: number, lng?: number): boolean {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Baixa o áudio via groupates_ai e retorna a transcrição. Lança em erro. */
async function transcribe(audioUrl: string, mime: string): Promise<string> {
  const r = await axios.post(
    `${AI_SERVICE_URL}/transcribe`,
    { audio_url: audioUrl, mime },
    { timeout: 60_000 }
  );
  const text = r.data?.text;
  if (!text || !String(text).trim()) throw new Error('transcrição vazia');
  return String(text).trim();
}

async function getWelcome(): Promise<string> {
  const cfg = await queryOne<any>('SELECT welcome_message FROM wa_config ORDER BY id LIMIT 1');
  return cfg?.welcome_message || DEFAULT_WELCOME;
}

async function getSession(phone: string): Promise<any | null> {
  return queryOne<any>('SELECT * FROM wa_sessions WHERE phone=$1', [phone]);
}

async function setSession(phone: string, fields: Record<string, any>): Promise<void> {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k}=$${i + 2}`);
  const vals = keys.map((k) => fields[k]);
  await query(
    `UPDATE wa_sessions SET ${sets.join(', ')}, last_message_at=NOW(), updated_at=NOW() WHERE phone=$1`,
    [phone, ...vals]
  );
}

/**
 * Ponto de entrada. Recebe o envelope já validado/identificado como
 * messages.upsert de outro (fromMe=false). Conduz a transição.
 */
export async function handleIncoming(envelope: any): Promise<void> {
  const data = envelope?.data || {};
  const remoteJid = data?.key?.remoteJid || '';
  const phone = String(remoteJid).split('@')[0].replace(/\D/g, '');
  if (!phone) {
    console.warn('[wa-conv] sem phone no envelope, ignorando');
    return;
  }

  const parsed = parseIncoming(data);
  let session = await getSession(phone);

  // Sem sessão → cria e dá boas-vindas (estado new → awaiting_name)
  if (!session) {
    await query(
      'INSERT INTO wa_sessions(phone, state, last_message_at) VALUES($1,$2,NOW())',
      [phone, 'awaiting_name']
    );
    await sendText(phone, await getWelcome());
    return;
  }

  // Retomada após inatividade: continua do estado salvo (dados preservados).
  const last = session.last_message_at ? new Date(session.last_message_at).getTime() : 0;
  const resumed =
    last && Date.now() - last > RESUME_AFTER_MS &&
    !['completed', 'new'].includes(session.state);
  if (resumed) {
    console.log(`[wa-conv] ${phone} retomando após inatividade (estado=${session.state})`);
  }

  const state: WaState = session.state;

  switch (state) {
    case 'awaiting_name':
      return handleAwaitingName(phone, parsed);

    case 'awaiting_location':
      return handleAwaitingLocation(phone, parsed);

    case 'awaiting_description':
      return handleAwaitingDescription(phone, session, parsed);

    case 'completed':
      // Reentrada: nova ocorrência. Mantém o nome se já conhecido.
      if (session.name) {
        await setSession(phone, { state: 'awaiting_location', latitude: null, longitude: null });
        await sendText(phone, `Olá de novo, ${session.name}! ${NEW_OCCURRENCE_PROMPT}`);
      } else {
        await setSession(phone, { state: 'awaiting_name' });
        await sendText(phone, await getWelcome());
      }
      return;

    default:
      // 'new' ou estado inesperado → reinicia pedindo o nome
      await setSession(phone, { state: 'awaiting_name' });
      await sendText(phone, await getWelcome());
      return;
  }
}

async function handleAwaitingName(phone: string, parsed: ParsedMessage): Promise<void> {
  let name: string | null = null;

  if (parsed.type === 'text' && parsed.text) {
    name = parsed.text;
  } else if (parsed.type === 'audio' && parsed.audioUrl) {
    try {
      name = await transcribe(parsed.audioUrl, parsed.mime || 'audio/ogg');
    } catch (e: any) {
      console.error('[wa-conv] transcrição do nome falhou:', e.message);
      await sendText(phone, 'Não consegui entender o áudio. Por favor, *digite* seu nome.');
      return;
    }
  } else {
    await sendText(phone, 'Por favor, informe seu *nome* (texto ou áudio).');
    return;
  }

  await setSession(phone, { name, state: 'awaiting_location' });
  await sendText(phone, ASK_LOCATION);
}

async function handleAwaitingLocation(phone: string, parsed: ParsedMessage): Promise<void> {
  // Localização é OBRIGATÓRIA: só locationMessage com lat/lng válidos avança.
  if (parsed.type !== 'location' || !validCoords(parsed.lat, parsed.lng)) {
    await sendText(phone, ASK_LOCATION_AGAIN);
    return;
  }
  await setSession(phone, {
    latitude: parsed.lat, longitude: parsed.lng, state: 'awaiting_description',
  });
  await sendText(phone, ASK_DESCRIPTION);
}

async function handleAwaitingDescription(
  phone: string, session: any, parsed: ParsedMessage
): Promise<void> {
  let descriptionRaw: string | null = null;
  let descriptionTranscribed: string | null = null;
  let audioUrl: string | null = null;

  if (parsed.type === 'text' && parsed.text) {
    descriptionRaw = parsed.text;
  } else if (parsed.type === 'audio' && parsed.audioUrl) {
    audioUrl = parsed.audioUrl;
    try {
      descriptionTranscribed = await transcribe(parsed.audioUrl, parsed.mime || 'audio/ogg');
    } catch (e: any) {
      console.error('[wa-conv] transcrição da descrição falhou:', e.message);
      await sendText(phone, 'Não consegui transcrever o áudio. Pode *escrever* a descrição ou reenviar o áudio?');
      return; // não avança — mantém awaiting_description
    }
  } else {
    await sendText(phone, 'Descreva o problema por *texto* ou *áudio*, por favor.');
    return;
  }

  // Cria a ocorrência (status pending_classification) e dispara o pipeline.
  const occ = await queryOne<any>(
    `INSERT INTO wa_occurrences
       (phone, name, latitude, longitude, description_raw, description_transcribed, audio_url, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_classification')
     RETURNING id`,
    [phone, session.name, session.latitude, session.longitude,
     descriptionRaw, descriptionTranscribed, audioUrl]
  );
  const occurrenceId = occ.id;

  await setSession(phone, { state: 'completed' });
  await sendText(phone, CONFIRM_DONE);

  // Pipeline de classificação + despacho (Prompt 24), assíncrono.
  setImmediate(() =>
    runClassificationAndDispatch(occurrenceId).catch((e) =>
      console.error(`[wa-conv] pipeline ocorrência ${occurrenceId} falhou:`, e.message)
    )
  );
}
