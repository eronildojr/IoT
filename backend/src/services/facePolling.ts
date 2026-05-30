import http from 'http';
import crypto from 'crypto';
import pool from '../config/db';

interface CameraConfig {
  id: number;
  name: string;
  ip_address: string;
  username: string | null;
  password_enc: Buffer | null;
}

function decryptPassword(encBuf: Buffer): string {
  try {
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'iot-platform-secret-key-32bytes!!';
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const iv = encBuf.slice(0, 12);
    const tag = encBuf.slice(12, 28);
    const encrypted = encBuf.slice(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
  } catch {
    return '';
  }
}

function makeDigestAuth(wwwAuth: string, method: string, uri: string, username: string, password: string): string {
  const realm = (wwwAuth.match(/realm="([^"]+)"/) || [])[1] || '';
  const nonce = (wwwAuth.match(/nonce="([^"]+)"/) || [])[1] || '';
  const qop = ((wwwAuth.match(/qop="([^"]+)"/) || wwwAuth.match(/qop=([^,\s]+)/) || [])[1] || '').trim();
  
  const ha1 = crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest('hex');
  const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
  const nc = '00000001';
  const cnonce = crypto.randomBytes(16).toString('base64').replace(/[+/=]/g, '').slice(0, 16);
  
  let response: string;
  if (qop) {
    response = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex');
  } else {
    response = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
  }
  
  let auth = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  if (qop) auth += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  return auth;
}

async function saveFaceEvent(cam: CameraConfig, eventType: string, snapshotUrl?: string) {
  try {
    // Registrar em employee_recognitions com employee_id null (desconhecido)
    await pool.query(
      `INSERT INTO employee_recognitions (employee_id, employee_name, camera_id, camera_name, location, snapshot_url, confidence, recognized_at)
       VALUES (NULL, $1, $2, $3, $4, $5, $6, NOW())`,
      ['Desconhecido', cam.id, cam.name, cam.name, snapshotUrl || null, 0]
    );
    console.log(`[FacePolling] Evento ${eventType} registrado da câmera ${cam.name}`);
  } catch (err: any) {
    console.error('[FacePolling] Erro ao salvar evento:', err.message);
  }
}

function pollCameraAlertStream(cam: CameraConfig) {
  const password = cam.password_enc ? decryptPassword(cam.password_enc) : '';
  if (!password) {
    console.warn(`[FacePolling] Câmera ${cam.name}: sem senha configurada`);
    setTimeout(() => pollCameraAlertStream(cam), 30000);
    return;
  }
  
  const username = cam.username || 'admin';
  const url = '/ISAPI/Event/notification/alertStream';
  
  console.log(`[FacePolling] Iniciando polling da câmera ${cam.name} (${cam.ip_address})`);
  
  // Step 1: GET sem auth para obter o challenge Digest
  const req1 = http.request({
    host: cam.ip_address,
    port: 80,
    path: url,
    method: 'GET',
    timeout: 8000
  }, (res1) => {
    const wwwAuth = res1.headers['www-authenticate'] || '';
    // Consumir o body do 401
    res1.resume();
    res1.on('end', () => {
      if (res1.statusCode !== 401 || !wwwAuth) {
        console.warn(`[FacePolling] Câmera ${cam.name}: esperado 401, recebido ${res1.statusCode}`);
        setTimeout(() => pollCameraAlertStream(cam), 15000);
        return;
      }
      
      const authHeader = makeDigestAuth(wwwAuth, 'GET', url, username, password);
      
      // Step 2: GET com Digest Auth - nova conexão
      const req2 = http.request({
        host: cam.ip_address,
        port: 80,
        path: url,
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'multipart/x-mixed-replace, application/xml, */*',
          'Connection': 'keep-alive'
        }
        // Sem timeout - stream de longa duração
      }, (res2) => {
        if (res2.statusCode !== 200) {
          console.warn(`[FacePolling] Câmera ${cam.name}: stream retornou ${res2.statusCode}`);
          res2.resume();
          setTimeout(() => pollCameraAlertStream(cam), 15000);
          return;
        }
        
        console.log(`[FacePolling] Conectado ao stream da câmera ${cam.name} (${res2.headers['content-type']})`);
        
        let buffer = '';
        
        res2.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
          
          // Manter buffer gerenciável
          if (buffer.length > 100000) {
            buffer = buffer.slice(-20000);
          }
          
          // Procurar eventos XML completos
          let xmlStart = buffer.indexOf('<?xml');
          while (xmlStart !== -1) {
            const xmlEnd = buffer.indexOf('</EventNotificationAlert>', xmlStart);
            if (xmlEnd === -1) break;
            
            const xmlText = buffer.slice(xmlStart, xmlEnd + '</EventNotificationAlert>'.length);
            buffer = buffer.slice(xmlEnd + '</EventNotificationAlert>'.length);
            
            // Parsear o tipo de evento
            const eventTypeMatch = xmlText.match(/<eventType>([^<]+)<\/eventType>/);
            const eventType = eventTypeMatch ? eventTypeMatch[1] : 'unknown';
            
            console.log(`[FacePolling] Evento recebido da câmera ${cam.name}: ${eventType}`);
            
            // Registrar eventos de face
            if (eventType === 'faceSnap' || eventType === 'face' || eventType.toLowerCase().includes('face')) {
              saveFaceEvent(cam, eventType);
            }
            
            xmlStart = buffer.indexOf('<?xml');
          }
        });
        
        res2.on('end', () => {
          console.log(`[FacePolling] Stream da câmera ${cam.name} encerrado, reconectando...`);
          setTimeout(() => pollCameraAlertStream(cam), 5000);
        });
        
        res2.on('error', (err: Error) => {
          console.error(`[FacePolling] Erro no stream da câmera ${cam.name}:`, err.message);
          setTimeout(() => pollCameraAlertStream(cam), 10000);
        });
      });
      
      req2.on('error', (err: Error) => {
        console.error(`[FacePolling] Erro na conexão com câmera ${cam.name}:`, err.message);
        setTimeout(() => pollCameraAlertStream(cam), 15000);
      });
      
      req2.end();
    });
  });
  
  req1.on('error', (err: Error) => {
    console.error(`[FacePolling] Erro ao conectar câmera ${cam.name}:`, err.message);
    setTimeout(() => pollCameraAlertStream(cam), 30000);
  });
  
  req1.on('timeout', () => {
    console.warn(`[FacePolling] Timeout ao conectar câmera ${cam.name}`);
    req1.destroy();
    setTimeout(() => pollCameraAlertStream(cam), 30000);
  });
  
  req1.end();
}

export async function startFacePolling() {
  try {
    const result = await pool.query(
      `SELECT id, name, host(ip_address) as ip_address, username, password_enc 
       FROM ip_cameras 
       WHERE facial_recognition_enabled = true AND active = true 
       AND host(ip_address) NOT IN ('0.0.0.0', '')`
    );
    
    const cameras: CameraConfig[] = result.rows;
    console.log(`[FacePolling] Iniciando polling para ${cameras.length} câmera(s)`);
    
    for (const cam of cameras) {
      pollCameraAlertStream(cam);
    }
  } catch (err: any) {
    console.error('[FacePolling] Erro ao buscar câmeras:', err.message);
    setTimeout(startFacePolling, 30000);
  }
}
