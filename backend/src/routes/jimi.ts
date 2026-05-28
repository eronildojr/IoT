import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/db';
import { auth, requireRole } from '../middleware/auth';
import axios from 'axios';
import * as crypto from 'crypto';

const router = Router();

// ====== HELPERS ======

async function getConfig() {
  return queryOne<any>('SELECT * FROM jimi_config LIMIT 1');
}

async function verifyPushToken(token: string): Promise<boolean> {
  const cfg = await getConfig();
  return !!(cfg && cfg.push_token && cfg.push_token === token);
}

function parseDataList(raw: string): any[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch { return []; }
}

async function logPush(endpoint: string, imei: string | null, payload: any, status = 'ok') {
  try {
    await query('INSERT INTO jimi_push_log(endpoint, imei, payload, status) VALUES($1,$2,$3,$4)',
      [endpoint, imei, JSON.stringify(payload), status]);
  } catch {}
}

// -- JIMI Open API (TrackSolid Pro) --
function openApiSign(params: Record<string, string>, secret: string): string {
  const sorted = Object.entries(params).filter(([k]) => k !== 'sign').sort(([a], [b]) => a.localeCompare(b));
  const s = sorted.map(([, v]) => v).join('');
  return crypto.createHash('md5').update(secret + s + secret).digest('hex').toUpperCase();
}

async function openApiCall(cfg: any, method: string, extra: Record<string, string> = {}) {
  const baseUrl = cfg.open_api_url || 'https://eu-open.tracksolidpro.com/route/rest';
  const params: Record<string, string> = {
    method,
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    app_key: cfg.app_key,
    sign_method: 'md5',
    v: '1.0',
    format: 'json',
    ...extra,
  };
  if (cfg.access_token) params.access_token = cfg.access_token;
  params.sign = openApiSign(params, cfg.app_secret);
  const resp = await axios.post(baseUrl, params, { timeout: 15000 });
  return resp.data;
}

function getMissingConfig(cfg: any): string[] {
  if (!cfg) return ['Nenhuma configuracao JIMI encontrada'];
  const missing: string[] = [];
  const hasOpenApi = cfg.app_key && cfg.app_secret;
  const hasIotHub = cfg.hub_base_url && cfg.api_key;
  if (!hasOpenApi && !hasIotHub) {
    if (!cfg.app_key) missing.push('App Key (Open API)');
    if (!cfg.app_secret) missing.push('App Secret (Open API)');
    if (!cfg.hub_base_url) missing.push('URL do IoT Hub');
    if (!cfg.api_key) missing.push('API Key (IoT Hub)');
  }
  return missing;
}

// -- IoT Hub Request API --
async function sendInstruct(imei: string, proNo: number, cmdContent: any, options: any = {}) {
  const cfg = await getConfig();
  if (!cfg?.hub_base_url || !cfg?.api_key) {
    throw new Error('JIMI IoT Hub nao configurado');
  }
  const serverFlagId = Date.now();
  const params: any = {
    deviceImei: imei,
    cmdContent: typeof cmdContent === 'string' ? cmdContent : JSON.stringify(cmdContent),
    serverFlagId: String(serverFlagId),
    proNo: String(proNo),
    platform: 'web',
    requestId: `iot_${serverFlagId}`,
    token: cfg.api_key,
  };
  if (options.sync !== undefined) params.sync = options.sync;
  if (options.offlineFlag !== undefined) params.offlineFlag = options.offlineFlag;
  if (options.timeOut) params.timeOut = options.timeOut;

  try {
    const resp = await axios.post(
      `${cfg.hub_base_url}/api/device/sendInstruct`,
      new URLSearchParams(params).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 35000 }
    );
    return { ...resp.data, serverFlagId };
  } catch (err: any) {
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      throw new Error(`IoT Hub nao respondeu (${cfg.hub_base_url}). Verifique a URL nas configuracoes.`);
    }
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      throw new Error(`IoT Hub inacessivel (${cfg.hub_base_url}). Verifique a URL nas configuracoes.`);
    }
    throw err;
  }
}

