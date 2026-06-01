/**
 * mqttIngestor.ts
 * Ingestor MQTT genérico (multi-tenant) com roteamento por identidade do dispositivo.
 *
 * Diferente do chirpstackBridge (que escuta apenas o broker interno no formato
 * ChirpStack), este serviço conecta de SAÍDA em qualquer broker MQTT/MQTTS/WS/WSS
 * configurado por dispositivo.
 *
 * Arquitetura: 1 conexão por BROKER (não por dispositivo). Cada conexão assina a
 * UNIÃO dos tópicos dos dispositivos daquele broker. Ao receber uma mensagem, o
 * destino é decidido pela IDENTIDADE contida no payload (DeviceEui/IMEI/serial…),
 * caindo para casamento de tópico quando o payload não traz identificador.
 *
 * Isso garante que dispositivos que compartilham broker/tópico (inclusive curingas)
 * NÃO recebam a telemetria uns dos outros, e que não haja gravação duplicada.
 *
 * Seleciona dispositivos com:
 *   communication = 'mqtt'  AND  connection_host IS NOT NULL  AND  config.topic preenchido
 */
import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import crypto from 'crypto';
import { query } from '../config/db';

const RELOAD_INTERVAL_MS = 30_000;

interface DeviceInfo {
  id: string;
  tenantId: string;
  name: string;
  devEui: string | null;
  identifier: string;
  topic: string;        // tópico configurado (pode conter curinga + ou #)
}

interface BrokerGroup {
  key: string;          // identifica o broker (url+credenciais)
  url: string;
  options: IClientOptions;
  topics: string[];     // união dos tópicos dos dispositivos
  devices: DeviceInfo[];
  sig: string;          // muda quando topics/devices/credenciais mudam => reconecta
}

interface Entry {
  sig: string;
  client: MqttClient;
}

const clients = new Map<string, Entry>(); // brokerKey -> conexão ativa
let started = false;

// Dedup: brokers podem entregar a mesma mensagem mais de uma vez quando o tópico
// casa com assinaturas sobrepostas (curinga + exato) ou em reentregas QoS 1.
const recentMsgs = new Map<string, number>(); // chave -> timestamp
const DEDUP_TTL_MS = 60_000;

function isDuplicate(deviceId: string, data: Record<string, any>, raw: Buffer): boolean {
  const fc = data?.FCounter ?? data?.fCounter ?? data?.fcnt ?? data?.Data?.FCounter;
  const key = fc !== undefined && fc !== null
    ? `${deviceId}:fc:${fc}`
    : `${deviceId}:h:${crypto.createHash('sha1').update(raw).digest('hex')}`;
  const now = Date.now();
  const prev = recentMsgs.get(key);
  // limpeza preguiçosa
  if (recentMsgs.size > 5000) {
    for (const [k, ts] of recentMsgs) if (now - ts > DEDUP_TTL_MS) recentMsgs.delete(k);
  }
  if (prev !== undefined && now - prev < DEDUP_TTL_MS) return true;
  recentMsgs.set(key, now);
  return false;
}

function normId(s: string | null | undefined): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Extrai hostname e path de um host que pode vir como "wss://broker/mqtt" ou "broker/mqtt". */
function splitHost(rawHost: string): { hostname: string; path: string } {
  const noScheme = String(rawHost).replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').trim();
  const slash = noScheme.indexOf('/');
  const hostPart = slash >= 0 ? noScheme.slice(0, slash) : noScheme;
  const path = slash >= 0 ? noScheme.slice(slash) : '';
  const hostname = hostPart.split(':')[0].split('?')[0].trim();
  return { hostname, path };
}

function normalizeScheme(proto: string | null | undefined): 'mqtt' | 'mqtts' | 'ws' | 'wss' {
  const p = String(proto || 'mqtt').toLowerCase();
  if (p === 'mqtts' || p === 'ssl' || p === 'tls') return 'mqtts';
  if (p === 'ws') return 'ws';
  if (p === 'wss' || p === 'https') return 'wss';
  return 'mqtt';
}

/** Remove prefixo de modelo do EUI (ex.: "pb-ctlw-ec99a4ffffd4068d" -> "ec99a4ffffd4068d"). */
function cleanEui(raw: string): string {
  const s = raw.trim();
  // Se houver separador (- _ /), tenta o último segmento quando for hexadecimal.
  const lastSeg = s.split(/[-_/]/).pop() || s;
  if (/^[0-9a-fA-F]{8,}$/.test(lastSeg)) return lastSeg;
  // Senão, pega a maior sequência hexadecimal no final da string.
  const m = s.match(/([0-9a-fA-F]{8,})$/);
  return m ? m[1] : s;
}

