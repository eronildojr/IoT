/**
 * Cliente da plataforma Whatsmiau (compatível com Evolution API).
 *
 * - Base/instância/credencial vêm do env.
 * - Toda mensagem de SAÍDA é gravada em wa_messages_log (direction='out').
 * - Envio real só acontece com WA_BOT_ENABLED='true' (feature flag — liga no
 *   Prompt 26). Com a flag desligada, a mensagem é apenas registrada como
 *   "skipped" — permite testar a máquina de estados sem mandar nada ao número.
 */
import axios from 'axios';
import { query } from '../config/db';

const BASE_URL = process.env.WHATSMIAU_BASE_URL || 'https://api.whatsmiau.dev/v2';
const API_KEY = process.env.WHATSMIAU_API_KEY || '';
const INSTANCE = process.env.WHATSMIAU_INSTANCE || 'groupates_ocorrencias';

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 20_000,
  headers: { apikey: API_KEY, 'Content-Type': 'application/json' },
});

/** Extrai só os dígitos do remoteJid antes do '@'. Ex.: 5511..@s.whatsapp.net → 5511.. */
export function normalizePhone(remoteJid: string): string {
  return String(remoteJid || '').split('@')[0].replace(/\D/g, '');
}

/** Master switch de envio real. Desligado por padrão (testes sem efeitos). */
export function botCanSend(): boolean {
  return process.env.WA_BOT_ENABLED === 'true';
}

async function logOut(phone: string, type: string, content: string, raw: any): Promise<void> {
  try {
    await query(
      'INSERT INTO wa_messages_log(phone, direction, type, content, raw) VALUES($1,$2,$3,$4,$5)',
      [phone, 'out', type, content, raw ? JSON.stringify(raw) : null]
    );
  } catch (e: any) {
    console.error('[whatsmiau] falha ao logar saída:', e.message);
  }
}

export async function sendText(phone: string, text: string): Promise<any> {
  const body = { number: phone, text };
  if (!botCanSend()) {
    await logOut(phone, 'text', text, { ...body, skipped: true, reason: 'WA_BOT_ENABLED=false' });
    console.log(`[whatsmiau] (dry-run) sendText -> ${phone}: ${text.slice(0, 80)}`);
    return { skipped: true, reason: 'bot_disabled' };
  }
  try {
    const r = await http.post(`/message/sendText/${INSTANCE}`, body);
    await logOut(phone, 'text', text, { request: body, response: r.data });
    return r.data;
  } catch (e: any) {
    await logOut(phone, 'text', text, { request: body, error: e.message });
    console.error('[whatsmiau] sendText falhou:', e.message);
    throw e;
  }
}

export async function sendLocation(
  phone: string, lat: number, lng: number, label = ''
): Promise<any> {
  const body = { number: phone, latitude: lat, longitude: lng, name: label };
  const content = `${label} (${lat},${lng})`;
  if (!botCanSend()) {
    await logOut(phone, 'location', content, { ...body, skipped: true, reason: 'WA_BOT_ENABLED=false' });
    console.log(`[whatsmiau] (dry-run) sendLocation -> ${phone}: ${content}`);
    return { skipped: true, reason: 'bot_disabled' };
  }
  try {
    const r = await http.post(`/message/sendLocation/${INSTANCE}`, body);
    await logOut(phone, 'location', content, { request: body, response: r.data });
    return r.data;
  } catch (e: any) {
    await logOut(phone, 'location', content, { request: body, error: e.message });
    console.error('[whatsmiau] sendLocation falhou:', e.message);
    throw e;
  }
}

export async function sendList(phone: string, payload: Record<string, any>): Promise<any> {
  const body = { number: phone, ...payload };
  if (!botCanSend()) {
    await logOut(phone, 'list', JSON.stringify(payload), { ...body, skipped: true });
    return { skipped: true, reason: 'bot_disabled' };
  }
  const r = await http.post(`/message/sendList/${INSTANCE}`, body);
  await logOut(phone, 'list', JSON.stringify(payload), { request: body, response: r.data });
  return r.data;
}

export async function sendButtons(phone: string, payload: Record<string, any>): Promise<any> {
  const body = { number: phone, ...payload };
  if (!botCanSend()) {
    await logOut(phone, 'buttons', JSON.stringify(payload), { ...body, skipped: true });
    return { skipped: true, reason: 'bot_disabled' };
  }
  const r = await http.post(`/message/sendButtons/${INSTANCE}`, body);
  await logOut(phone, 'buttons', JSON.stringify(payload), { request: body, response: r.data });
  return r.data;
}

export async function getConnectionState(): Promise<any> {
  const r = await http.get(`/instance/connectionState/${INSTANCE}`);
  return r.data;
}

/** QR de conexão como PNG (Buffer). */
export async function getQrImage(): Promise<Buffer> {
  const r = await http.get(`/instance/connect/${INSTANCE}/image`, { responseType: 'arraybuffer' });
  return Buffer.from(r.data);
}

export async function setWebhook(
  url: string, events: string[], headers: Record<string, string> = {}
): Promise<any> {
  const body = { webhook: { enabled: true, url, events, headers } };
  const r = await http.post(`/webhook/set/${INSTANCE}`, body);
  return r.data;
}

export const config = { BASE_URL, INSTANCE, hasApiKey: !!API_KEY };