// ====== PUSH ENDPOINTS (recebidos do JIMI IoT Hub) ======
// Content-Type: application/x-www-form-urlencoded
// Params: token, data_list (JSON string)

// 1. Login/Logout
router.post('/pushevent', async (req: Request, res: Response) => {
  const { token, data_list } = req.body;
  if (!await verifyPushToken(token)) return res.json({ code: 1, msg: 'invalid token' });
  const events = parseDataList(data_list);
  for (const e of events) {
    const imei = e.deviceImei;
    const status = e.type === 'LOGIN' ? 'online' : 'offline';
    await query(`UPDATE jimi_cameras SET status=$1, last_seen=NOW() WHERE imei=$2`, [status, imei]);
    await logPush('pushevent', imei, e);
  }
  return res.json({ code: 0, msg: 'success' });
});

// 2. Heartbeat
router.post('/pushhb', async (req: Request, res: Response) => {
  const { token, data_list } = req.body;
  if (!await verifyPushToken(token)) return res.json({ code: 1, msg: 'invalid token' });
  const beats = parseDataList(data_list);
  for (const hb of beats) {
    const imei = hb.deviceImei;
    await query(
      `INSERT INTO device_heartbeats(imei, gate_time, power_level, gsm_signal, acc, gps_pos)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [imei, hb.gateTime, hb.powerLevel, hb.gsmSign, hb.acc, hb.gpsPos]
    );
    await query(
      `UPDATE jimi_cameras SET last_seen=NOW(), power_level=$1, gsm_signal=$2, acc=$3 WHERE imei=$4`,
      [hb.powerLevel, hb.gsmSign, hb.acc, imei]
    );
  }
  return res.json({ code: 0, msg: 'success' });
});

// 3. GPS
router.post('/pushgps', async (req: Request, res: Response) => {
  const { token, data_list } = req.body;
  if (!await verifyPushToken(token)) return res.json({ code: 1, msg: 'invalid token' });
  const points = parseDataList(data_list);
  for (const gps of points) {
    const imei = gps.deviceImei;
    await query(
      `INSERT INTO device_gps(imei, gps_time, gate_time, lat, lng, speed, direction, altitude, satellites, acc, post_type)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [imei, gps.gpsTime, gps.gateTime, gps.lat, gps.lng, gps.gpsSpeed,
       gps.direction, gps.altitude, gps.satelliteNum, gps.acc, gps.postType]
    );
    await query(
      `UPDATE jimi_cameras SET last_lat=$1, last_lng=$2, last_gps_time=$3,
       speed=$4, direction=$5, acc=$6, status='online', last_seen=NOW() WHERE imei=$7`,
      [gps.lat, gps.lng, gps.gpsTime, gps.gpsSpeed, gps.direction, gps.acc, imei]
    );
  }
  return res.json({ code: 0, msg: 'success' });
});

