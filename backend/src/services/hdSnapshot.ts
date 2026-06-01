import http from 'http';
import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import { decryptPassword, makeDigestAuth } from './facePolling';

// Mesma pasta usada pelo facePolling/webhook (montada em /var/groupates/event-snapshots no host).
const SNAPSHOT_DIR = process.env.EVENT_SNAPSHOTS_DIR || '/app/data/event-snapshots';

// Snapshot em ALTA resolução (4MP, sensor real comprovado) — channel main com resolução explícita.
// A câmera entrega 2688x1520 sob demanda mesmo com o stream principal configurado em 720p.
const HD_PATH = '/ISAPI/Streaming/channels/101/picture?videoResolutionWidth=2688&videoResolutionHeight=1520';
const REQ_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3; // 1 tentativa + 2 retries (o 4MP às vezes dá timeout ~3s quando a câmera está ocupada)

interface HdCam {
  ip_address: string;
  username: string | null;
  password_enc: Buffer | null;
}

/**
 * Baixa UMA vez o snapshot HD via digest (reusando o helper de facePolling).
 * Resolve com o Buffer do JPEG ou null em falha/timeout.
 */
function fetchHdOnce(cam: HdCam, username: string, password: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const req1 = http.request({
      host: cam.ip_address,
      port: 80,
      path: HD_PATH,
      method: 'GET',
      timeout: REQ_TIMEOUT_MS,
    }, (res1) => {
      if (res1.statusCode === 200) {
        const chunks: Buffer[] = [];
        res1.on('data', (c: Buffer) => chunks.push(c));
        res1.on('end', () => resolve(Buffer.concat(chunks)));
        res1.on('error', () => resolve(null));
        return;
      }
      if (res1.statusCode !== 401) { res1.resume(); return resolve(null); }
      const wwwAuth = res1.headers['www-authenticate'] || '';
      res1.resume();
      const authHeader = makeDigestAuth(wwwAuth, 'GET', HD_PATH, username, password);
      const req2 = http.request({
        host: cam.ip_address,
        port: 80,
        path: HD_PATH,
        method: 'GET',
        timeout: REQ_TIMEOUT_MS,
        headers: { 'Authorization': authHeader, 'Accept': '*/*' },
      }, (res2) => {
        if (res2.statusCode !== 200) { res2.resume(); return resolve(null); }
        const chunks: Buffer[] = [];
        res2.on('data', (c: Buffer) => chunks.push(c));
        res2.on('end', () => resolve(Buffer.concat(chunks)));
        res2.on('error', () => resolve(null));
      });
      req2.on('error', () => resolve(null));
      req2.on('timeout', () => { req2.destroy(); resolve(null); });
      req2.end();
    });
    req1.on('error', () => resolve(null));
    req1.on('timeout', () => { req1.destroy(); resolve(null); });
    req1.end();
  });
}

/**
 * Puxa o snapshot HD (2688x1520) da câmera no instante do evento, com retry.
 * Salva em SNAPSHOT_DIR/hd_<eventId>_<ts>.jpg e retorna a URL /snapshots/... .
 * Retorna null se todas as tentativas falharem (o chamador mantém o fluxo atual — NÃO quebra nada).
 */
export async function pullHdSnapshot(cameraId: number, eventId: number | string): Promise<string | null> {
  let cam: HdCam | null = null;
  try {
    const r = await pool.query(
      `SELECT host(ip_address) as ip_address, username, password_enc FROM ip_cameras WHERE id=$1`,
      [cameraId]
    );
    cam = r.rows[0] || null;
  } catch (e: any) {
    console.error(`[hd-snapshot] erro ao buscar câmera ${cameraId}:`, e.message);
    return null;
  }
  if (!cam || !cam.ip_address || cam.ip_address === '0.0.0.0' || cam.ip_address === '') {
    console.log(`[hd-snapshot] câmera ${cameraId} sem IP utilizável — pulando HD`);
    return null;
  }
  const username = cam.username || '';
  const password = cam.password_enc ? decryptPassword(cam.password_enc) : '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t0 = Date.now();
    const buf = await fetchHdOnce(cam, username, password);
    const ms = Date.now() - t0;
    if (buf && buf.length > 5000) {
      try {
        fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
        const filename = `hd_${eventId}_${Date.now()}.jpg`;
        fs.writeFileSync(path.join(SNAPSHOT_DIR, filename), buf);
        console.log(`[hd-snapshot] evento ${eventId}: HD ${buf.length}b em ${ms}ms (tentativa ${attempt}/${MAX_ATTEMPTS})`);
        return `/snapshots/${filename}`;
      } catch (e: any) {
        console.error(`[hd-snapshot] evento ${eventId}: erro ao salvar:`, e.message);
        return null;
      }
    }
    console.log(`[hd-snapshot] evento ${eventId}: tentativa ${attempt}/${MAX_ATTEMPTS} falhou (${ms}ms)`);
  }
  console.log(`[hd-snapshot] evento ${eventId}: HD indisponível após ${MAX_ATTEMPTS} tentativas — mantém recorte do webhook`);
  return null;
}