/** Procura recursivamente o DevEui no payload (aceita variações: DeviceEui, dev_eui, devEUI, eui). */
const EUI_KEYS = /^(deviceeui|deveui|eui)$/;
function extractDevEui(obj: any, depth = 0): string | null {
  if (!obj || typeof obj !== 'object' || depth > 5) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.trim()) {
      // normaliza a chave (dev_eui, device-eui, DeviceEui -> deveui/deviceeui)
      if (EUI_KEYS.test(k.toLowerCase().replace(/[^a-z]/g, ''))) return cleanEui(v);
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const r = extractDevEui(v, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

/** Procura recursivamente o primeiro valor (não-objeto) cuja chave normalizada casa com keyRe. */
function findVal(obj: any, keyRe: RegExp, depth = 0): any {
  if (!obj || typeof obj !== 'object' || depth > 5) return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v !== 'object' && keyRe.test(k.toLowerCase().replace(/[^a-z]/g, ''))) return v;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const r = findVal(v, keyRe, depth + 1);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

function toNum(v: any): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

const ALARM_KEYS = /^(alarm|alarmstatus|sos|issos|panic)$/;
const STATUS_KEYS = /^(devicestatus|status)$/;
const BATTERY_KEYS = /^(batterylevel|battery|bat|batterypct|batterypercent)$/;
const LAT_KEYS = /^(latitude|lat)$/;
const LON_KEYS = /^(longitude|lon|lng|long)$/;

/** Considera acionamento quando há flag de alarme verdadeira ou status SOS. */
function isSosTrigger(data: Record<string, any>): boolean {
  const a = findVal(data, ALARM_KEYS);
  if (a === true || a === 1 || String(a).toLowerCase() === 'true') return true;
  const s = findVal(data, STATUS_KEYS);
  if (s && String(s).toUpperCase().includes('SOS')) return true;
  return false;
}

/** Grava um registro em sos_alerts quando a mensagem é um acionamento. */
async function recordSosAlert(target: DeviceInfo, data: Record<string, any>) {
  if (!isSosTrigger(data)) return;
  const devEui = extractDevEui(data) || target.devEui;
  const battery = toNum(findVal(data, BATTERY_KEYS));
  const lat = toNum(findVal(data, LAT_KEYS));
  const lng = toNum(findVal(data, LON_KEYS));
  await query(
    `INSERT INTO sos_alerts(tenant_id, device_id, dev_eui, battery_level, latitude, longitude)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [target.tenantId, target.id, devEui, battery, lat, lng]
  );
}

function parsePayload(buf: Buffer): Record<string, any> {
  const text = buf.toString('utf8');
  try {
    const j = JSON.parse(text);
    if (j && typeof j === 'object') return j;
    return { value: j };
  } catch {
    const num = Number(text);
    if (text.trim() !== '' && !Number.isNaN(num)) return { value: num };
    return { raw: text };
  }
}

/** Decide a qual dispositivo do grupo a mensagem pertence. */
function routeDevice(group: BrokerGroup, data: Record<string, any>): DeviceInfo | null {
  // Usa EXCLUSIVAMENTE o DevEui presente no payload MQTT.
  const cand = normId(extractDevEui(data));
  if (!cand) return null;
  let d = group.devices.find(x => x.devEui && normId(x.devEui) === cand);
  if (d) return d;
  d = group.devices.find(x => normId(x.identifier) === cand);
  if (d) return d;
  if (cand.length >= 6) {
    d = group.devices.find(x => normId(x.identifier).endsWith(cand) || (x.devEui && normId(x.devEui).endsWith(cand)));
    if (d) return d;
  }
  // DevEui não corresponde a nenhum dispositivo cadastrado => ignora.
  return null;
}

async function persist(deviceId: string, tenantId: string, topic: string, data: Record<string, any>) {
  const payload = { ...data, _topic: topic };
  await query('INSERT INTO telemetry(device_id, tenant_id, data) VALUES($1,$2,$3)', [deviceId, tenantId, JSON.stringify(payload)]);
  await query(`UPDATE devices SET last_seen_at=NOW(), last_telemetry=$1, status='online' WHERE id=$2`, [JSON.stringify(payload), deviceId]);
}

/** Constrói os grupos por broker a partir das linhas de `devices`. */
function buildGroups(rows: any[]): Map<string, BrokerGroup> {
  const groups = new Map<string, BrokerGroup>();
  for (const d of rows) {
    const cfg = d.connection_config || {};
    const topicRaw: string = (cfg.topic || '').trim();
    if (!d.connection_host || !topicRaw) continue;
    const topics = topicRaw.split(',').map((t: string) => t.trim()).filter(Boolean);
    if (!topics.length) continue;

    const scheme = normalizeScheme(d.connection_protocol);
    const { hostname, path: hostPath } = splitHost(d.connection_host);
    if (!hostname) continue;
    const port = parseInt(d.connection_port) || (scheme === 'mqtts' ? 8883 : scheme === 'wss' ? 443 : scheme === 'ws' ? 80 : 1883);

    let path = '';
    if (scheme === 'ws' || scheme === 'wss') {
      path = hostPath || (d.connection_path && d.connection_path !== '/' ? d.connection_path : '') || '/mqtt';
      if (path && !path.startsWith('/')) path = '/' + path;
    }
    const url = `${scheme}://${hostname}:${port}${path}`;
    const username = cfg.username || undefined;
    const password = cfg.password || undefined;
    const rejectUnauthorized = cfg.rejectUnauthorized === true;

    const key = `${url}|${username || ''}|${password || ''}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key, url, topics: [], devices: [], sig: '',
        options: {
          clientId: `iot_ingestor_${crypto.createHash('md5').update(key).digest('hex').slice(0, 10)}_${Date.now()}`,
          username, password, reconnectPeriod: 10_000, connectTimeout: 15_000, clean: true, rejectUnauthorized,
        },
      };
      groups.set(key, g);
    }
    for (const t of topics) if (!g.topics.includes(t)) g.topics.push(t);
    g.devices.push({
      id: d.id, tenantId: d.tenant_id, name: d.name,
      devEui: d.lorawan_dev_eui || null, identifier: d.identifier, topic: topics[0],
    });
  }
  // Assinatura por grupo (detecta mudanças relevantes)
  for (const g of groups.values()) {
    g.topics.sort();
    g.sig = JSON.stringify([
      g.url, g.options.username || '', g.options.password || '',
      g.topics,
      g.devices.map(d => `${d.id}:${normId(d.devEui)}:${d.topic}`).sort(),
    ]);
  }
  return groups;
}

function connectBroker(group: BrokerGroup) {
  console.log(`[MQTT Ingestor] Conectando broker ${group.url} (${group.devices.length} disp., tópicos: ${group.topics.join(', ')})`);
  let client: MqttClient;
  try {
    client = mqtt.connect(group.url, group.options);
  } catch (e: any) {
    console.error(`[MQTT Ingestor] Falha ao conectar ${group.url}:`, e.message);
    return;
  }

  client.on('connect', () => {
    client.subscribe(group.topics, { qos: 1 }, (err) => {
      if (err) console.error(`[MQTT Ingestor] ${group.url} erro ao assinar:`, err.message);
      else console.log(`[MQTT Ingestor] ${group.url} assinando ${group.topics.join(', ')}`);
    });
  });

  client.on('message', async (topic: string, payload: Buffer) => {
    try {
      const data = parsePayload(payload);
      const target = routeDevice(group, data);
      if (!target) {
        console.warn(`[MQTT Ingestor] ${group.url} msg em "${topic}" sem dispositivo correspondente — ignorada`);
        return;
      }
      if (isDuplicate(target.id, data, payload)) return;
      await persist(target.id, target.tenantId, topic, data);
      await recordSosAlert(target, data);
    } catch (e: any) {
      console.error(`[MQTT Ingestor] ${group.url} erro ao processar msg:`, e.message);
    }
  });

  client.on('error', (err) => console.error(`[MQTT Ingestor] ${group.url} erro:`, err.message));

  clients.set(group.key, { sig: group.sig, client });
}

async function reload() {
  let rows: any[];
  try {
    rows = await query<any>(
      `SELECT id, tenant_id, name, identifier, lorawan_dev_eui,
              connection_host, connection_port, connection_protocol, connection_path, connection_config
       FROM devices
       WHERE communication = 'mqtt' AND connection_host IS NOT NULL`
    );
  } catch (e: any) {
    console.error('[MQTT Ingestor] Erro ao carregar dispositivos:', e.message);
    return;
  }

  const groups = buildGroups(rows);

  // Encerra brokers que sumiram ou cuja config/dispositivos mudaram
  for (const [key, entry] of clients) {
    const g = groups.get(key);
    if (!g || g.sig !== entry.sig) {
      console.log(`[MQTT Ingestor] Encerrando conexão ${key.split('|')[0]} (removido/alterado)`);
      entry.client.end(true);
      clients.delete(key);
    }
  }

  // Abre/atualiza os brokers desejados
  for (const g of groups.values()) {
    if (!clients.has(g.key)) connectBroker(g);
  }
}

export function startMqttIngestor() {
  if (started) return;
  started = true;
  console.log('[MQTT Ingestor] Iniciando...');
  reload().catch(e => console.error('[MQTT Ingestor] reload inicial falhou:', e.message));
  setInterval(() => reload().catch(() => {}), RELOAD_INTERVAL_MS);
}

export function getMqttIngestorStatus() {
  return { active_brokers: clients.size, brokers: [...clients.keys()].map(k => k.split('|')[0]) };
}