// 4. Alarmes
router.post('/pushalarm', async (req: Request, res: Response) => {
  const { token, data_list } = req.body;
  if (!await verifyPushToken(token)) return res.json({ code: 1, msg: 'invalid token' });
  const alarms = parseDataList(data_list);
  for (const alarm of alarms) {
    const msgClass = parseInt(alarm.msgClass) || 0;
    const msg = alarm.msg || alarm;
    const imei = msg.deviceImei || alarm.deviceImei;
    await query(
      `INSERT INTO device_alarms(imei, alarm_type, alarm_time, lat, lng, speed, alert_value, file_name, gate_time, msg_class, extra)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [imei, msg.alertType, msg.alarmTime, msg.lat, msg.lng, msg.gpsSpeed,
       msg.alertValue, msg.file, alarm.gateTime, msgClass, JSON.stringify(msg)]
    );
    await logPush('pushalarm', imei, alarm);
  }
  return res.json({ code: 0, msg: 'success' });
});

// 5. File upload notification
router.post('/pushfileupload', async (req: Request, res: Response) => {
  const { token, data_list } = req.body;
  if (!await verifyPushToken(token)) return res.json({ code: 1, msg: 'invalid token' });
  const uploads = parseDataList(data_list);
  for (const up of uploads) {
    const imei = up.deviceImei;
    const fileNames = (up.fileName || '').split(';').filter((f: string) => f.trim());
    for (const fname of fileNames) {
      await query(
        `INSERT INTO device_media_files(imei, file_name, upload_result, created_at) VALUES($1,$2,$3,NOW())`,
        [imei, fname.trim(), up.result || 'SUCCESS']
      );
    }
    await logPush('pushfileupload', imei, up);
  }
  return res.json({ code: 0, msg: 'success' });
});

// 6. IoTHub Events
router.post('/pushIothubEvent', async (req: Request, res: Response) => {
  const { token, data_list } = req.body;
  if (!await verifyPushToken(token)) return res.json({ code: 1, msg: 'invalid token' });
  const events = parseDataList(data_list);
  for (const ev of events) {
    let content = ev.eventContent;
    if (typeof content === 'string') { try { content = JSON.parse(content); } catch {} }
    await query(
      `INSERT INTO iothub_events(imei, event_type, event_content, gate_time) VALUES($1,$2,$3,$4)`,
      [ev.deviceImei, ev.eventType, JSON.stringify(content), ev.gateTime]
    );
  }
  return res.json({ code: 0, msg: 'success' });
});

// 7. DVR Upload Callback
router.post('/uploadCallback', async (req: Request, res: Response) => {
  const { token, data_list } = req.body;
  if (!await verifyPushToken(token)) return res.json({ code: 1, msg: 'invalid token' });
  const items = parseDataList(data_list);
  const cfg = await getConfig();
  for (const item of items) {
    const fileUrl = cfg?.file_storage_url ? `${cfg.file_storage_url}/${item.filename}` : null;
    await query(
      `INSERT INTO device_media_files(imei, file_name, file_url, business_type, camera_channel,
       mime_type, lat, lng, alarm_time, instruction_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [item.imei, item.filename, fileUrl, item.businessType, item.camera,
       item.mimeType, item.lat, item.lng, item.alarmTime, item.instructionId]
    );
    await logPush('uploadCallback', item.imei, item);
  }
  return res.json({ code: 0, msg: 'success' });
});

// 8-9. Resource list + Instruct response
router.post('/pushresourcelist', async (req: Request, res: Response) => {
  const { token, data_list } = req.body;
  if (!await verifyPushToken(token)) return res.json({ code: 1, msg: 'invalid token' });
  for (const item of parseDataList(data_list)) {
    await query(`INSERT INTO iothub_events(imei,event_type,event_content,gate_time) VALUES($1,'resourcelist',$2,NOW())`,
      [item.imei, JSON.stringify(item)]);
  }
  return res.json({ code: 0, msg: 'success' });
});

router.post('/pushInstructResponse', async (req: Request, res: Response) => {
  const { token, data_list, msgType } = req.body;
  if (!await verifyPushToken(token)) return res.json({ code: 1, msg: 'invalid token' });
  for (const item of parseDataList(data_list)) {
    const imei = item.data?._imei || 'unknown';
    await query(`INSERT INTO iothub_events(imei,event_type,event_content,gate_time) VALUES($1,$2,$3,NOW())`,
      [imei, `instructResponse_${msgType}`, JSON.stringify(item)]);
  }
  return res.json({ code: 0, msg: 'success' });
});

// Stubs
for (const ep of ['pushoil', 'pushtem', 'pushlbs', 'pushftpfileupload', 'pushPassThroughData',
  'pushTerminalTransInfo', 'pushFileContent', 'pushextendedkks', 'pushobd',
  'pushfaultinfo', 'pushtripreport', 'rfid', 'wgtc']) {
  router.post(`/${ep}`, async (req: Request, res: Response) => {
    const { token, data_list } = req.body;
    if (!await verifyPushToken(token)) return res.json({ code: 1, msg: 'invalid token' });
    try { for (const item of parseDataList(data_list)) { await logPush(ep, item.deviceImei || item.imei || null, item); } } catch {}
    return res.json({ code: 0, msg: 'success' });
  });
}

// ====== REQUEST APIs ======

// Live Stream: tenta Open API primeiro, fallback IoT Hub
router.post('/request/stream/start', auth, async (req: Request, res: Response) => {
  const { imei, channel } = req.body;
  if (!imei) return res.status(400).json({ error: 'IMEI obrigatorio' });

  const cfg = await getConfig();
  const missing = getMissingConfig(cfg);
  if (missing.length > 0) {
    return res.status(400).json({ ok: false, error: 'not_configured', missing_fields: missing,
      message: 'Configure o JIMI IoT Hub em Configuracoes antes de usar o Live Stream.' });
  }

  // Opcao A: Open API (jimi.device.live.page.url) — retorna URL de iframe
  if (cfg.app_key && cfg.app_secret) {
    try {
      const result = await openApiCall(cfg, 'jimi.device.live.page.url', {
        imei, type: '1', voice: '0',
      });
      if (result.code === 0 && result.result) {
        const url = result.result.UrlCamera || result.result.url || result.result;
        return res.json({ ok: true, method: 'open_api', stream_url: url, imei });
      }
      // Erro da Open API — tentar IoT Hub se disponivel
      if (!cfg.hub_base_url || !cfg.api_key) {
        const errMsg = result.code === 1003 ? 'Token expirado. Atualize o Access Token nas configuracoes.'
          : result.code === 1001 ? 'App Key/Secret invalidos.'
          : result.message || `Erro JIMI (code ${result.code})`;
        return res.json({ ok: false, error: errMsg, code: result.code });
      }
    } catch (err: any) {
      // Se tem IoT Hub como fallback, continuar
      if (!cfg.hub_base_url || !cfg.api_key) {
        return res.status(502).json({ ok: false, error: err.message });
      }
    }
  }

  // Opcao B: IoT Hub Request API 37121
  if (cfg.hub_base_url && cfg.api_key) {
    try {
      const hubUrl = new URL(cfg.hub_base_url);
      const videoIP = hubUrl.hostname;
      const result = await sendInstruct(imei, 37121, {
        dataType: '0', codeStreamType: '0', channel: String(channel || 1),
        videoIP, videoTCPPort: '10002', videoUDPPort: '0',
      }, { timeOut: 30 });
      const ch = channel || 1;
      return res.json({
        ok: true, method: 'iot_hub', result,
        stream: { flv: `http://${videoIP}:8881/${ch}/${imei}.flv`, rtmp: `rtmp://${videoIP}:1936/${ch}/${imei}` },
        imei, channel: ch,
      });
    } catch (err: any) {
      return res.status(502).json({ ok: false, error: err.message });
    }
  }

  return res.status(400).json({ ok: false, error: 'not_configured', missing_fields: ['App Key ou IoT Hub URL'] });
});

router.post('/request/stream/stop', auth, async (req: Request, res: Response) => {
  const { imei, channel } = req.body;
  if (!imei) return res.status(400).json({ error: 'IMEI obrigatorio' });
  try {
    const result = await sendInstruct(imei, 37122, { channel: channel || 1, cmd: '0', dataType: '0', codeStreamType: 0 });
    return res.json({ ok: true, result });
  } catch (err: any) {
    return res.json({ ok: false, error: err.message });
  }
});

// Foto imediata
router.post('/request/photo', auth, async (req: Request, res: Response) => {
  const { imei, channel } = req.body;
  if (!imei) return res.status(400).json({ error: 'IMEI obrigatorio' });
  const cfg = await getConfig();
  const missing = getMissingConfig(cfg);
  if (missing.length > 0) {
    return res.status(400).json({ ok: false, error: 'not_configured', missing_fields: missing });
  }
  try {
    const result = await sendInstruct(imei, 34817, { channel: channel || 1, shootCommand: 0, interval: 0, count: 1 });
    return res.json({ ok: true, result });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: err.message });
  }
});

