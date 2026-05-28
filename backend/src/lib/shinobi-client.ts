import axios, { AxiosInstance } from 'axios';

interface ShinobiConfig {
  baseUrl: string;
  groupKey: string;
  apiKey: string;
}

function loadConfig(): ShinobiConfig {
  const baseUrl = process.env.SHINOBI_BASE_URL;
  const groupKey = process.env.SHINOBI_GROUP_KEY;
  const apiKey = process.env.SHINOBI_API_KEY;
  if (!baseUrl || !groupKey || !apiKey) {
    throw new Error('[shinobi] SHINOBI_BASE_URL / SHINOBI_GROUP_KEY / SHINOBI_API_KEY not set');
  }
  return { baseUrl, groupKey, apiKey };
}

let _http: AxiosInstance | null = null;
function http(): AxiosInstance {
  if (_http) return _http;
  const cfg = loadConfig();
  _http = axios.create({
    baseURL: cfg.baseUrl,
    timeout: 15000,
    validateStatus: (s) => s < 500,
  });
  return _http;
}

function apiBase(): string {
  const cfg = loadConfig();
  return `/${cfg.apiKey}`;
}

export function getGroupKey(): string {
  return loadConfig().groupKey;
}

export interface MonitorPayload {
  monitorId: string;
  name: string;
  rtspUrl: string;
  mode?: 'start' | 'stop' | 'record';
}

export async function upsertMonitor(p: MonitorPayload): Promise<void> {
  const cfg = loadConfig();
  const monitorConfig: Record<string, unknown> = {
    mid: p.monitorId,
    ke: cfg.groupKey,
    name: p.name,
    type: 'h264',
    protocol: 'rtsp',
    host: p.rtspUrl,
    path: '',
    port: '',
    mode: p.mode || 'start',
    details: JSON.stringify({
      auto_host: p.rtspUrl,
      rtsp_transport: 'tcp',
      sfps: '5',
      stream_fps: '5',
      stream_type: 'hls',
      hls_time: '2',
      hls_list_size: '4',
      stream_quality: '1',
      snap: '1',
      snap_fps: '1',
      is_onvif: 'no',
      input_map_choices: '',
    }),
  };

  // Shinobi expects the config wrapped: { data: JSON.stringify(monitorConfig) }
  const res = await http().post(
    `${apiBase()}/configureMonitor/${cfg.groupKey}/${p.monitorId}`,
    { data: JSON.stringify(monitorConfig) },
  );
  if (res.status >= 400 || (res.data && res.data.ok === false)) {
    throw new Error(`Shinobi configureMonitor failed: ${res.status} ${JSON.stringify(res.data).slice(0, 300)}`);
  }
  console.log(`[shinobi] upsertMonitor ${p.monitorId}: ok=${res.data?.ok}`);
}

export async function deleteMonitor(monitorId: string): Promise<void> {
  const cfg = loadConfig();
  const res = await http().post(
    `${apiBase()}/configureMonitor/${cfg.groupKey}/${monitorId}/delete`,
    {},
  );
  if (res.status >= 400 && res.status !== 404) {
    throw new Error(`Shinobi deleteMonitor failed: ${res.status}`);
  }
  console.log(`[shinobi] deleteMonitor ${monitorId}: ${res.status}`);
}

export async function setMonitorMode(monitorId: string, mode: 'start' | 'stop' | 'record'): Promise<void> {
  const cfg = loadConfig();
  const res = await http().get(
    `${apiBase()}/monitor/${cfg.groupKey}/${monitorId}/${mode}`,
  );
  if (res.status >= 400) {
    throw new Error(`Shinobi setMode failed: ${res.status}`);
  }
}

export async function getSnapshotBuffer(monitorId: string): Promise<Buffer | null> {
  const cfg = loadConfig();
  try {
    const res = await http().get(
      `${apiBase()}/jpeg/${cfg.groupKey}/${monitorId}/s.jpg`,
      { responseType: 'arraybuffer', timeout: 8000 },
    );
    if (res.status !== 200) return null;
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (buf.length < 500) return null;
    return buf;
  } catch {
    return null;
  }
}

export async function listMonitors(): Promise<unknown[]> {
  const cfg = loadConfig();
  const res = await http().get(`${apiBase()}/monitor/${cfg.groupKey}`);
  if (res.status !== 200) return [];
  return Array.isArray(res.data) ? res.data : [];
}

export function buildStreamUrls(monitorId: string): { snapshot: string; hls: string; mjpeg: string } {
  // Return public-facing URLs that go through our backend proxy
  return {
    snapshot: `/api/ip-cameras/by-monitor/${monitorId}/snapshot.jpg`,
    hls: `/api/ip-cameras/by-monitor/${monitorId}/stream.m3u8`,
    mjpeg: `/api/ip-cameras/by-monitor/${monitorId}/stream.mjpeg`,
  };
}

export function buildInternalMjpegUrl(monitorId: string): string {
  const cfg = loadConfig();
  return `${cfg.baseUrl}/${cfg.apiKey}/mjpeg/${cfg.groupKey}/${monitorId}`;
}

export function buildInternalHlsUrl(monitorId: string): string {
  const cfg = loadConfig();
  return `${cfg.baseUrl}/${cfg.apiKey}/hls/${cfg.groupKey}/${monitorId}/s.m3u8`;
}

export function buildInternalHlsSegmentUrl(monitorId: string, segment: string): string {
  const cfg = loadConfig();
  return `${cfg.baseUrl}/${cfg.apiKey}/hls/${cfg.groupKey}/${monitorId}/${segment}`;
}