// Query recursos
router.post('/request/resources', auth, async (req: Request, res: Response) => {
  const { imei, channel, beginTime, endTime } = req.body;
  if (!imei) return res.status(400).json({ error: 'IMEI obrigatorio' });
  try {
    const instructionID = `res_${Date.now()}`;
    const result = await sendInstruct(imei, 37381, {
      channel: channel || 0, beginTime: beginTime || '', endTime: endTime || '',
      alarmFlag: 0, resourceType: 0, codeType: 0, storageType: 0, instructionID,
    }, { sync: false });
    return res.json({ ok: true, result, instructionID });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: err.message });
  }
});

// Playback
router.post('/request/playback', auth, async (req: Request, res: Response) => {
  const { imei, channel, beginTime, endTime } = req.body;
  if (!imei) return res.status(400).json({ error: 'IMEI obrigatorio' });
  try {
    const cfg = await getConfig();
    const hubUrl = new URL(cfg!.hub_base_url);
    const instructionID = `play_${Date.now()}`;
    const result = await sendInstruct(imei, 37377, {
      serverAddress: hubUrl.hostname, tcpPort: '10003', udpPort: '0',
      channel: String(channel || 1), resourceType: '0', codeType: '0', storageType: '0',
      playMethod: '0', forwardRewind: '0', beginTime: beginTime || '', endTime: endTime || '',
      instructionID,
    });
    return res.json({ ok: true, result, instructionID });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: err.message });
  }
});

// Comando generico
router.post('/request/command', auth, requireRole('admin'), async (req: Request, res: Response) => {
  const { imei, content, sync } = req.body;
  if (!imei || !content) return res.status(400).json({ error: 'IMEI e content obrigatorios' });
  try {
    const result = await sendInstruct(imei, 128, content, { sync: sync !== false, offlineFlag: sync === false });
    return res.json({ ok: true, result });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: err.message });
  }
});

// ====== CONFIG ======

router.get('/config', auth, async (_req: Request, res: Response) => {
  const cfg = await getConfig();
  if (!cfg) return res.json({ configured: false });
  const hasOpenApi = !!(cfg.app_key && cfg.app_secret);
  const hasIotHub = !!(cfg.hub_base_url && cfg.api_key);
  return res.json({
    configured: hasOpenApi || hasIotHub,
    has_open_api: hasOpenApi,
    has_iot_hub: hasIotHub,
    hub_base_url: cfg.hub_base_url,
    open_api_url: cfg.open_api_url,
    push_token: cfg.push_token ? '***' + cfg.push_token.slice(-4) : null,
    api_key: cfg.api_key ? '***' + cfg.api_key.slice(-4) : null,
    app_key: cfg.app_key ? '***' + cfg.app_key.slice(-4) : null,
    app_secret: cfg.app_secret ? '***' : null,
    has_access_token: !!cfg.access_token,
    jimi_account: cfg.jimi_account,
    file_storage_url: cfg.file_storage_url,
    our_push_url: cfg.our_push_url,
    is_active: cfg.is_active,
    updated_at: cfg.updated_at,
  });
});

router.put('/config', auth, requireRole('admin'), async (req: Request, res: Response) => {
  const { hubBaseUrl, pushToken, apiKey, apiSecret, fileStorageUrl,
    openApiUrl, appKey, appSecret, accessToken, jimiAccount } = req.body;
  const existing = await getConfig();
  if (existing) {
    await query(
      `UPDATE jimi_config SET
       hub_base_url=COALESCE($1,hub_base_url), push_token=COALESCE($2,push_token),
       api_key=COALESCE($3,api_key), api_secret=COALESCE($4,api_secret),
       file_storage_url=COALESCE($5,file_storage_url),
       open_api_url=COALESCE($6,open_api_url), app_key=COALESCE($7,app_key),
       app_secret=COALESCE($8,app_secret), access_token=COALESCE($9,access_token),
       jimi_account=COALESCE($10,jimi_account), updated_at=NOW()
       WHERE id=$11`,
      [hubBaseUrl, pushToken, apiKey, apiSecret, fileStorageUrl,
       openApiUrl, appKey, appSecret, accessToken, jimiAccount, existing.id]
    );
  } else {
    await query(
      `INSERT INTO jimi_config(hub_base_url,push_token,api_key,api_secret,file_storage_url,open_api_url,app_key,app_secret,access_token,jimi_account)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [hubBaseUrl, pushToken, apiKey, apiSecret, fileStorageUrl, openApiUrl, appKey, appSecret, accessToken, jimiAccount]
    );
  }
  return res.json({ ok: true, message: 'Configuracao salva' });
});

router.post('/config/test', auth, async (_req: Request, res: Response) => {
  const cfg = await getConfig();
  if (!cfg) return res.json({ ok: false, error: 'Configuracao nao encontrada' });
  const checks: any = {
    hub_configured: !!(cfg.hub_base_url && cfg.api_key),
    open_api_configured: !!(cfg.app_key && cfg.app_secret),
    push_token_set: !!cfg.push_token,
  };

  // Testar Open API
  if (cfg.app_key && cfg.app_secret) {
    try {
      const r = await openApiCall(cfg, 'jimi.user.device.list', { target: cfg.jimi_account || '', page_no: '1', page_size: '1' });
      checks.open_api_reachable = true;
      checks.open_api_code = r.code;
      checks.open_api_ok = r.code === 0;
      if (r.code !== 0) checks.open_api_msg = r.message;
    } catch (err: any) {
      checks.open_api_reachable = false;
      checks.open_api_error = err.message;
    }
  }

  // Testar Hub
  if (cfg.hub_base_url) {
    try {
      const r = await axios.get(cfg.hub_base_url, { timeout: 5000, validateStatus: () => true });
      checks.hub_reachable = r.status < 500;
    } catch (err: any) {
      checks.hub_reachable = false;
      checks.hub_error = err.message;
    }
  }

  checks.push_endpoints = [
    'pushevent', 'pushhb', 'pushgps', 'pushalarm', 'pushfileupload',
    'pushIothubEvent', 'uploadCallback', 'pushresourcelist', 'pushInstructResponse',
  ].map(ep => ({ endpoint: `/api/jimi/${ep}`, status: 'ready' }));

  return res.json({ ok: true, ...checks });
});

// ====== DATA ======

router.get('/data/gps/:imei', auth, async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  return res.json(await query('SELECT * FROM device_gps WHERE imei=$1 ORDER BY gps_time DESC LIMIT $2', [req.params.imei, limit]));
});

router.get('/data/alarms/:imei', auth, async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20;
  return res.json(await query('SELECT * FROM device_alarms WHERE imei=$1 ORDER BY created_at DESC LIMIT $2', [req.params.imei, limit]));
});

router.get('/data/media/:imei', auth, async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20;
  return res.json(await query('SELECT * FROM device_media_files WHERE imei=$1 ORDER BY created_at DESC LIMIT $2', [req.params.imei, limit]));
});

router.get('/data/push-log', auth, async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  return res.json(await query('SELECT * FROM jimi_push_log ORDER BY created_at DESC LIMIT $1', [limit]));
});

export default router;
