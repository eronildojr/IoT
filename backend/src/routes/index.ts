import { publishMqtt, buildDeviceTopics } from "../lib/mqtt";
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, queryOne } from '../config/db';
import { auth, requireRole } from '../middleware/auth';
import axios from 'axios';
import { encryptPassword, decryptPassword } from '../lib/camera-crypto';
import * as shinobi from '../lib/shinobi-client';
import { XMLParser } from 'fast-xml-parser';
import multer from 'multer';
import crypto from 'crypto';
import * as fsPromises from 'fs/promises';
import path from 'path';


// ════════════════════════════════════════════════════════════
// PROVISIONAMENTO AUTOMÁTICO DE TENANT
// ════════════════════════════════════════════════════════════

const TRACCAR_URL = process.env.TRACCAR_URL || 'http://groupates_traccar:8082';
const TRACCAR_ADMIN = process.env.TRACCAR_ADMIN_USER || 'admin';
const TRACCAR_PASS = process.env.TRACCAR_ADMIN_PASS || 'admin';

async function provisionTenantTraccar(tenantId: string, tenantName: string, tenantEmail: string, adminEmail: string, adminPassword: string) {
  try {
    const auth = { username: TRACCAR_ADMIN, password: TRACCAR_PASS };

    // 1. Criar grupo no Traccar para o tenant
    const groupRes = await axios.post(`${TRACCAR_URL}/api/groups`, {
      name: tenantName,
      attributes: { tenantId }
    }, { auth });
    const groupId = groupRes.data.id;

    // 2. Criar usuário no Traccar para o admin do tenant
    const traccarPass = adminPassword || `${tenantName.replace(/\s/g, '')}@2025`;
    const userRes = await axios.post(`${TRACCAR_URL}/api/users`, {
      name: tenantName,
      email: adminEmail || tenantEmail,
      password: traccarPass,
      administrator: false,
      attributes: { tenantId }
    }, { auth });
    const traccarUserId = userRes.data.id;

    // 3. Vincular usuário ao grupo
    await axios.post(`${TRACCAR_URL}/api/permissions`, {
      userId: traccarUserId,
      groupId: groupId
    }, { auth });

    // 4. Salvar no banco
    await query(
      `UPDATE tenants SET
        traccar_group_id=$1, traccar_user_id=$2,
        traccar_user_email=$3, traccar_user_pass=$4,
        traccar_server_url=$5, provisioned_at=NOW()
       WHERE id=$6`,
      [groupId, traccarUserId, adminEmail || tenantEmail, traccarPass, TRACCAR_URL, tenantId]
    );

    console.log(`[PROVISION] Tenant ${tenantName} provisionado no Traccar: group=${groupId}, user=${traccarUserId}`);
    return { success: true, traccarGroupId: groupId, traccarUserId };
  } catch (err: any) {
    console.error(`[PROVISION ERROR] Traccar: ${err?.message || err}`);
    return { success: false, error: err?.message };
  }
}

const router = Router();

const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[SECURITY] JWT_SECRET nao definido! Defina a variavel de ambiente JWT_SECRET.');
  process.exit(1);
}

// ════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════

router.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Email inválido' });
  try {
    const user = await queryOne<any>(
      `SELECT u.*, t.name as tenant_name, t.slug, t.plan, t.is_active as tenant_active
       FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1 AND u.is_active = true`, [email]
    );
    if (!user) return res.status(401).json({ error: 'Email ou senha incorretos' });
    if (!user.tenant_active) return res.status(403).json({ error: 'Conta suspensa' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Email ou senha incorretos' });
    const token = jwt.sign({ id: user.id, tenantId: user.tenant_id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenant_id, tenantName: user.tenant_name, plan: user.plan } });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro interno' }); }
});

router.post('/auth/register', async (req: Request, res: Response) => {
  const { tenantName, name, email, password } = req.body;
  if (!tenantName || !name || !email || !password) return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Email inválido' });
  if (password.length < 8) return res.status(400).json({ error: 'Senha mínimo 8 caracteres' });
  try {
    const exists = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
    if (exists) return res.status(409).json({ error: 'Email já cadastrado' });
    let slug = tenantName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50);
    let i = 1;
    while (await queryOne('SELECT id FROM tenants WHERE slug = $1', [slug])) slug = `${slug}-${i++}`;
    const hash = await bcrypt.hash(password, 12);
    const tenant = await queryOne<any>(`INSERT INTO tenants(name,slug,email) VALUES($1,$2,$3) RETURNING *`, [tenantName, slug, email]);
    const user = await queryOne<any>(`INSERT INTO users(tenant_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'admin') RETURNING *`, [tenant!.id, name, email, hash]);
    const token = jwt.sign({ id: user!.id, tenantId: tenant!.id, email, name, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({ token, user: { id: user!.id, name, email, role: 'admin', tenantId: tenant!.id, tenantName } });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao criar conta' }); }
});

router.get('/auth/me', auth, async (req: Request, res: Response) => {
  const user = await queryOne<any>(
    `SELECT u.id,u.name,u.email,u.role,u.last_login_at,t.id as tenant_id,t.name as tenant_name,t.slug,t.plan,t.max_devices,t.max_users,t.is_active
     FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=$1`, [req.user!.id]
  );
  if (!user) return res.status(404).json({ error: 'Não encontrado' });
  return res.json(user);
});

// ════════════════════════════════════════════════════════════
// DEVICES
// ════════════════════════════════════════════════════════════

router.get('/devices', auth, async (req: Request, res: Response) => {
  const { status, protocol, type, search, page = '1', limit = '20' } = req.query as any;
  const off = (parseInt(page) - 1) * parseInt(limit);
  let sql = `SELECT d.*,dm.name as model_name,dm.category,COUNT(*) OVER() as total FROM devices d LEFT JOIN device_models dm ON dm.id=d.model_id WHERE d.tenant_id=$1`;
  const p: any[] = [req.tenantId]; let i = 2;
  if (status) { sql += ` AND d.status=$${i++}`; p.push(status); }
  if (protocol) { sql += ` AND d.protocol=$${i++}`; p.push(protocol); }
  if (type) { sql += ` AND d.type=$${i++}`; p.push(type); }
  if (search) { sql += ` AND (d.name ILIKE $${i} OR d.identifier ILIKE $${i})`; p.push(`%${search}%`); i++; }
  sql += ` ORDER BY d.updated_at DESC LIMIT $${i++} OFFSET $${i++}`;
  p.push(parseInt(limit), off);
  const rows = await query<any>(sql, p);
  return res.json({ devices: rows, total: parseInt(rows[0]?.total || 0), page: parseInt(page) });
});

router.get('/devices/stats', auth, async (req: Request, res: Response) => {
  const s = await queryOne<any>(
    `SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='online') as online, COUNT(*) FILTER(WHERE status='offline') as offline,
     COUNT(*) FILTER(WHERE status='warning') as warning, COUNT(*) FILTER(WHERE status='error') as error,
     COUNT(*) FILTER(WHERE type='tracker') as trackers, COUNT(*) FILTER(WHERE battery_level<20 AND battery_level IS NOT NULL) as low_battery
     FROM devices WHERE tenant_id=$1`, [req.tenantId]
  );
  return res.json(s);
});

// ============================================================
// Obter tópicos MQTT de um dispositivo (DEVE VIR ANTES de :id)
router.get('/devices/:id/mqtt-topics', auth, async (req: Request, res: Response) => {
  const d = await queryOne<any>('SELECT id, tenant_id, identifier, mqtt_topic_telemetry, mqtt_topic_command, mqtt_topic_status, mqtt_username, mqtt_password FROM devices WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  if (!d) return res.status(404).json({ error: 'Dispositivo não encontrado' });
  const topics = buildDeviceTopics(req.tenantId as string, d.id as string);
  return res.json({
    device_id: d.id,
    identifier: d.identifier,
    topics: {
      telemetry: d.mqtt_topic_telemetry || topics.telemetry,
      command: d.mqtt_topic_command || topics.command,
      status: d.mqtt_topic_status || topics.status,
    },
    credentials: {
      host: process.env.MQTT_HOST || '104.237.5.59',
      port: 1883,
      websocket_port: 9001,
      username: d.mqtt_username || 'iot_device',
      password: d.mqtt_password || 'iot@device2024',
    },
    example_payload: {
      temperature: 25.5,
      humidity: 60.2,
      timestamp: new Date().toISOString()
    }
  });
}

router.get('/devices/:id', auth, async (req: Request, res: Response) => {
  const d = await queryOne<any>(`SELECT d.*,dm.name as model_name,dm.category,dm.data_schema FROM devices d LEFT JOIN device_models dm ON dm.id=d.model_id WHERE d.id=$1 AND d.tenant_id=$2`, [req.params.id, req.tenantId]);
  if (!d) return res.status(404).json({ error: 'Não encontrado' });
  return res.json(d);
});

router.post('/devices', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { name, identifier, protocol, type = 'iot', modelId, location, config, tags, notes } = req.body;
  if (!name || !identifier || !protocol) return res.status(400).json({ error: 'name, identifier e protocol são obrigatórios' });
  const tenant = await queryOne<any>('SELECT max_devices FROM tenants WHERE id=$1', [req.tenantId]);
  const cnt = await queryOne<any>('SELECT COUNT(*) as c FROM devices WHERE tenant_id=$1', [req.tenantId]);
  if (parseInt(cnt!.c) >= tenant!.max_devices) return res.status(403).json({ error: `Limite de ${tenant!.max_devices} dispositivos atingido` });
  try {
    const d = await queryOne(`INSERT INTO devices(tenant_id,model_id,created_by,name,identifier,protocol,type,location,config,tags,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.tenantId, modelId || null, req.user!.id, name, identifier, protocol, type, location ? JSON.stringify(location) : null, JSON.stringify(config || {}), tags || [], notes || null]);
    return res.status(201).json(d);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'Identificador já cadastrado' });
    throw e;
  }
});

router.put('/devices/:id', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { name, status, location, config, tags, notes, batteryLevel, signalStrength,
    connectionHost, connectionPort, connectionProtocol, connectionPath, connectionConfig } = req.body;
  const d = await queryOne(
    `UPDATE devices SET
      name=COALESCE($1,name),
      status=COALESCE($2,status),
      location=COALESCE($3,location),
      config=COALESCE($4,config),
      tags=COALESCE($5,tags),
      notes=COALESCE($6,notes),
      battery_level=COALESCE($7,battery_level),
      signal_strength=COALESCE($8,signal_strength),
      connection_host=COALESCE($9,connection_host),
      connection_port=COALESCE($10,connection_port),
      connection_protocol=COALESCE($11,connection_protocol),
      connection_path=COALESCE($12,connection_path),
      connection_config=COALESCE($13,connection_config)
     WHERE id=$14 AND tenant_id=$15 RETURNING *`,
    [name, status, location ? JSON.stringify(location) : null, config ? JSON.stringify(config) : null,
     tags, notes, batteryLevel, signalStrength,
     connectionHost || null, connectionPort || null, connectionProtocol || null,
     connectionPath || null, connectionConfig ? JSON.stringify(connectionConfig) : null,
     req.params.id, req.tenantId]);
  if (!d) return res.status(404).json({ error: 'Não encontrado' });
  return res.json(d);
});

// Salvar configuração de conexão IP:Porta de um dispositivo
router.put('/devices/:id/connection', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { host, port, protocol, path = '/', config = {} } = req.body;
  if (!host || !port) return res.status(400).json({ error: 'host e port são obrigatórios' });
  const d = await queryOne(
    `UPDATE devices SET
      connection_host=$1, connection_port=$2, connection_protocol=$3,
      connection_path=$4, connection_config=$5, connection_status='configured'
     WHERE id=$6 AND tenant_id=$7 RETURNING *`,
    [host, parseInt(port), protocol || 'tcp', path, JSON.stringify(config), req.params.id, req.tenantId]);
  if (!d) return res.status(404).json({ error: 'Não encontrado' });
  return res.json(d);
});

// Testar conectividade com o dispositivo via HTTP/MQTT ping
router.post('/devices/:id/connection/test', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const d = await queryOne<any>('SELECT * FROM devices WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  if (!d) return res.status(404).json({ error: 'Não encontrado' });
  if (!d.connection_host) return res.status(400).json({ error: 'Dispositivo sem host configurado' });
  const net = await import('net');
  const host = d.connection_host;
  const port = d.connection_port || 80;
  const start = Date.now();
  try {
    await new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);
      socket.connect(port, host, () => { socket.destroy(); resolve(); });
      socket.on('error', reject);
      socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout')); });
    });
    const latency = Date.now() - start;
    await query(`UPDATE devices SET connection_status='online', connection_last_check=NOW() WHERE id=$1`, [d.id]);
    return res.json({ success: true, latency, message: `Conectado em ${latency}ms` });
  } catch (err: any) {
    await query(`UPDATE devices SET connection_status='offline', connection_last_check=NOW() WHERE id=$1`, [d.id]);
    return res.json({ success: false, latency: Date.now() - start, message: err.message || 'Falha na conexão' });
  }
});

router.delete('/devices/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  const r = await query('DELETE FROM devices WHERE id=$1 AND tenant_id=$2 RETURNING id', [req.params.id, req.tenantId]);
  if (!r.length) return res.status(404).json({ error: 'Não encontrado' });
  return res.json({ success: true });
});

router.post('/devices/:id/telemetry', auth, async (req: Request, res: Response) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'data é obrigatório' });
  const d = await queryOne('SELECT id FROM devices WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  if (!d) return res.status(404).json({ error: 'Não encontrado' });
  await query('INSERT INTO telemetry(device_id,tenant_id,data) VALUES($1,$2,$3)', [req.params.id, req.tenantId, JSON.stringify(data)]);
  await query(`UPDATE devices SET last_seen_at=NOW(),last_telemetry=$1,status='online' WHERE id=$2`, [JSON.stringify(data), req.params.id]);
  return res.json({ success: true });
});

router.get('/devices/:id/telemetry', auth, async (req: Request, res: Response) => {
  const { from, to, limit = '200' } = req.query as any;
  const d = await queryOne('SELECT id FROM devices WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  if (!d) return res.status(404).json({ error: 'Não encontrado' });
  let sql = 'SELECT id,timestamp,data FROM telemetry WHERE device_id=$1';
  const p: any[] = [req.params.id]; let i = 2;
  if (from) { sql += ` AND timestamp>=$${i++}`; p.push(new Date(from)); }
  if (to) { sql += ` AND timestamp<=$${i++}`; p.push(new Date(to)); }
  sql += ` ORDER BY timestamp DESC LIMIT $${i}`;
  p.push(parseInt(limit));
  return res.json(await query(sql, p));
});

// ════════════════════════════════════════════════════════════
// DEVICE MODELS
// ════════════════════════════════════════════════════════════

router.get('/device-models', auth, async (req: Request, res: Response) => {
  const { category, protocol, search } = req.query as any;
  let sql = 'SELECT * FROM device_models WHERE 1=1';
  const p: any[] = []; let i = 1;
  if (category) { sql += ` AND category=$${i++}`; p.push(category); }
  if (protocol) { sql += ` AND protocol=$${i++}`; p.push(protocol); }
  if (search) { sql += ` AND (name ILIKE $${i} OR description ILIKE $${i})`; p.push(`%${search}%`); i++; }
  sql += ' ORDER BY category,name';
  return res.json(await query(sql, p));
});

router.get('/device-models/categories', auth, async (_req, res) => {
  return res.json(await query('SELECT DISTINCT category, COUNT(*) as count FROM device_models GROUP BY category ORDER BY category'));
});

router.get('/device-models/brands', auth, async (_req, res) => {
  return res.json(await query('SELECT DISTINCT brand, COUNT(*) as count FROM device_models WHERE brand IS NOT NULL GROUP BY brand ORDER BY brand'));
});

router.get('/device-models/:id', auth, async (req, res) => {
  const m = await queryOne('SELECT * FROM device_models WHERE id=$1', [req.params.id]);
  if (!m) return res.status(404).json({ error: 'Não encontrado' });
  return res.json(m);
});

// ════════════════════════════════════════════════════════════
// ALERTS
// ════════════════════════════════════════════════════════════

router.get('/alerts', auth, async (req: Request, res: Response) => {
  const { unreadOnly, limit = '50' } = req.query as any;
  let sql = `SELECT a.*,d.name as device_name FROM alerts a LEFT JOIN devices d ON d.id=a.device_id WHERE a.tenant_id=$1`;
  const p: any[] = [req.tenantId];
  if (unreadOnly === 'true') sql += ' AND a.is_read=false';
  sql += ` ORDER BY a.created_at DESC LIMIT $2`;
  p.push(parseInt(limit));
  return res.json(await query(sql, p));
});

router.get('/alerts/unread-count', auth, async (req: Request, res: Response) => {
  const r = await queryOne<any>('SELECT COUNT(*) as count FROM alerts WHERE tenant_id=$1 AND is_read=false', [req.tenantId]);
  return res.json({ count: parseInt(r!.count) });
});

router.put('/alerts/read-all', auth, async (req: Request, res: Response) => {
  await query('UPDATE alerts SET is_read=true WHERE tenant_id=$1', [req.tenantId]);
  return res.json({ success: true });
});

router.put('/alerts/:id/read', auth, async (req: Request, res: Response) => {
  await query('UPDATE alerts SET is_read=true WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  return res.json({ success: true });
});

router.get('/alerts/rules', auth, async (req: Request, res: Response) => {
  return res.json(await query(`SELECT ar.*,d.name as device_name FROM alert_rules ar LEFT JOIN devices d ON d.id=ar.device_id WHERE ar.tenant_id=$1 ORDER BY ar.created_at DESC`, [req.tenantId]));
});

router.post('/alerts/rules', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { deviceId, name, field, operator, threshold, severity = 'warning', channels = ['app'], cooldownMinutes = 15 } = req.body;
  if (!name || !field || !operator || !threshold) return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  const r = await queryOne(`INSERT INTO alert_rules(tenant_id,device_id,created_by,name,field,operator,threshold,severity,channels,cooldown_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.tenantId, deviceId || null, req.user!.id, name, field, operator, threshold, severity, JSON.stringify(channels), cooldownMinutes]);
  return res.status(201).json(r);
});

router.put('/alerts/rules/:id', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { name, isActive, threshold, severity } = req.body;
  const r = await queryOne(`UPDATE alert_rules SET name=COALESCE($1,name),is_active=COALESCE($2,is_active),threshold=COALESCE($3,threshold),severity=COALESCE($4,severity) WHERE id=$5 AND tenant_id=$6 RETURNING *`,
    [name, isActive, threshold, severity, req.params.id, req.tenantId]);
  if (!r) return res.status(404).json({ error: 'Não encontrado' });
  return res.json(r);
});

router.delete('/alerts/rules/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  await query('DELETE FROM alert_rules WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  return res.json({ success: true });
});

// ════════════════════════════════════════════════════════════
// AUTOMATIONS
// ════════════════════════════════════════════════════════════

router.get('/automations', auth, async (req: Request, res: Response) => {
  return res.json(await query(`SELECT a.*,td.name as trigger_device_name,ad.name as action_device_name FROM automations a LEFT JOIN devices td ON td.id=a.trigger_device_id LEFT JOIN devices ad ON ad.id=a.action_device_id WHERE a.tenant_id=$1 ORDER BY a.created_at DESC`, [req.tenantId]));
});

router.post('/automations', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { name, description, triggerDeviceId, triggerField, triggerOperator, triggerValue, actionType = 'notification', actionDeviceId, actionCommand, actionWebhookUrl } = req.body;
  if (!name || !triggerDeviceId || !triggerField || !triggerOperator || !triggerValue) return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  const r = await queryOne(`INSERT INTO automations(tenant_id,created_by,name,description,trigger_device_id,trigger_field,trigger_operator,trigger_value,action_type,action_device_id,action_command,action_webhook_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [req.tenantId, req.user!.id, name, description || null, triggerDeviceId, triggerField, triggerOperator, triggerValue, actionType, actionDeviceId || null, actionCommand || null, actionWebhookUrl || null]);
  return res.status(201).json(r);
});

router.put('/automations/:id', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { name, isActive } = req.body;
  const r = await queryOne(`UPDATE automations SET name=COALESCE($1,name),is_active=COALESCE($2,is_active) WHERE id=$3 AND tenant_id=$4 RETURNING *`,
    [name, isActive, req.params.id, req.tenantId]);
  if (!r) return res.status(404).json({ error: 'Não encontrado' });
  return res.json(r);
});

router.delete('/automations/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  await query('DELETE FROM automations WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  return res.json({ success: true });
});

// ════════════════════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════════════════════

router.get('/users', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  return res.json(await query(`SELECT id,name,email,role,is_active,last_login_at,created_at FROM users WHERE tenant_id=$1 ORDER BY created_at DESC`, [req.tenantId]));
});

router.post('/users', auth, requireRole('admin'), async (req: Request, res: Response) => {
  const { name, email, password, role = 'viewer' } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  const tenant = await queryOne<any>('SELECT max_users FROM tenants WHERE id=$1', [req.tenantId]);
  const cnt = await queryOne<any>('SELECT COUNT(*) as c FROM users WHERE tenant_id=$1', [req.tenantId]);
  if (parseInt(cnt!.c) >= tenant!.max_users) return res.status(403).json({ error: `Limite de ${tenant!.max_users} usuários atingido` });
  const exists = await queryOne('SELECT id FROM users WHERE email=$1', [email]);
  if (exists) return res.status(409).json({ error: 'Email já cadastrado' });
  const hash = await bcrypt.hash(password, 12);
  const u = await queryOne(`INSERT INTO users(tenant_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,role`, [req.tenantId, name, email, hash, role]);
  return res.status(201).json(u);
});

router.put('/users/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  const { name, role, isActive } = req.body;
  const u = await queryOne(`UPDATE users SET name=COALESCE($1,name),role=COALESCE($2,role),is_active=COALESCE($3,is_active) WHERE id=$4 AND tenant_id=$5 RETURNING id,name,email,role,is_active`,
    [name, role, isActive, req.params.id, req.tenantId]);
  if (!u) return res.status(404).json({ error: 'Não encontrado' });
  return res.json(u);
});

router.delete('/users/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  if (req.params.id === req.user!.id) return res.status(400).json({ error: 'Não pode deletar a si mesmo' });
  await query('DELETE FROM users WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  return res.json({ success: true });
});

// ════════════════════════════════════════════════════════════
// SUPERADMIN - Gestão de Tenants
// ════════════════════════════════════════════════════════════

router.get('/superadmin/tenants', auth, requireRole('superadmin'), async (_req, res) => {
  return res.json(await query(`SELECT t.*,COUNT(DISTINCT u.id) as user_count,COUNT(DISTINCT d.id) as device_count FROM tenants t LEFT JOIN users u ON u.tenant_id=t.id LEFT JOIN devices d ON d.tenant_id=t.id GROUP BY t.id ORDER BY t.created_at DESC`));
});

router.post('/superadmin/tenants', auth, requireRole('superadmin'), async (req: Request, res: Response) => {
  const { name, email, adminName, adminEmail, adminPassword, plan = 'basic', maxDevices = 10, maxUsers = 5 } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name e email obrigatórios' });
  let slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50);
  let i = 1;
  while (await queryOne('SELECT id FROM tenants WHERE slug=$1', [slug])) slug = `${slug}-${i++}`;
  try {
    const t = await queryOne<any>(`INSERT INTO tenants(name,slug,email,plan,max_devices,max_users) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [name, slug, email, plan, maxDevices, maxUsers]);
    // Criar usuario admin para o tenant se credenciais fornecidas
    if (adminEmail && adminPassword) {
      const hash = await bcrypt.hash(adminPassword, 12);
      await queryOne(`INSERT INTO users(tenant_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'admin')`,
        [t!.id, adminName || name, adminEmail, hash]);
    }
        // Provisionamento automático (não bloquear em caso de falha)
    let provisionResult = null;
    if (t) {
      provisionResult = await provisionTenantTraccar(t.id, name, email, adminEmail || email, adminPassword || '');
    }
    return res.status(201).json({ ...t, provision: provisionResult });
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email ou slug já cadastrado' });
    throw e;
  }
});

router.put('/superadmin/tenants/:id', auth, requireRole('superadmin'), async (req: Request, res: Response) => {
  const { name, plan, maxDevices, maxUsers, isActive, traccarServerUrl, traccarAdminUser, traccarAdminPass } = req.body;
  const t = await queryOne(`UPDATE tenants SET name=COALESCE($1,name),plan=COALESCE($2,plan),max_devices=COALESCE($3,max_devices),max_users=COALESCE($4,max_users),is_active=COALESCE($5,is_active),traccar_server_url=COALESCE($6,traccar_server_url),traccar_admin_user=COALESCE($7,traccar_admin_user),traccar_admin_pass=COALESCE($8,traccar_admin_pass) WHERE id=$9 RETURNING *`,
    [name, plan, maxDevices, maxUsers, isActive, traccarServerUrl, traccarAdminUser, traccarAdminPass, req.params.id]);
  return res.json(t);
});

// ── SuperAdmin: Detalhes do tenant ──
router.get('/superadmin/tenants/:id/detail', auth, requireRole('superadmin'), async (req: Request, res: Response) => {
  const t = await queryOne<any>(`SELECT t.*,COUNT(DISTINCT u.id) as user_count,COUNT(DISTINCT d.id) as device_count,COUNT(DISTINCT c.id) as camera_count FROM tenants t LEFT JOIN users u ON u.tenant_id=t.id LEFT JOIN devices d ON d.tenant_id=t.id LEFT JOIN jimi_cameras c ON c.tenant_id=t.id WHERE t.id=$1 GROUP BY t.id`, [req.params.id]);
  if (!t) return res.status(404).json({ error: 'Tenant não encontrado' });
  return res.json(t);
});

// ── SuperAdmin: Excluir tenant ──
router.delete('/superadmin/tenants/:id', auth, requireRole('superadmin'), async (req: Request, res: Response) => {
  const t = await queryOne<any>('SELECT slug FROM tenants WHERE id=$1', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'Tenant não encontrado' });
  if (t.slug === 'superadmin') return res.status(403).json({ error: 'Não é possível excluir o tenant superadmin' });
  await query('DELETE FROM tenants WHERE id=$1', [req.params.id]);
  return res.json({ success: true });
});


// ════════════════════════════════════════════════════════════
// BILLING / FATURAMENTO
// ════════════════════════════════════════════════════════════

// ── Customers ──────────────────────────────────────────────
router.get('/customers', auth, async (req: Request, res: Response) => {
  const rows = await query<any>(
    `SELECT c.*, COUNT(DISTINCT ct.id) as total_contracts
     FROM customers c
     LEFT JOIN contracts ct ON ct.customer_id = c.id AND ct.tenant_id = c.tenant_id
     WHERE c.tenant_id = $1
     GROUP BY c.id
     ORDER BY c.razao_social`,
    [req.tenantId]
  );
  return res.json(rows);
});

router.get('/customers/:id', auth, async (req: Request, res: Response) => {
  const c = await queryOne<any>(
    `SELECT c.*, COUNT(DISTINCT ct.id) as total_contracts,
            COALESCE(SUM(ct.valor_mensal), 0) as receita_mensal
     FROM customers c
     LEFT JOIN contracts ct ON ct.customer_id = c.id AND ct.tenant_id = c.tenant_id AND ct.status = 'ativo'
     WHERE c.id = $1 AND c.tenant_id = $2
     GROUP BY c.id`,
    [req.params.id, req.tenantId]
  );
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
  return res.json(c);
});

router.post('/customers', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  const { razao_social, cnpj, email, telefone, endereco, cidade, estado, cep, contato_nome, contato_email, contato_telefone, observacoes } = req.body;
  if (!razao_social) return res.status(400).json({ error: 'Razão social é obrigatória' });
  const c = await queryOne<any>(
    `INSERT INTO customers (tenant_id, razao_social, cnpj, email, telefone, endereco, cidade, estado, cep, contato_nome, contato_email, contato_telefone, observacoes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [req.tenantId, razao_social, cnpj||null, email||null, telefone||null, endereco||null, cidade||null, estado||null, cep||null, contato_nome||null, contato_email||null, contato_telefone||null, observacoes||null]
  );
  return res.status(201).json(c);
});

router.put('/customers/:id', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  const { razao_social, cnpj, email, telefone, endereco, cidade, estado, cep, contato_nome, contato_email, contato_telefone, observacoes } = req.body;
  const c = await queryOne<any>(
    `UPDATE customers SET razao_social=$1, cnpj=$2, email=$3, telefone=$4, endereco=$5, cidade=$6, estado=$7, cep=$8,
     contato_nome=$9, contato_email=$10, contato_telefone=$11, observacoes=$12, updated_at=NOW()
     WHERE id=$13 AND tenant_id=$14 RETURNING *`,
    [razao_social, cnpj||null, email||null, telefone||null, endereco||null, cidade||null, estado||null, cep||null, contato_nome||null, contato_email||null, contato_telefone||null, observacoes||null, req.params.id, req.tenantId]
  );
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
  return res.json(c);
});

router.delete('/customers/:id', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  const c = await queryOne<any>('SELECT id FROM customers WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
  await query('DELETE FROM customers WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  return res.json({ success: true });
});

// ── Contracts ──────────────────────────────────────────────
router.get('/contracts', auth, async (req: Request, res: Response) => {
  const { customer_id, status } = req.query;
  let sql = `SELECT ct.*, c.razao_social as customer_name, c.cnpj as customer_cnpj
             FROM contracts ct
             LEFT JOIN customers c ON c.id = ct.customer_id
             WHERE ct.tenant_id = $1`;
  const params: any[] = [req.tenantId];
  if (customer_id) { params.push(customer_id); sql += ` AND ct.customer_id = $${params.length}`; }
  if (status) { params.push(status); sql += ` AND ct.status = $${params.length}`; }
  sql += ' ORDER BY ct.created_at DESC';
  const rows = await query<any>(sql, params);
  return res.json(rows);
});

router.get('/contracts/:id', auth, async (req: Request, res: Response) => {
  const ct = await queryOne<any>(
    `SELECT ct.*, c.razao_social as customer_name, c.cnpj as customer_cnpj, c.email as customer_email
     FROM contracts ct
     LEFT JOIN customers c ON c.id = ct.customer_id
     WHERE ct.id = $1 AND ct.tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  if (!ct) return res.status(404).json({ error: 'Contrato não encontrado' });
  return res.json(ct);
});

router.post('/contracts', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  const { customer_id, numero_contrato, descricao, valor_mensal, data_inicio, data_fim, status, observacoes } = req.body;
  if (!customer_id || !numero_contrato) return res.status(400).json({ error: 'customer_id e numero_contrato são obrigatórios' });
  const ct = await queryOne<any>(
    `INSERT INTO contracts (tenant_id, customer_id, numero_contrato, descricao, valor_mensal, data_inicio, data_fim, status, observacoes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.tenantId, customer_id, numero_contrato, descricao||null, valor_mensal||0, data_inicio||null, data_fim||null, status||'ativo', observacoes||null]
  );
  return res.status(201).json(ct);
});

router.put('/contracts/:id', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  const { numero_contrato, descricao, valor_mensal, data_inicio, data_fim, status, observacoes } = req.body;
  const ct = await queryOne<any>(
    `UPDATE contracts SET numero_contrato=$1, descricao=$2, valor_mensal=$3, data_inicio=$4, data_fim=$5, status=$6, observacoes=$7, updated_at=NOW()
     WHERE id=$8 AND tenant_id=$9 RETURNING *`,
    [numero_contrato, descricao||null, valor_mensal||0, data_inicio||null, data_fim||null, status||'ativo', observacoes||null, req.params.id, req.tenantId]
  );
  if (!ct) return res.status(404).json({ error: 'Contrato não encontrado' });
  return res.json(ct);
});

router.delete('/contracts/:id', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  const ct = await queryOne<any>('SELECT id FROM contracts WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  if (!ct) return res.status(404).json({ error: 'Contrato não encontrado' });
  await query('DELETE FROM contracts WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  return res.json({ success: true });
});

// ── Billing Cycles ─────────────────────────────────────────
router.get('/billing/cycles', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  const rows = await query<any>(
    `SELECT bc.*, COUNT(bi.id) as total_items, COALESCE(SUM(bi.valor_total), 0) as total_calculado
     FROM billing_cycles bc
     LEFT JOIN billing_items bi ON bi.cycle_id = bc.id
     WHERE bc.tenant_id = $1
     GROUP BY bc.id
     ORDER BY bc.data_inicio DESC`,
    [req.tenantId]
  );
  return res.json(rows);
});

router.get('/billing/cycles/:id', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  const cycle = await queryOne<any>(
    `SELECT bc.*, COUNT(bi.id) as total_items, COALESCE(SUM(bi.valor_total), 0) as total_calculado
     FROM billing_cycles bc
     LEFT JOIN billing_items bi ON bi.cycle_id = bc.id
     WHERE bc.id = $1 AND bc.tenant_id = $2
     GROUP BY bc.id`,
    [req.params.id, req.tenantId]
  );
  if (!cycle) return res.status(404).json({ error: 'Ciclo não encontrado' });
  const items = await query<any>('SELECT * FROM billing_items WHERE cycle_id=$1 ORDER BY id', [req.params.id]);
  return res.json({ ...cycle, items });
});

router.post('/billing/cycles', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  const { data_inicio, data_fim, descricao, status } = req.body;
  if (!data_inicio || !data_fim) return res.status(400).json({ error: 'data_inicio e data_fim são obrigatórios' });
  const cycle = await queryOne<any>(
    `INSERT INTO billing_cycles (tenant_id, data_inicio, data_fim, descricao, status)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.tenantId, data_inicio, data_fim, descricao||null, status||'aberto']
  );
  return res.status(201).json(cycle);
});

router.put('/billing/cycles/:id', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  const { data_inicio, data_fim, descricao, status, valor_total } = req.body;
  const cycle = await queryOne<any>(
    `UPDATE billing_cycles SET data_inicio=$1, data_fim=$2, descricao=$3, status=$4, valor_total=$5, updated_at=NOW()
     WHERE id=$6 AND tenant_id=$7 RETURNING *`,
    [data_inicio, data_fim, descricao||null, status||'aberto', valor_total||0, req.params.id, req.tenantId]
  );
  if (!cycle) return res.status(404).json({ error: 'Ciclo não encontrado' });
  return res.json(cycle);
});

// ── Billing Items ──────────────────────────────────────────
router.post('/billing/cycles/:id/items', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  const { descricao, quantidade, valor_unitario } = req.body;
  if (!descricao || !valor_unitario) return res.status(400).json({ error: 'descricao e valor_unitario são obrigatórios' });
  const qty = quantidade || 1;
  const total = parseFloat(valor_unitario) * qty;
  const item = await queryOne<any>(
    `INSERT INTO billing_items (tenant_id, cycle_id, descricao, quantidade, valor_unitario, valor_total)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.tenantId, req.params.id, descricao, qty, valor_unitario, total]
  );
  // Atualizar total do ciclo
  await query(
    `UPDATE billing_cycles SET valor_total = (SELECT COALESCE(SUM(valor_total),0) FROM billing_items WHERE cycle_id=$1), updated_at=NOW() WHERE id=$1`,
    [req.params.id]
  );
  return res.status(201).json(item);
});

router.delete('/billing/cycles/:cycleId/items/:itemId', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  await query('DELETE FROM billing_items WHERE id=$1 AND tenant_id=$2', [req.params.itemId, req.tenantId]);
  await query(
    `UPDATE billing_cycles SET valor_total = (SELECT COALESCE(SUM(valor_total),0) FROM billing_items WHERE cycle_id=$1), updated_at=NOW() WHERE id=$1`,
    [req.params.cycleId]
  );
  return res.json({ success: true });
});

// ── Payment History ────────────────────────────────────────
router.get('/billing/payments', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  const rows = await query<any>(
    `SELECT ph.*, c.razao_social as customer_name, bc.data_inicio as cycle_inicio, bc.data_fim as cycle_fim
     FROM payment_history ph
     LEFT JOIN customers c ON c.id = ph.customer_id
     LEFT JOIN billing_cycles bc ON bc.id = ph.cycle_id
     WHERE ph.tenant_id = $1
     ORDER BY ph.data_pagamento DESC`,
    [req.tenantId]
  );
  return res.json(rows);
});

router.post('/billing/payments', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  const { cycle_id, customer_id, valor, metodo_pagamento, data_pagamento, observacoes } = req.body;
  if (!cycle_id || !customer_id || !valor) return res.status(400).json({ error: 'cycle_id, customer_id e valor são obrigatórios' });
  const payment = await queryOne<any>(
    `INSERT INTO payment_history (tenant_id, cycle_id, customer_id, valor, metodo_pagamento, data_pagamento, status, observacoes)
     VALUES ($1,$2,$3,$4,$5,$6,'pago',$7) RETURNING *`,
    [req.tenantId, cycle_id, customer_id, valor, metodo_pagamento||'pix', data_pagamento||new Date().toISOString().split('T')[0], observacoes||null]
  );
  // Marcar ciclo como pago se valor >= total
  const cycle = await queryOne<any>('SELECT valor_total FROM billing_cycles WHERE id=$1', [cycle_id]);
  if (cycle && parseFloat(valor) >= parseFloat(cycle.valor_total)) {
    await query(`UPDATE billing_cycles SET status='pago', updated_at=NOW() WHERE id=$1`, [cycle_id]);
  }
  return res.status(201).json(payment);
});

// ── Billing Dashboard (resumo financeiro) ──────────────────
router.get('/billing/dashboard', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  const [summary] = await Promise.all([
    query<any>(
      `SELECT
        COUNT(DISTINCT c.id) as total_customers,
        COUNT(DISTINCT ct.id) FILTER (WHERE ct.status='ativo') as contracts_ativos,
        COALESCE(SUM(ct.valor_mensal) FILTER (WHERE ct.status='ativo'), 0) as mrr,
        COUNT(DISTINCT bc.id) FILTER (WHERE bc.status='aberto') as cycles_abertos,
        COALESCE(SUM(bc.valor_total) FILTER (WHERE bc.status='aberto'), 0) as valor_pendente,
        COALESCE(SUM(ph.valor) FILTER (WHERE ph.data_pagamento >= NOW() - INTERVAL '30 days'), 0) as recebido_30d
       FROM customers c
       LEFT JOIN contracts ct ON ct.customer_id = c.id AND ct.tenant_id = c.tenant_id
       LEFT JOIN billing_cycles bc ON bc.tenant_id = c.tenant_id
       LEFT JOIN payment_history ph ON ph.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1`,
      [req.tenantId]
    )
  ]);
  const recentPayments = await query<any>(
    `SELECT ph.*, c.razao_social as customer_name
     FROM payment_history ph
     LEFT JOIN customers c ON c.id = ph.customer_id
     WHERE ph.tenant_id = $1
     ORDER BY ph.data_pagamento DESC LIMIT 5`,
    [req.tenantId]
  );
  const openCycles = await query<any>(
    `SELECT bc.*, COUNT(bi.id) as total_items
     FROM billing_cycles bc
     LEFT JOIN billing_items bi ON bi.cycle_id = bc.id
     WHERE bc.tenant_id = $1 AND bc.status = 'aberto'
     GROUP BY bc.id
     ORDER BY bc.data_fim ASC`,
    [req.tenantId]
  );
  return res.json({ summary: summary[0], recentPayments, openCycles });
});

// ── SuperAdmin: Billing overview de todos os tenants ───────
router.get('/superadmin/billing/overview', auth, requireRole('superadmin'), async (_req, res) => {
  const rows = await query<any>(
    `SELECT t.id, t.name, t.slug, t.plan,
            COUNT(DISTINCT c.id) as total_customers,
            COUNT(DISTINCT ct.id) FILTER (WHERE ct.status='ativo') as contracts_ativos,
            COALESCE(SUM(ct.valor_mensal) FILTER (WHERE ct.status='ativo'), 0) as mrr,
            COALESCE(SUM(ph.valor) FILTER (WHERE ph.data_pagamento >= NOW() - INTERVAL '30 days'), 0) as recebido_30d
     FROM tenants t
     LEFT JOIN customers c ON c.tenant_id = t.id
     LEFT JOIN contracts ct ON ct.tenant_id = t.id
     LEFT JOIN payment_history ph ON ph.tenant_id = t.id
     GROUP BY t.id
     ORDER BY mrr DESC`,
    []
  );
  return res.json(rows);
});

// ════════════════════════════════════════════════════════════
// AUDITORIA
// ════════════════════════════════════════════════════════════
router.get('/audit-logs', auth, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  const { page = 1, limit = 50, action, user_id } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  let sql = `SELECT al.*, u.name as user_name, u.email as user_email
             FROM audit_logs al
             LEFT JOIN users u ON u.id = al.user_id
             WHERE al.tenant_id = $1`;
  const params: any[] = [req.tenantId];
  if (action) { params.push(action); sql += ` AND al.action ILIKE $${params.length}`; }
  if (user_id) { params.push(user_id); sql += ` AND al.user_id = $${params.length}`; }
  sql += ` ORDER BY al.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
  params.push(Number(limit), offset);
  const rows = await query<any>(sql, params);
  const [{ count }] = await query<any>(
    `SELECT COUNT(*) FROM audit_logs WHERE tenant_id = $1`,
    [req.tenantId]
  );
  return res.json({ logs: rows, total: Number(count), page: Number(page), limit: Number(limit) });
});

// ════════════════════════════════════════════════════════════
// RECUPERAÇÃO DE SENHA
// ════════════════════════════════════════════════════════════
router.post('/auth/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'E-mail é obrigatório' });
  const user = await queryOne<any>('SELECT id, name, email, tenant_id FROM users WHERE email=$1 AND is_active=true', [email]);
  if (!user) {
    // Não revelar se o e-mail existe ou não
    return res.json({ message: 'Se o e-mail estiver cadastrado, você receberá as instruções em breve.' });
  }
  // Gerar token de reset (válido por 1h)
  const token = require('crypto').randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 3600000); // 1 hora
  await query(
    `UPDATE users SET reset_token=$1, reset_token_expires=$2 WHERE id=$3`,
    [token, expires, user.id]
  );
  // Em produção: enviar e-mail com o token. Por ora, retornar o token para debug.
  // TODO: integrar com serviço de e-mail (SendGrid, SES, etc.)
  console.log(`[RESET PASSWORD] Token para ${email}: ${token}`);
  return res.json({ message: 'Se o e-mail estiver cadastrado, você receberá as instruções em breve.', debug_token: process.env.NODE_ENV !== 'production' ? token : undefined });
});

router.post('/auth/reset-password', async (req: Request, res: Response) => {
  const { token, new_password } = req.body;
  if (!token || !new_password) return res.status(400).json({ error: 'Token e nova senha são obrigatórios' });
  if (new_password.length < 8) return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres' });
  const user = await queryOne<any>(
    `SELECT id FROM users WHERE reset_token=$1 AND reset_token_expires > NOW() AND is_active=true`,
    [token]
  );
  if (!user) return res.status(400).json({ error: 'Token inválido ou expirado' });
  const hash = await bcrypt.hash(new_password, 10);
  await query(
    `UPDATE users SET password_hash=$1, reset_token=NULL, reset_token_expires=NULL WHERE id=$2`,
    [hash, user.id]
  );
  return res.json({ message: 'Senha alterada com sucesso' });
});


// ════════════════════════════════════════════════════════════
// TRACCAR
// ════════════════════════════════════════════════════════════

async function getTraccar(tenantId: string) {
  const t = await queryOne<any>('SELECT traccar_server_url,traccar_admin_user,traccar_admin_pass FROM tenants WHERE id=$1', [tenantId]);
  if (!t?.traccar_server_url) return null;
  return { base: t.traccar_server_url.replace(/\/$/, ''), auth: { username: t.traccar_admin_user || 'admin', password: t.traccar_admin_pass || 'admin' } };
}

router.get('/traccar/status', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.json({ connected: false, message: 'Traccar não configurado' });
  try {
    const r = await axios.get(`${cfg.base}/api/server`, { auth: cfg.auth, timeout: 5000 });
    return res.json({ connected: true, server: r.data });
  } catch { return res.json({ connected: false, message: 'Não foi possível conectar' }); }
});

router.post('/traccar/configure', auth, requireRole('admin'), async (req: Request, res: Response) => {
  const { serverUrl, adminUser, adminPass } = req.body;
  if (!serverUrl) return res.status(400).json({ error: 'serverUrl obrigatório' });
  try {
    await axios.get(`${serverUrl.replace(/\/$/, '')}/api/server`, { auth: { username: adminUser || 'admin', password: adminPass || 'admin' }, timeout: 5000 });
  } catch { return res.status(400).json({ error: 'Não foi possível conectar ao Traccar' }); }
  await query('UPDATE tenants SET traccar_server_url=$1,traccar_admin_user=$2,traccar_admin_pass=$3 WHERE id=$4', [serverUrl, adminUser || 'admin', adminPass || 'admin', req.tenantId]);
  return res.json({ success: true });
});

// ── Dispositivos ──
router.get('/traccar/devices', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.json([]);
  try {
    const [devRes, posRes] = await Promise.all([
      axios.get(`${cfg.base}/api/devices`, { auth: cfg.auth, timeout: 10000 }),
      axios.get(`${cfg.base}/api/positions`, { auth: cfg.auth, timeout: 10000 }),
    ]);
    const posMap: Record<number, any> = {};
    (posRes.data || []).forEach((p: any) => { posMap[p.deviceId] = p; });
    const result = (devRes.data || []).map((d: any) => {
      const pos = posMap[d.id] || {};
      return {
        id: d.id, name: d.name, uniqueId: d.uniqueId, status: d.status || 'offline',
        lastUpdate: d.lastUpdate, phone: d.phone, model: d.model,
        category: d.category, groupId: d.groupId, attributes: d.attributes || {},
        lat: pos.latitude, lng: pos.longitude, speed: pos.speed || 0,
        course: pos.course || 0, altitude: pos.altitude || 0, address: pos.address,
        gpsTime: pos.deviceTime, fixTime: pos.fixTime, valid: pos.valid || false,
        posAttributes: pos.attributes || {},
        ignition: pos.attributes?.ignition, battery: pos.attributes?.batteryLevel,
        fuel: pos.attributes?.fuel, odometer: pos.attributes?.totalDistance,
        hours: pos.attributes?.hours,
      };
    });
    return res.json(result);
  } catch (e: any) { return res.status(502).json({ error: 'Erro ao buscar dispositivos', detail: e.message }); }
});

router.get('/traccar/devices/:id', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.status(400).json({ error: 'Traccar não configurado' });
  try { return res.json((await axios.get(`${cfg.base}/api/devices?id=${req.params.id}`, { auth: cfg.auth, timeout: 10000 })).data[0]); }
  catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.message }); }
});

router.post('/traccar/devices', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.status(400).json({ error: 'Traccar não configurado' });
  const { name, uniqueId, phone, model, category, groupId } = req.body;
  if (!name) return res.status(400).json({ error: 'VALIDACAO', message: 'Nome é obrigatório', field: 'name' });
  if (!uniqueId) return res.status(400).json({ error: 'VALIDACAO', message: 'IMEI/identificador é obrigatório', field: 'uniqueId' });
  try {
    const r = await axios.post(`${cfg.base}/api/devices`, { name, uniqueId, phone: phone || '', model: model || '', category: category || 'default', groupId: groupId || 0 }, { auth: cfg.auth, timeout: 10000 });
    return res.status(201).json(r.data);
  } catch (e: any) {
    const status = e.response?.status;
    const body = e.response?.data;
    const msg = typeof body === 'string' ? body : (body?.message || body?.error || JSON.stringify(body || '') || e.message || '');
    if (/duplicate|unique|already.*exist|tc_devices_uniqueid/i.test(msg)) {
      return res.status(409).json({
        error: 'IMEI_DUPLICADO',
        message: `Este IMEI/identificador já está cadastrado: ${uniqueId}`,
        field: 'uniqueId',
      });
    }
    if (status === 400) {
      return res.status(400).json({ error: 'VALIDACAO', message: (msg || 'Dados inválidos').split('\n')[0] });
    }
    if (status === 401 || status === 403) {
      return res.status(502).json({ error: 'TRACCAR_AUTH', message: 'Credenciais do Traccar para este tenant estão inválidas. Verifique em Configurações.' });
    }
    console.error('[POST /traccar/devices] erro Traccar:', { status, msg: msg.split('\n')[0], imei: uniqueId });
    return res.status(502).json({ error: 'TRACCAR_ERRO', message: 'Falha ao comunicar com o servidor de rastreamento. Tente novamente.' });
  }
});

router.put('/traccar/devices/:id', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.status(400).json({ error: 'Traccar não configurado' });
  const id = Number(req.params.id);
  const { name, uniqueId, phone, model, category, groupId } = req.body || {};
  if (!name) return res.status(400).json({ error: 'VALIDACAO', message: 'Nome é obrigatório', field: 'name' });
  if (!uniqueId) return res.status(400).json({ error: 'VALIDACAO', message: 'IMEI/identificador é obrigatório', field: 'uniqueId' });
  try {
    const r = await axios.put(
      `${cfg.base}/api/devices/${id}`,
      { id, name, uniqueId, phone: phone || '', model: model || '', category: category || 'default', groupId: groupId || 0 },
      { auth: cfg.auth, timeout: 10000 }
    );
    return res.json(r.data);
  } catch (e: any) {
    const status = e.response?.status;
    const body = e.response?.data;
    const msg = typeof body === 'string' ? body : (body?.message || body?.error || JSON.stringify(body || '') || e.message || '');
    if (/duplicate|unique|already.*exist|tc_devices_uniqueid/i.test(msg)) {
      return res.status(409).json({ error: 'IMEI_DUPLICADO', message: `Este IMEI/identificador já está cadastrado: ${uniqueId}`, field: 'uniqueId' });
    }
    if (status === 404) {
      return res.status(404).json({ error: 'NAO_ENCONTRADO', message: 'Rastreador não existe no servidor de rastreamento' });
    }
    if (status === 400) {
      return res.status(400).json({ error: 'VALIDACAO', message: (msg || 'Dados inválidos').split('\n')[0] });
    }
    if (status === 401 || status === 403) {
      return res.status(502).json({ error: 'TRACCAR_AUTH', message: 'Credenciais do Traccar para este tenant estão inválidas. Verifique em Configurações.' });
    }
    console.error('[PUT /traccar/devices/:id] erro Traccar:', { id, status, msg: String(msg).split('\n')[0] });
    return res.status(502).json({ error: 'TRACCAR_ERRO', message: 'Falha ao atualizar no servidor de rastreamento. Tente novamente.' });
  }
});

router.delete('/traccar/devices/:id', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.status(400).json({ error: 'Traccar não configurado' });
  try { await axios.delete(`${cfg.base}/api/devices/${req.params.id}`, { auth: cfg.auth, timeout: 10000 }); return res.json({ success: true }); }
  catch (e: any) { return res.status(502).json({ error: 'Erro ao deletar', detail: e.message }); }
});

// ── Posições ──
router.get('/traccar/positions', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.json([]);
  const params: any = {};
  if (req.query.deviceId) params.deviceId = req.query.deviceId;
  try { return res.json((await axios.get(`${cfg.base}/api/positions`, { auth: cfg.auth, params, timeout: 10000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro ao buscar posições', detail: e.message }); }
});

router.get('/traccar/positions/history', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.json([]);
  const { deviceId, from, to } = req.query;
  try { return res.json((await axios.get(`${cfg.base}/api/positions`, { auth: cfg.auth, params: { deviceId, from, to }, timeout: 15000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro ao buscar histórico', detail: e.message }); }
});

// ── backward compat ──
router.get('/traccar/history/:deviceId', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.json([]);
  const { from, to } = req.query;
  try { return res.json((await axios.get(`${cfg.base}/api/positions`, { auth: cfg.auth, params: { deviceId: req.params.deviceId, from, to }, timeout: 15000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro ao buscar histórico', detail: e.message }); }
});

// ── Grupos ──
router.get('/traccar/groups', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.json([]);
  try { return res.json((await axios.get(`${cfg.base}/api/groups`, { auth: cfg.auth, timeout: 10000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.message }); }
});

router.post('/traccar/groups', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.status(400).json({ error: 'Traccar não configurado' });
  try { return res.status(201).json((await axios.post(`${cfg.base}/api/groups`, { name: req.body.name, attributes: {} }, { auth: cfg.auth, timeout: 10000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.response?.data || e.message }); }
});

router.put('/traccar/groups/:id', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.status(400).json({ error: 'Traccar não configurado' });
  try { return res.json((await axios.put(`${cfg.base}/api/groups/${req.params.id}`, req.body, { auth: cfg.auth, timeout: 10000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.response?.data || e.message }); }
});

router.delete('/traccar/groups/:id', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.status(400).json({ error: 'Traccar não configurado' });
  try { await axios.delete(`${cfg.base}/api/groups/${req.params.id}`, { auth: cfg.auth, timeout: 10000 }); return res.json({ success: true }); }
  catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.message }); }
});

// ── Geofences ──
router.get('/traccar/geofences', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.json([]);
  try { return res.json((await axios.get(`${cfg.base}/api/geofences`, { auth: cfg.auth, timeout: 10000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.message }); }
});

router.post('/traccar/geofences', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.status(400).json({ error: 'Traccar não configurado' });
  const { name, description, area } = req.body;
  try { return res.status(201).json((await axios.post(`${cfg.base}/api/geofences`, { name, description: description || '', area, calendarId: 0, attributes: {} }, { auth: cfg.auth, timeout: 10000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.response?.data || e.message }); }
});

router.put('/traccar/geofences/:id', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.status(400).json({ error: 'Traccar não configurado' });
  try { return res.json((await axios.put(`${cfg.base}/api/geofences/${req.params.id}`, req.body, { auth: cfg.auth, timeout: 10000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.response?.data || e.message }); }
});

router.delete('/traccar/geofences/:id', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.status(400).json({ error: 'Traccar não configurado' });
  try { await axios.delete(`${cfg.base}/api/geofences/${req.params.id}`, { auth: cfg.auth, timeout: 10000 }); return res.json({ success: true }); }
  catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.message }); }
});

// ── Vincular geofence a dispositivo ──
router.post('/traccar/geofences/:fenceId/link/:deviceId', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.status(400).json({ error: 'Traccar não configurado' });
  try { return res.json((await axios.post(`${cfg.base}/api/permissions`, { deviceId: Number(req.params.deviceId), geofenceId: Number(req.params.fenceId) }, { auth: cfg.auth, timeout: 10000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.response?.data || e.message }); }
});

router.delete('/traccar/geofences/:fenceId/link/:deviceId', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.status(400).json({ error: 'Traccar não configurado' });
  try { return res.json((await axios.delete(`${cfg.base}/api/permissions`, { auth: cfg.auth, data: { deviceId: Number(req.params.deviceId), geofenceId: Number(req.params.fenceId) }, timeout: 10000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.response?.data || e.message }); }
});

// ── Eventos ──
router.get('/traccar/events', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.json([]);
  const { deviceId, from, to, type } = req.query;
  const params: any = { deviceId, from, to };
  if (type) params.type = type;
  try { return res.json((await axios.get(`${cfg.base}/api/reports/events`, { auth: cfg.auth, params, timeout: 15000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.message }); }
});

// ── Notificações ──
router.get('/traccar/notifications', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.json([]);
  try { return res.json((await axios.get(`${cfg.base}/api/notifications`, { auth: cfg.auth, timeout: 10000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.message }); }
});

router.post('/traccar/notifications', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.status(400).json({ error: 'Traccar não configurado' });
  const { type, notificators, always } = req.body;
  try {
    const notif = (await axios.post(`${cfg.base}/api/notifications`, { type, notificators: notificators || 'web', attributes: {}, always: always !== false }, { auth: cfg.auth, timeout: 10000 })).data;
    if (req.body.deviceId && notif.id) {
      await axios.post(`${cfg.base}/api/permissions`, { deviceId: req.body.deviceId, notificationId: notif.id }, { auth: cfg.auth, timeout: 10000 });
    }
    return res.status(201).json(notif);
  } catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.response?.data || e.message }); }
});

router.delete('/traccar/notifications/:id', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.status(400).json({ error: 'Traccar não configurado' });
  try { await axios.delete(`${cfg.base}/api/notifications/${req.params.id}`, { auth: cfg.auth, timeout: 10000 }); return res.json({ success: true }); }
  catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.message }); }
});

// ── Relatórios ──
router.get('/traccar/reports/:type', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.json([]);
  const validTypes = ['route', 'trips', 'stops', 'summary', 'events'];
  if (!validTypes.includes(req.params.type)) return res.status(400).json({ error: 'Tipo de relatório inválido' });
  const { deviceId, from, to } = req.query;
  try {
    const r = await axios.get(`${cfg.base}/api/reports/${req.params.type}`, {
      auth: cfg.auth, params: { deviceId, from, to },
      timeout: 30000, headers: { Accept: 'application/json' }
    });
    return res.json(r.data);
  } catch (e: any) { return res.status(502).json({ error: 'Erro no relatório', detail: e.response?.data || e.message }); }
});

// ── Comandos ──
router.get('/traccar/commands/types/:deviceId', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.json([]);
  try { return res.json((await axios.get(`${cfg.base}/api/commands/types`, { auth: cfg.auth, params: { deviceId: req.params.deviceId }, timeout: 10000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.message }); }
});

router.post('/traccar/commands/send', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.status(400).json({ error: 'Traccar não configurado' });
  const { deviceId, type, attributes } = req.body;
  try { return res.json((await axios.post(`${cfg.base}/api/commands/send`, { deviceId, type, attributes: attributes || {} }, { auth: cfg.auth, timeout: 15000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro ao enviar comando', detail: e.response?.data || e.message }); }
});

// ── Estatísticas do servidor ──
router.get('/traccar/server', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.json({ connected: false });
  try { return res.json((await axios.get(`${cfg.base}/api/server`, { auth: cfg.auth, timeout: 5000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro', detail: e.message }); }
});

// Auto-configurar Traccar local (para o servidor que tem o Traccar no mesmo host)
router.post('/traccar/auto-configure', auth, requireRole('admin'), async (req: Request, res: Response) => {
  // Tenta conectar ao Traccar local na porta 8082
  const localUrl = 'http://iot_traccar:8082';
  const { adminUser = 'admin@iotplatform.com', adminPass = 'Admin@IoT2024!' } = req.body;
  try {
    await axios.get(`${localUrl}/api/server`, { auth: { username: adminUser, password: adminPass }, timeout: 5000 });
    await query('UPDATE tenants SET traccar_server_url=$1,traccar_admin_user=$2,traccar_admin_pass=$3 WHERE id=$4',
      [localUrl, adminUser, adminPass, req.tenantId]);
    return res.json({ success: true, message: 'Traccar configurado automaticamente' });
  } catch (e: any) {
    return res.status(400).json({ error: 'Não foi possível conectar ao Traccar local', detail: e.message });
  }
});

// Proxy para o mapa do Traccar (retorna a URL pública)
router.get('/traccar/map-url', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.json({ url: null, configured: false });
  // Retorna a URL pública do Traccar (substituindo host interno pelo IP do servidor)
  const publicUrl = cfg.base.replace('iot_traccar', req.hostname).replace('http://', 'http://');
  return res.json({ url: publicUrl, configured: true, base: cfg.base });
});

// ════════════════════════════════════════════════════════════
// CÂMERAS JIMI (JC400D — veiculares 4G via IMEI)
// ════════════════════════════════════════════════════════════

// Listar câmeras JIMI
router.get('/cameras', auth, async (req: Request, res: Response) => {
  const { status, search } = req.query as any;
  let sql = `SELECT jc.*, d.name as vehicle_name
     FROM jimi_cameras jc LEFT JOIN devices d ON d.id=jc.vehicle_id
     WHERE jc.tenant_id=$1`;
  const p: any[] = [req.tenantId]; let i = 2;
  if (status) { sql += ` AND jc.status=$${i++}`; p.push(status); }
  if (search) { sql += ` AND (jc.name ILIKE $${i} OR jc.imei ILIKE $${i} OR jc.location ILIKE $${i})`; p.push(`%${search}%`); i++; }
  sql += ' ORDER BY jc.created_at DESC';
  return res.json(await query(sql, p));
});

// Stats
router.get('/cameras/stats', auth, async (req: Request, res: Response) => {
  const s = await queryOne<any>(
    `SELECT COUNT(*) as total,
     COUNT(*) FILTER(WHERE status='online') as online,
     COUNT(*) FILTER(WHERE status='offline') as offline,
     COUNT(*) FILTER(WHERE camera_type='front') as front,
     COUNT(*) FILTER(WHERE camera_type='internal') as internal,
     COUNT(*) FILTER(WHERE camera_type='both') as both
     FROM jimi_cameras WHERE tenant_id=$1`, [req.tenantId]
  );
  return res.json(s);
});

// Obter câmera por ID
router.get('/cameras/:id', auth, async (req: Request, res: Response) => {
  const c = await queryOne(
    `SELECT jc.*, d.name as vehicle_name FROM jimi_cameras jc
     LEFT JOIN devices d ON d.id=jc.vehicle_id
     WHERE jc.id=$1 AND jc.tenant_id=$2`,
    [req.params.id, req.tenantId]
  );
  if (!c) return res.status(404).json({ error: 'Câmera não encontrada' });
  return res.json(c);
});

// Criar câmera JIMI
router.post('/cameras', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { name, imei, cameraType, vehicleId, location } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  if (!imei) return res.status(400).json({ error: 'IMEI é obrigatório' });
  if (!/^\d{15}$/.test(imei)) return res.status(400).json({ error: 'IMEI deve ter 15 dígitos numéricos' });

  // Verificar duplicata
  const exists = await queryOne('SELECT id FROM jimi_cameras WHERE imei=$1 AND tenant_id=$2', [imei, req.tenantId]);
  if (exists) return res.status(409).json({ error: 'IMEI já cadastrado' });

  const c = await queryOne(
    `INSERT INTO jimi_cameras(tenant_id, created_by, name, imei, camera_type, vehicle_id, location)
     VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.tenantId, req.user!.id, name, imei, cameraType || 'both', vehicleId || null, location || null]
  );
  return res.status(201).json(c);
});

// Atualizar câmera JIMI
router.put('/cameras/:id', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { name, imei, cameraType, vehicleId, location } = req.body;
  if (imei && !/^\d{15}$/.test(imei)) return res.status(400).json({ error: 'IMEI deve ter 15 dígitos numéricos' });

  const c = await queryOne(
    `UPDATE jimi_cameras SET
     name=COALESCE($1,name), imei=COALESCE($2,imei), camera_type=COALESCE($3,camera_type),
     vehicle_id=$4, location=COALESCE($5,location), updated_at=NOW()
     WHERE id=$6 AND tenant_id=$7 RETURNING *`,
    [name, imei, cameraType, vehicleId || null, location, req.params.id, req.tenantId]
  );
  if (!c) return res.status(404).json({ error: 'Câmera não encontrada' });
  return res.json(c);
});

// Deletar câmera
router.delete('/cameras/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  const r = await query('DELETE FROM jimi_cameras WHERE id=$1 AND tenant_id=$2 RETURNING id', [req.params.id, req.tenantId]);
  if (!r.length) return res.status(404).json({ error: 'Câmera não encontrada' });
  return res.json({ success: true });
});

// JIMI API endpoints were moved to /api/jimi/* (routes/jimi.ts)

// ════════════════════════════════════════════════════════════
// IP CAMERAS (fixed/surveillance — Hikvision, Intelbras, generic)
// ════════════════════════════════════════════════════════════

const VALID_MANUFACTURERS = ['hikvision','intelbras','dahua','axis','reolink','hanwha','bosch','uniview','vivotek','pelco','flir','avigilon','generic','other'];
const VALID_ANALYTICS = ['lpr', 'intrusion', 'line_crossing', 'person', 'face', 'motion'];
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

function stripPasswordFromRow(row: any): any {
  if (!row) return row;
  const { password_enc, ...rest } = row;
  return rest;
}

function defaultRtspPath(manufacturer: string): string {
  const map: Record<string, string> = {
    hikvision: '/Streaming/Channels/101',
    intelbras: '/cam/realmonitor?channel=1&subtype=0',
    generic: '/',
  };
  return map[manufacturer] || '/';
}

function buildRtspUrl(row: any): string {
  const pwd = row.password_enc ? decryptPassword(row.password_enc) : null;
  const user = row.username ? encodeURIComponent(row.username) : '';
  const auth = user && pwd ? `${user}:${encodeURIComponent(pwd)}@` : user ? `${user}@` : '';
  const path = row.rtsp_path || defaultRtspPath(row.manufacturer);
  return `rtsp://${auth}${row.ip_address}:${row.rtsp_port}${path}`;
}

async function syncCameraToShinobi(camRow: any): Promise<{ monitorId: string; groupKey: string }> {
  const monitorId = camRow.shinobi_monitor_id || `cam_${camRow.id}`;
  const groupKey = shinobi.getGroupKey();
  const rtspUrl = buildRtspUrl(camRow);
  await shinobi.upsertMonitor({ monitorId, name: camRow.name, rtspUrl, mode: 'start' });
  if (!camRow.shinobi_monitor_id) {
    await query(
      'UPDATE ip_cameras SET shinobi_monitor_id=$1, shinobi_group_key=$2 WHERE id=$3',
      [monitorId, groupKey, camRow.id],
    );
  }
  return { monitorId, groupKey };
}

// List IP cameras
router.get('/ip-cameras', auth, async (req: Request, res: Response) => {
  const activeOnly = req.query.active_only === 'true';
  let sql = 'SELECT * FROM ip_cameras';
  if (activeOnly) sql += ' WHERE active = TRUE';
  sql += ' ORDER BY name';
  const rows: any[] = await query(sql);
  return res.json(rows.map(stripPasswordFromRow));
});

// Get IP camera by ID
router.get('/ip-cameras/:id', auth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const cam = await queryOne('SELECT * FROM ip_cameras WHERE id=$1', [id]);
  if (!cam) return res.status(404).json({ error: 'Câmera não encontrada' });
  return res.json(stripPasswordFromRow(cam));
});

// Create IP camera
router.post('/ip-cameras', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { name, manufacturer, model, ip_address, http_port, rtsp_port, rtsp_path,
          username, password, latitude, longitude, location_desc,
          active, analytics_enabled, analytics_types, notes, vpn_tunnel_id,
          dispatch_enabled, dispatch_max_radius_m, dispatch_min_severity } = req.body;

  // Validation
  const errors: string[] = [];
  if (!name || typeof name !== 'string' || name.trim().length < 2) errors.push('name: mínimo 2 caracteres');
  if (!VALID_MANUFACTURERS.includes(manufacturer)) errors.push(`manufacturer: deve ser ${VALID_MANUFACTURERS.join(', ')}`);
  if (!ip_address || !IP_RE.test(ip_address)) errors.push('ip_address: IP inválido (ex: 192.168.1.100)');
  if (http_port !== undefined && (!Number.isInteger(http_port) || http_port < 1 || http_port > 65535)) errors.push('http_port: 1-65535');
  if (rtsp_port !== undefined && (!Number.isInteger(rtsp_port) || rtsp_port < 1 || rtsp_port > 65535)) errors.push('rtsp_port: 1-65535');
  if (latitude !== undefined && latitude !== null && (typeof latitude !== 'number' || latitude < -90 || latitude > 90)) errors.push('latitude: -90 a 90');
  if (longitude !== undefined && longitude !== null && (typeof longitude !== 'number' || longitude < -180 || longitude > 180)) errors.push('longitude: -180 a 180');
  if (analytics_types && (!Array.isArray(analytics_types) || analytics_types.some((t: string) => !VALID_ANALYTICS.includes(t)))) errors.push(`analytics_types: valores válidos: ${VALID_ANALYTICS.join(', ')}`);
  if (errors.length) return res.status(400).json({ error: 'validation', issues: errors });

  const passwordEnc = password ? encryptPassword(password) : null;
  const cam = await queryOne(
    `INSERT INTO ip_cameras
      (name, manufacturer, model, ip_address, http_port, rtsp_port, rtsp_path,
       username, password_enc, latitude, longitude, location_desc,
       active, analytics_enabled, analytics_types, notes, vpn_tunnel_id,
       dispatch_enabled, dispatch_max_radius_m, dispatch_min_severity)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [
      name.trim(), manufacturer, model || null,
      ip_address, http_port ?? 80, rtsp_port ?? 554, rtsp_path || null,
      username || null, passwordEnc,
      latitude ?? null, longitude ?? null, location_desc || null,
      active ?? true, analytics_enabled ?? false,
      analytics_types ?? [], notes || null,
      vpn_tunnel_id ?? null,
      dispatch_enabled ?? true, dispatch_max_radius_m ?? 10000, dispatch_min_severity ?? 'warning',
    ]
  );
  // Sync with Shinobi (non-blocking — camera is saved even if Shinobi fails)
  if (cam && (active ?? true)) {
    try {
      const { monitorId, groupKey } = await syncCameraToShinobi(cam);
      cam.shinobi_monitor_id = monitorId;
      cam.shinobi_group_key = groupKey;
    } catch (e: any) {
      console.error(`[ip-cameras] Shinobi sync failed cam=${cam.id}:`, e.message);
    }
  }
  return res.status(201).json(stripPasswordFromRow(cam));
});

// Update IP camera
router.put('/ip-cameras/:id', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });

  const { name, manufacturer, model, ip_address, http_port, rtsp_port, rtsp_path,
          username, password, latitude, longitude, location_desc,
          active, analytics_enabled, analytics_types, notes, vpn_tunnel_id,
          dispatch_enabled, dispatch_max_radius_m, dispatch_min_severity } = req.body;

  // Validation (only on provided fields)
  const errors: string[] = [];
  if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2)) errors.push('name: mínimo 2 caracteres');
  if (manufacturer !== undefined && !VALID_MANUFACTURERS.includes(manufacturer)) errors.push(`manufacturer: deve ser ${VALID_MANUFACTURERS.join(', ')}`);
  if (ip_address !== undefined && !IP_RE.test(ip_address)) errors.push('ip_address: IP inválido');
  if (http_port !== undefined && (!Number.isInteger(http_port) || http_port < 1 || http_port > 65535)) errors.push('http_port: 1-65535');
  if (rtsp_port !== undefined && (!Number.isInteger(rtsp_port) || rtsp_port < 1 || rtsp_port > 65535)) errors.push('rtsp_port: 1-65535');
  if (latitude !== undefined && latitude !== null && (typeof latitude !== 'number' || latitude < -90 || latitude > 90)) errors.push('latitude: -90 a 90');
  if (longitude !== undefined && longitude !== null && (typeof longitude !== 'number' || longitude < -180 || longitude > 180)) errors.push('longitude: -180 a 180');
  if (analytics_types !== undefined && (!Array.isArray(analytics_types) || analytics_types.some((t: string) => !VALID_ANALYTICS.includes(t)))) errors.push(`analytics_types: valores válidos: ${VALID_ANALYTICS.join(', ')}`);
  if (errors.length) return res.status(400).json({ error: 'validation', issues: errors });

  // Build dynamic SET clause — only update provided fields
  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;
  const fields: Record<string, any> = {
    name: name?.trim(), manufacturer, model, ip_address, http_port, rtsp_port, rtsp_path,
    username, latitude, longitude, location_desc, active, analytics_enabled, analytics_types, notes, vpn_tunnel_id,
    dispatch_enabled, dispatch_max_radius_m, dispatch_min_severity,
  };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = $${i++}`); vals.push(v); }
  }
  // Password: only re-encrypt if a non-empty string was provided
  if (password && typeof password === 'string' && password.length > 0) {
    sets.push(`password_enc = $${i++}`);
    vals.push(encryptPassword(password));
  }
  if (sets.length === 0) {
    const existing = await queryOne('SELECT * FROM ip_cameras WHERE id=$1', [id]);
    if (!existing) return res.status(404).json({ error: 'Câmera não encontrada' });
    return res.json(stripPasswordFromRow(existing));
  }
  vals.push(id);
  const cam = await queryOne(
    `UPDATE ip_cameras SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  if (!cam) return res.status(404).json({ error: 'Câmera não encontrada' });
  // Re-sync with Shinobi
  try {
    if (cam.active) {
      const { monitorId, groupKey } = await syncCameraToShinobi(cam);
      cam.shinobi_monitor_id = monitorId;
      cam.shinobi_group_key = groupKey;
    } else if (cam.shinobi_monitor_id) {
      await shinobi.setMonitorMode(cam.shinobi_monitor_id, 'stop');
    }
  } catch (e: any) {
    console.error(`[ip-cameras] Shinobi sync (update) failed cam=${cam.id}:`, e.message);
  }
  return res.json(stripPasswordFromRow(cam));
});

// Delete IP camera
router.delete('/ip-cameras/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const existing = await queryOne<any>('SELECT shinobi_monitor_id FROM ip_cameras WHERE id=$1', [id]);
  const r = await query('DELETE FROM ip_cameras WHERE id=$1 RETURNING id', [id]);
  if (!r.length) return res.status(404).json({ error: 'Câmera não encontrada' });
  if (existing?.shinobi_monitor_id) {
    try { await shinobi.deleteMonitor(existing.shinobi_monitor_id); }
    catch (e: any) { console.error(`[ip-cameras] Shinobi delete failed:`, e.message); }
  }
  return res.status(204).send();
});

// Snapshot proxy — fetches JPEG from Shinobi
router.get('/ip-cameras/:id/snapshot', auth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const cam = await queryOne<any>('SELECT shinobi_monitor_id FROM ip_cameras WHERE id=$1', [id]);
    if (!cam) return res.status(404).json({ error: 'Câmera não encontrada' });
    if (!cam.shinobi_monitor_id) {
      res.setHeader('X-Camera-Status', 'NAO_SINCRONIZADA');
      return res.status(204).end();
    }
    const buf = await shinobi.getSnapshotBuffer(cam.shinobi_monitor_id);
    if (!buf) return res.status(502).json({ error: 'Snapshot indisponível' });
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' });
    return res.send(buf);
  } catch (e: any) {
    console.error('[ip-cameras] snapshot error:', e.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// Stream info — returns internal Shinobi URLs for the frontend to use
router.get('/ip-cameras/:id/stream-info', auth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const cam = await queryOne<any>('SELECT shinobi_monitor_id, active FROM ip_cameras WHERE id=$1', [id]);
    if (!cam) return res.status(404).json({ error: 'Câmera não encontrada' });
    if (!cam.shinobi_monitor_id) return res.status(409).json({ error: 'Câmera não sincronizada' });
    const urls = shinobi.buildStreamUrls(cam.shinobi_monitor_id);
    return res.json({ monitor_id: cam.shinobi_monitor_id, active: cam.active, ...urls });
  } catch (e: any) {
    console.error('[ip-cameras] stream-info error:', e.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// Test connection — checks if Shinobi has the monitor and can snapshot
router.post('/ip-cameras/:id/test-connection', auth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const cam = await queryOne<any>('SELECT * FROM ip_cameras WHERE id=$1', [id]);
    if (!cam) return res.status(404).json({ error: 'Câmera não encontrada' });
    const result: any = { shinobi_synced: !!cam.shinobi_monitor_id, snapshot_ok: false, snapshot_bytes: 0, errors: [] };
    // Try to sync if not yet
    if (!cam.shinobi_monitor_id && cam.active) {
      try {
        await syncCameraToShinobi(cam);
        result.shinobi_synced = true;
        cam.shinobi_monitor_id = `cam_${cam.id}`;
      } catch (e: any) {
        result.errors.push(`Shinobi sync: ${e.message}`);
      }
    }
    if (cam.shinobi_monitor_id) {
      const buf = await shinobi.getSnapshotBuffer(cam.shinobi_monitor_id);
      if (buf) { result.snapshot_ok = true; result.snapshot_bytes = buf.length; }
      else result.errors.push('Snapshot vazio — Shinobi pode estar inicializando o stream (aguarde 10s e tente de novo)');
    } else {
      result.errors.push('Câmera não sincronizada com Shinobi');
    }
    return res.json(result);
  } catch (e: any) {
    console.error('[ip-cameras] test-connection error:', e.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// ════════════════════════════════════════════════════════════
// CAMERA EVENTS — webhook receiver + listing
// ════════════════════════════════════════════════════════════

const xmlParser = new XMLParser({ ignoreAttributes: false, parseAttributeValue: true });
const eventUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const SNAPSHOT_DIR = process.env.EVENT_SNAPSHOTS_DIR || '/app/data/event-snapshots';
const SNAPSHOT_URL_PREFIX = '/snapshots';
const eventRateLimits = new Map<number, { count: number; resetAt: number }>();

async function pullSnapshotForEvent(cameraId: number, eventId: number): Promise<void> {
  const cam = await queryOne<any>('SELECT shinobi_monitor_id FROM ip_cameras WHERE id=$1', [cameraId]);
  if (!cam?.shinobi_monitor_id) {
    await query('UPDATE ip_camera_events SET snapshot_source=$1 WHERE id=$2', ['none', eventId]);
    return;
  }
  let buf: Buffer | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      buf = await shinobi.getSnapshotBuffer(cam.shinobi_monitor_id);
      if (buf && buf.length > 200) break;
      buf = null;
    } catch {}
    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
  }
  if (buf) {
    const filename = `${eventId}.jpg`;
    await fsPromises.mkdir(SNAPSHOT_DIR, { recursive: true });
    await fsPromises.writeFile(path.join(SNAPSHOT_DIR, filename), buf);
    const url = `${SNAPSHOT_URL_PREFIX}/${filename}`;
    await query('UPDATE ip_camera_events SET snapshot_url=$1, snapshot_source=$2 WHERE id=$3', [url, 'pulled', eventId]);
    console.log(`[snapshot-pull] event=${eventId} cam=${cameraId} ok (${buf.length} bytes)`);
  } else {
    await query('UPDATE ip_camera_events SET snapshot_source=$1 WHERE id=$2', ['error', eventId]);
    console.warn(`[snapshot-pull] event=${eventId} cam=${cameraId} failed after 2 attempts`);
  }
}

function checkEventRate(camId: number): boolean {
  const now = Date.now();
  let b = eventRateLimits.get(camId);
  if (!b || b.resetAt < now) { b = { count: 0, resetAt: now + 60_000 }; eventRateLimits.set(camId, b); }
  return ++b.count <= 100;
}

const HIK_TYPE_MAP: Record<string, string> = {
  VMD: 'motion', videoloss: 'tampering', tamperdetection: 'tampering', shelteralarm: 'tampering',
  linedetection: 'line_crossing', fielddetection: 'intrusion', regionEntrance: 'intrusion', regionExiting: 'intrusion',
  ANPR: 'lpr', vehicledetection: 'lpr', TrafficCar: 'lpr',
  facedetection: 'face', facecapture: 'face', facelib: 'face',
};
const INT_CODE_MAP: Record<string, string> = {
  VideoMotion: 'motion', CrossLineDetection: 'line_crossing', CrossRegionDetection: 'intrusion',
  TrafficCar: 'lpr', TrafficJunction: 'lpr', FaceDetection: 'face', FaceRecognition: 'face',
  PeopleCounting: 'person', VideoBlind: 'tampering', VideoLoss: 'tampering',
};

function parseEventPayload(raw: Buffer, ct: string): { event_type: string; severity: string; occurred_at: Date; event_data: any } {
  const text = raw.toString('utf-8');
  // Try Hikvision XML
  if (ct.includes('xml') || text.trimStart().startsWith('<')) {
    try {
      const parsed = xmlParser.parse(text);
      const alert = parsed.EventNotificationAlert || parsed.EventNotification || {};
      if (alert.eventType) {
        const rawType = String(alert.eventType).trim();
        const event_type = HIK_TYPE_MAP[rawType] || HIK_TYPE_MAP[rawType.toLowerCase()] || 'unknown';
        const dt = alert.dateTime ? new Date(alert.dateTime) : new Date();
        const event_data: any = { raw_event_type: rawType, description: alert.eventDescription, state: alert.eventState, channel_id: alert.channelID };
        if (alert.ANPR || alert.LPR) {
          const a = alert.ANPR || alert.LPR;
          event_data.plate = a.licensePlate; event_data.confidence = a.confidence; event_data.vehicle_type = a.vehicleType;
        }
        if (alert.facedetection || alert.FaceCapture) {
          const f = alert.facedetection || alert.FaceCapture;
          event_data.face_id = f.faceID; event_data.confidence = f.similarity;
        }
        const severity = ['intrusion', 'tampering'].includes(event_type) ? 'critical' : ['lpr', 'face'].includes(event_type) ? 'warning' : 'info';
        return { event_type, severity, occurred_at: isNaN(dt.getTime()) ? new Date() : dt, event_data };
      }
    } catch {}
  }
  // Try JSON (Intelbras or generic)
  if (ct.includes('json') || text.trimStart().startsWith('{')) {
    try {
      const json = JSON.parse(text);
      const ev = json.Event || (Array.isArray(json.events) ? json.events[0] : null) || json;
      const code = String(ev.Code || ev.EventCode || '').trim();
      if (code && INT_CODE_MAP[code]) {
        const event_type = INT_CODE_MAP[code];
        const dt = ev.OccurredTime || ev.UTC || ev.Time;
        let occurred_at = new Date();
        if (dt) { const p = new Date(typeof dt === 'number' ? dt * 1000 : dt); if (!isNaN(p.getTime())) occurred_at = p; }
        const event_data: any = { raw_event_code: code, action: ev.Action, channel: ev.Channel ?? ev.Index, event_id: ev.EventID };
        if (code === 'TrafficCar' || code === 'TrafficJunction') {
          const car = ev.Object || ev.TrafficCar || ev;
          event_data.plate = car.Plate?.PlateNumber || car.PlateNumber || car.LicensePlate;
          event_data.plate_color = car.Plate?.PlateColor || car.PlateColor;
          event_data.vehicle_type = car.VehicleType; event_data.confidence = car.Confidence;
        }
        if (code.startsWith('Face')) { event_data.face_id = ev.PersonInfo?.UID || ev.FaceID; event_data.confidence = ev.Confidence; }
        const severity = ['intrusion', 'tampering'].includes(event_type) ? 'critical' : ['lpr', 'face'].includes(event_type) ? 'warning' : 'info';
        return { event_type, severity, occurred_at, event_data };
      }
      return { event_type: 'unknown', severity: 'info', occurred_at: new Date(), event_data: { payload_excerpt: text.slice(0, 500) } };
    } catch {}
  }
  return { event_type: 'unknown', severity: 'info', occurred_at: new Date(), event_data: { parse_error: 'unrecognized format', excerpt: text.slice(0, 300) } };
}

// PUBLIC webhook — auth via token in path
router.post('/ip-cameras/:id/events/:token', (req: any, res, next) => {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('multipart')) {
    return eventUpload.any()(req, res, (err: any) => {
      if (err) { console.error('[webhook] multer error:', err); return res.status(200).json({ ok: false, error: 'upload_error' }); }
      next();
    });
  }
  // express.json() parsed JSON → req.body is object; express.text() parsed XML → req.body is string
  if (req.body) {
    if (typeof req.body === 'object') req.rawBody = Buffer.from(JSON.stringify(req.body));
    else if (typeof req.body === 'string') req.rawBody = Buffer.from(req.body);
    else req.rawBody = Buffer.alloc(0);
    return next();
  }
  // Fallback: read raw stream
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => { req.rawBody = Buffer.concat(chunks); next(); });
  req.on('error', next);
}, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const token = String(req.params.token);
    if (!Number.isInteger(id)) return res.status(403).json({ error: 'forbidden' });

    const cam = await queryOne<any>('SELECT id, webhook_token::text AS wt FROM ip_cameras WHERE id=$1 AND active=true', [id]);
    if (!cam) return res.status(403).json({ error: 'forbidden' });
    const expected = Buffer.from(cam.wt); const provided = Buffer.from(token);
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided))
      return res.status(403).json({ error: 'forbidden' });

    if (!checkEventRate(id)) return res.status(429).json({ error: 'rate_limit' });

    let rawBody: Buffer = (req as any).rawBody || Buffer.alloc(0);
    let snapshotBuf: Buffer | undefined;
    if (Array.isArray((req as any).files)) {
      for (const f of (req as any).files as Express.Multer.File[]) {
        if (f.mimetype?.startsWith('image/')) snapshotBuf = f.buffer;
        else rawBody = Buffer.concat([rawBody, f.buffer]);
      }
    }

    const ct = req.headers['content-type'] || '';
    const parsed = parseEventPayload(rawBody, ct);
    const inserted = await queryOne<any>(
      `INSERT INTO ip_camera_events (camera_id, event_type, severity, payload, occurred_at, demo)
       VALUES ($1,$2,$3,$4,$5,(SELECT demo FROM ip_cameras WHERE id=$1)) RETURNING id`,
      [id, parsed.event_type, parsed.severity, JSON.stringify(parsed.event_data), parsed.occurred_at]
    );
    const eventId = inserted.id;

    if (snapshotBuf && snapshotBuf.length > 500) {
      // Inline snapshot from multipart
      const filename = `${eventId}.jpg`;
      await fsPromises.mkdir(SNAPSHOT_DIR, { recursive: true });
      await fsPromises.writeFile(path.join(SNAPSHOT_DIR, filename), snapshotBuf);
      const snapshotUrl = `/snapshots/${filename}`;
      await query('UPDATE ip_camera_events SET snapshot_url=$1, snapshot_source=$2 WHERE id=$3', [snapshotUrl, 'inline', eventId]);
    } else {
      // No inline snapshot — pull from Shinobi in background
      setImmediate(() => pullSnapshotForEvent(id, eventId).catch(e =>
        console.error(`[snapshot-pull] unhandled event=${eventId}:`, e.message)
      ));
    }

    await query('UPDATE ip_cameras SET last_event_received_at=NOW(), events_received_count=events_received_count+1 WHERE id=$1', [id]);

    // Dispatch to closest agent (async, fire-and-forget)
    setImmediate(async () => {
      try {
        const tenant = await queryOne<any>('SELECT id FROM tenants LIMIT 1');
        if (tenant) await dispatchEventAsync(Number(eventId), id, parsed.severity, tenant.id);
      } catch (e: any) {
        console.error(`[dispatch] unhandled event=${eventId}:`, e.message);
      }
    });

    return res.status(200).json({ ok: true, event_id: eventId });
  } catch (e: any) {
    console.error('[webhook] error:', e.message);
    return res.status(200).json({ ok: false, error: 'internal' });
  }
});

// List events (authed)
router.get('/events', auth, async (req: Request, res: Response) => {
  try {
    const where: string[] = []; const vals: any[] = []; let i = 1;
    if (req.query.camera_id) { where.push(`camera_id=$${i++}`); vals.push(Number(req.query.camera_id)); }
    if (req.query.event_type) { where.push(`event_type=$${i++}`); vals.push(req.query.event_type); }
    if (req.query.severity) { where.push(`severity=$${i++}`); vals.push(req.query.severity); }
    if (req.query.since) { where.push(`received_at>=$${i++}`); vals.push(new Date(String(req.query.since))); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    const events = await query(`SELECT id,camera_id,event_type,severity,payload,snapshot_url,occurred_at,received_at,dispatched_to_user_id,dispatched_to_wf_username,dispatched_to_distance_m,dispatched_at,dispatch_status,dispatch_error,acknowledged_at FROM ip_camera_events ${w} ORDER BY received_at DESC LIMIT ${limit} OFFSET ${offset}`, vals);
    const total = await queryOne<any>(`SELECT COUNT(*)::int AS n FROM ip_camera_events ${w}`, vals);
    return res.json({ events, total: total?.n || 0 });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.get('/ip-cameras/:id/events', auth, async (req: Request, res: Response) => {
  try {
    const camId = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    const events = await query(`SELECT id,camera_id,event_type,severity,payload,snapshot_url,occurred_at,received_at,dispatched_to_wf_username,dispatched_to_distance_m,dispatch_status FROM ip_camera_events WHERE camera_id=$1 ORDER BY received_at DESC LIMIT ${limit} OFFSET ${offset}`, [camId]);
    const total = await queryOne<any>('SELECT COUNT(*)::int AS n FROM ip_camera_events WHERE camera_id=$1', [camId]);
    return res.json({ events, total: total?.n || 0 });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.post('/ip-cameras/:id/regenerate-webhook-token', auth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const r = await queryOne<any>('UPDATE ip_cameras SET webhook_token=gen_random_uuid() WHERE id=$1 RETURNING webhook_token::text AS wt', [id]);
    if (!r) return res.status(404).json({ error: 'not found' });
    return res.json({ webhook_token: r.wt });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.get('/ip-cameras/:id/webhook-url', auth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const r = await queryOne<any>('SELECT webhook_token::text AS wt FROM ip_cameras WHERE id=$1', [id]);
    if (!r) return res.status(404).json({ error: 'not found' });
    return res.json({ url: `https://104.237.5.59/api/ip-cameras/${id}/events/${r.wt}`, token: r.wt });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// HLS stream proxy — browser can't reach Shinobi directly
router.get('/ip-cameras/by-monitor/:mid/stream.m3u8', auth, async (req: Request, res: Response) => {
  try {
    const url = shinobi.buildInternalHlsUrl(req.params.mid);
    const r = await axios.get(url, { timeout: 8000, responseType: 'text' });
    if (r.status !== 200) return res.status(r.status).send(r.data);
    // Rewrite segment URLs to go through our proxy
    const rewritten = String(r.data).replace(
      /^([^#\s].+\.ts.*)$/gm,
      `/api/ip-cameras/by-monitor/${req.params.mid}/seg/$1`
    );
    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.set('Cache-Control', 'no-store');
    return res.send(rewritten);
  } catch (e: any) {
    console.error('[ip-cameras] HLS proxy error:', e.message);
    return res.status(502).json({ error: 'HLS unavailable' });
  }
});

router.get('/ip-cameras/by-monitor/:mid/seg/*', auth, async (req: Request, res: Response) => {
  try {
    const segment = (req.params as any)[0] || req.path.split('/seg/')[1];
    const url = shinobi.buildInternalHlsSegmentUrl(req.params.mid, segment);
    const r = await axios.get(url, { timeout: 8000, responseType: 'arraybuffer' });
    if (r.status !== 200) return res.status(r.status).end();
    res.set('Content-Type', 'video/mp2t');
    res.set('Cache-Control', 'no-store');
    return res.send(Buffer.from(r.data));
  } catch (e: any) {
    console.error('[ip-cameras] HLS segment proxy error:', e.message);
    return res.status(502).end();
  }
});

// MJPEG stream proxy — pipes Shinobi's MJPEG stream directly
router.get('/ip-cameras/by-monitor/:mid/stream.mjpeg', auth, async (req: Request, res: Response) => {
  try {
    const url = shinobi.buildInternalMjpegUrl(req.params.mid);
    const upstream = await axios.get(url, { responseType: 'stream', timeout: 30000 });
    res.set('Content-Type', upstream.headers['content-type'] || 'multipart/x-mixed-replace');
    res.set('Cache-Control', 'no-store');
    upstream.data.pipe(res);
    req.on('close', () => { try { upstream.data.destroy(); } catch {} });
  } catch (e: any) {
    console.error('[ip-cameras] MJPEG proxy error:', e.message);
    return res.status(502).end();
  }
});

router.get('/ip-cameras/by-monitor/:mid/snapshot.jpg', auth, async (req: Request, res: Response) => {
  try {
    const buf = await shinobi.getSnapshotBuffer(req.params.mid);
    if (!buf) return res.status(502).end();
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'no-store');
    return res.send(buf);
  } catch (e: any) {
    return res.status(502).end();
  }
});

// ════════════════════════════════════════════════════════════
// DISPATCHER + WF AGENTS
// ════════════════════════════════════════════════════════════

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const SEVERITY_RANK: Record<string, number> = { info: 0, warning: 1, critical: 2 };
const AGENT_ONLINE_MS = 300000; // 5 min

async function getTraccarPositions(tenantId: string): Promise<any[]> {
  const cfg = await getTraccar(tenantId);
  if (!cfg) throw new Error('traccar_not_configured');
  const r = await axios.get(`${cfg.base}/api/positions`, { auth: cfg.auth, timeout: 5000 });
  return Array.isArray(r.data) ? r.data : [];
}

async function dispatchEventAsync(eventId: number, cameraId: number, severity: string, tenantId: string): Promise<void> {
  try {
    const cam = await queryOne<any>(
      'SELECT latitude, longitude, dispatch_enabled, dispatch_max_radius_m, dispatch_min_severity FROM ip_cameras WHERE id=$1',
      [cameraId],
    );
    if (!cam) return await markDispatch(eventId, 'no_camera_coords', 'camera_not_found');
    if (!cam.dispatch_enabled) return await markDispatch(eventId, 'disabled');
    if ((SEVERITY_RANK[severity] || 0) < (SEVERITY_RANK[cam.dispatch_min_severity] || 1))
      return await markDispatch(eventId, 'below_severity');
    if (cam.latitude == null || cam.longitude == null)
      return await markDispatch(eventId, 'no_camera_coords');

    const agents = await query<any>('SELECT id, wf_username, display_name, traccar_device_id FROM wf_agents WHERE enabled=true AND traccar_device_id IS NOT NULL');
    if (!agents.length) return await markDispatch(eventId, 'no_agent_in_radius', 'no_enabled_agents');

    let positions: any[];
    try {
      positions = await getTraccarPositions(tenantId);
    } catch (e: any) {
      return await markDispatch(eventId, 'traccar_error', e.message);
    }

    const now = Date.now();
    const freshPos = new Map<number, any>();
    for (const p of positions) {
      if (p.valid && (now - new Date(p.fixTime).getTime()) < AGENT_ONLINE_MS)
        freshPos.set(p.deviceId, p);
    }

    let best: { agent: any; dist: number } | null = null;
    for (const ag of agents) {
      const pos = freshPos.get(ag.traccar_device_id);
      if (!pos) continue;
      const dist = haversineMeters(Number(cam.latitude), Number(cam.longitude), pos.latitude, pos.longitude);
      if (dist > cam.dispatch_max_radius_m) continue;
      if (!best || dist < best.dist) best = { agent: ag, dist };
    }

    if (!best) return await markDispatch(eventId, 'no_agent_in_radius');

    await query(
      `UPDATE ip_camera_events SET dispatched_to_user_id=$1, dispatched_to_wf_username=$2,
       dispatched_to_distance_m=$3, dispatched_at=NOW(), dispatch_status='selected', dispatch_error=NULL
       WHERE id=$4`,
      [String(best.agent.id), best.agent.wf_username, Math.round(best.dist), eventId],
    );
    console.log(`[dispatch] event=${eventId} → ${best.agent.wf_username} (${Math.round(best.dist)}m)`);
  } catch (e: any) {
    console.error(`[dispatch] event=${eventId} failed:`, e.message);
    await markDispatch(eventId, 'traccar_error', e.message).catch(() => {});
  }
}

async function markDispatch(eventId: number, status: string, error?: string): Promise<void> {
  await query(
    'UPDATE ip_camera_events SET dispatch_status=$1, dispatch_error=$2, dispatched_at=NOW() WHERE id=$3',
    [status, error || null, eventId],
  );
}

// WF Agents CRUD
router.get('/agents', auth, async (_req: Request, res: Response) => {
  try { return res.json(await query('SELECT * FROM wf_agents ORDER BY id')); }
  catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.post('/agents', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  try {
    const { wf_username, display_name, traccar_device_id, enabled, notes } = req.body;
    if (!wf_username) return res.status(400).json({ error: 'wf_username obrigatório' });
    const r = await queryOne(
      `INSERT INTO wf_agents (wf_username, display_name, traccar_device_id, enabled, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [wf_username, display_name || null, traccar_device_id ?? null, enabled ?? true, notes || null],
    );
    return res.status(201).json(r);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'Username ou device_id duplicado' });
    return res.status(500).json({ error: e.message });
  }
});

router.put('/agents/:id', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { wf_username, display_name, traccar_device_id, enabled, notes } = req.body;
    const sets: string[] = []; const vals: any[] = []; let i = 1;
    if (wf_username !== undefined) { sets.push(`wf_username=$${i++}`); vals.push(wf_username); }
    if (display_name !== undefined) { sets.push(`display_name=$${i++}`); vals.push(display_name); }
    if (traccar_device_id !== undefined) { sets.push(`traccar_device_id=$${i++}`); vals.push(traccar_device_id); }
    if (enabled !== undefined) { sets.push(`enabled=$${i++}`); vals.push(enabled); }
    if (notes !== undefined) { sets.push(`notes=$${i++}`); vals.push(notes); }
    if (!sets.length) return res.status(400).json({ error: 'nada pra atualizar' });
    vals.push(id);
    const r = await queryOne(`UPDATE wf_agents SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, vals);
    if (!r) return res.status(404).json({ error: 'not found' });
    return res.json(r);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'duplicado' });
    return res.status(500).json({ error: e.message });
  }
});

router.delete('/agents/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await query('DELETE FROM wf_agents WHERE id=$1', [id]);
    return res.status(204).send();
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// Traccar devices for agent linking dropdown
router.get('/dispatch/traccar-devices', auth, async (req: Request, res: Response) => {
  try {
    const cfg = await getTraccar(req.tenantId!);
    if (!cfg) return res.json([]);
    const r = await axios.get(`${cfg.base}/api/devices`, { auth: cfg.auth, timeout: 5000 });
    return res.json(Array.isArray(r.data) ? r.data : []);
  } catch (e: any) { return res.status(502).json({ error: e.message }); }
});

// Redispatch
router.post('/events/:id/redispatch', auth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const eventId = Number(req.params.id);
    const ev = await queryOne<any>('SELECT camera_id, severity FROM ip_camera_events WHERE id=$1', [eventId]);
    if (!ev) return res.status(404).json({ error: 'event not found' });
    await dispatchEventAsync(eventId, ev.camera_id, ev.severity, req.tenantId!);
    const updated = await queryOne<any>('SELECT dispatch_status, dispatched_to_wf_username, dispatched_to_distance_m, dispatch_error FROM ip_camera_events WHERE id=$1', [eventId]);
    return res.json(updated);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// VPN TUNNELS
// ════════════════════════════════════════════════════════════

import fs from 'fs';

function stripConfigEnc(row: any): any {
  if (!row) return row;
  const { config_enc, ...rest } = row;
  return rest;
}

function parseWgConf(text: string): { privateKey: string; address: string; publicKey: string; endpoint: string; allowedIps: string[]; keepalive?: number } {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  let section = '';
  const iface: Record<string, string> = {};
  const peer: Record<string, string> = {};
  for (const ln of lines) {
    if (ln.startsWith('[') && ln.endsWith(']')) { section = ln.slice(1, -1).toLowerCase(); continue; }
    const eq = ln.indexOf('=');
    if (eq < 0) continue;
    const k = ln.slice(0, eq).trim(), v = ln.slice(eq + 1).trim();
    if (section === 'interface') iface[k] = v;
    else if (section === 'peer') peer[k] = v;
  }
  if (!iface.PrivateKey) throw new Error('[Interface] PrivateKey ausente');
  if (!iface.Address)    throw new Error('[Interface] Address ausente');
  if (!peer.PublicKey)   throw new Error('[Peer] PublicKey ausente');
  if (!peer.Endpoint)    throw new Error('[Peer] Endpoint ausente');
  if (!peer.AllowedIPs)  throw new Error('[Peer] AllowedIPs ausente');
  const b64 = /^[A-Za-z0-9+/]{43}=$/;
  if (!b64.test(iface.PrivateKey)) throw new Error('PrivateKey formato inválido');
  if (!b64.test(peer.PublicKey))   throw new Error('PublicKey formato inválido');
  return {
    privateKey: iface.PrivateKey, address: iface.Address,
    publicKey: peer.PublicKey, endpoint: peer.Endpoint,
    allowedIps: peer.AllowedIPs.split(',').map(s => s.trim()).filter(Boolean),
    keepalive: peer.PersistentKeepalive ? Number(peer.PersistentKeepalive) : undefined,
  };
}

function buildCanonicalConf(p: ReturnType<typeof parseWgConf>, iface: string): string {
  const lines = [
    '[Interface]', `PrivateKey = ${p.privateKey}`, `Address = ${p.address}`,
    `PostUp = iptables -t nat -A POSTROUTING -o ${iface} -j MASQUERADE`,
    `PostDown = iptables -t nat -D POSTROUTING -o ${iface} -j MASQUERADE`,
    '', '[Peer]', `PublicKey = ${p.publicKey}`, `Endpoint = ${p.endpoint}`,
    `AllowedIPs = ${p.allowedIps.join(', ')}`,
  ];
  if (p.keepalive) lines.push(`PersistentKeepalive = ${p.keepalive}`);
  lines.push('');
  return lines.join('\n');
}

function triggerWgApply(): void {
  try { fs.writeFileSync('/etc/wireguard/.apply', String(Date.now()), { mode: 0o600 }); }
  catch (e) { console.error('[vpn] trigger apply failed:', e); }
}

async function nextFreeInterface(): Promise<string> {
  const taken = await query<any>('SELECT interface_name FROM vpn_tunnels');
  const names = new Set(taken.map((r: any) => r.interface_name));
  for (let i = 0; i < 256; i++) {
    if (!names.has(`wg${i}`)) return `wg${i}`;
  }
  throw new Error('Esgotaram interfaces wg0-wg255');
}

router.get('/vpn/tunnels', auth, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    const rows: any[] = await query(
      `SELECT id, name, interface_name, address, endpoint, allowed_ips, public_key,
              enabled, status, last_handshake_at, bytes_rx, bytes_tx, last_error,
              last_status_check, notes, created_at, updated_at
       FROM vpn_tunnels ORDER BY id`
    );
    return res.json(rows);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.get('/vpn/tunnels/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const t = await queryOne(
      `SELECT id, name, interface_name, address, endpoint, allowed_ips, public_key,
              enabled, status, last_handshake_at, bytes_rx, bytes_tx, last_error,
              last_status_check, notes, created_at, updated_at
       FROM vpn_tunnels WHERE id=$1`, [id]
    );
    if (!t) return res.status(404).json({ error: 'Tunnel não encontrado' });
    return res.json(t);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.get('/vpn/tunnels/:id/status', auth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const t = await queryOne(
      `SELECT id, status, last_handshake_at, bytes_rx, bytes_tx, last_error, last_status_check
       FROM vpn_tunnels WHERE id=$1`, [id]
    );
    if (!t) return res.status(404).json({ error: 'Tunnel não encontrado' });
    return res.json({ ...t, live: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// Create VPN tunnel
router.post('/vpn/tunnels', auth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { name, conf_text, enabled, notes } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 2)
      return res.status(400).json({ error: 'name: mínimo 2 caracteres' });
    if (!conf_text || typeof conf_text !== 'string' || conf_text.length < 50)
      return res.status(400).json({ error: 'conf_text: cole a config WireGuard completa' });

    let parsed;
    try { parsed = parseWgConf(conf_text); }
    catch (e: any) { return res.status(400).json({ error: 'invalid_conf', message: e.message }); }

    const iface = await nextFreeInterface();
    const canonical = buildCanonicalConf(parsed, iface);
    const config_enc = encryptPassword(canonical);

    const t = await queryOne(
      `INSERT INTO vpn_tunnels (name, interface_name, config_enc, address, endpoint, allowed_ips, public_key, enabled, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9) RETURNING *`,
      [name.trim(), iface, config_enc, parsed.address, parsed.endpoint, parsed.allowedIps, parsed.publicKey, enabled ?? true, notes ?? null]
    );
    triggerWgApply();
    return res.status(201).json(stripConfigEnc(t));
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// Update VPN tunnel
router.put('/vpn/tunnels/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const existing = await queryOne<any>('SELECT * FROM vpn_tunnels WHERE id=$1', [id]);
    if (!existing) return res.status(404).json({ error: 'Tunnel não encontrado' });

    const { name, conf_text, enabled, notes } = req.body;
    const sets: string[] = []; const vals: any[] = []; let i = 1;

    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name.trim()); }
    if (notes !== undefined) { sets.push(`notes = $${i++}`); vals.push(notes); }
    if (enabled !== undefined) { sets.push(`enabled = $${i++}`); vals.push(enabled); }

    if (conf_text && typeof conf_text === 'string' && conf_text.length > 10) {
      let parsed;
      try { parsed = parseWgConf(conf_text); }
      catch (e: any) { return res.status(400).json({ error: 'invalid_conf', message: e.message }); }
      const canonical = buildCanonicalConf(parsed, existing.interface_name);
      sets.push(`config_enc = $${i++}`); vals.push(encryptPassword(canonical));
      sets.push(`address = $${i++}`);    vals.push(parsed.address);
      sets.push(`endpoint = $${i++}`);   vals.push(parsed.endpoint);
      sets.push(`allowed_ips = $${i++}`); vals.push(parsed.allowedIps);
      sets.push(`public_key = $${i++}`); vals.push(parsed.publicKey);
      sets.push(`status = 'pending'`);
    }

    if (sets.length === 0) return res.json(stripConfigEnc(existing));
    vals.push(id);
    const t = await queryOne(`UPDATE vpn_tunnels SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, vals);
    triggerWgApply();
    return res.json(stripConfigEnc(t));
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// Delete VPN tunnel
router.delete('/vpn/tunnels/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const refs = await queryOne<any>('SELECT COUNT(*)::int AS n FROM ip_cameras WHERE vpn_tunnel_id=$1', [id]);
    if (refs && refs.n > 0) return res.status(409).json({ error: `Não é possível excluir: ${refs.n} câmera(s) usam este tunnel` });
    const r = await query('DELETE FROM vpn_tunnels WHERE id=$1 RETURNING interface_name', [id]);
    if (!r.length) return res.status(404).json({ error: 'Tunnel não encontrado' });
    triggerWgApply();
    // Cleanup conf file
    try { fs.unlinkSync(`/etc/wireguard/${r[0].interface_name}.conf`); } catch {}
    return res.status(204).send();
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});
// VPN TUNNEL DIAGNOSTICS
router.post('/vpn/tunnels/:id/diagnose', auth, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { target_ip, target_port } = req.body;
  try {
    const tunnel = await queryOne<any>('SELECT * FROM vpn_tunnels WHERE id=$1', [id]);
    if (!tunnel) return res.status(404).json({ error: 'Tunnel not found' });

    const results: any = {
      tunnel_name: tunnel.name,
      interface: tunnel.interface_name,
      status: tunnel.status,
      enabled: tunnel.enabled,
    };

    // 1. Verificar status WireGuard via wg show
    try {
      const { execSync } = require('child_process');
      const wgOut = execSync(`wg show ${tunnel.interface_name} 2>/dev/null || echo "interface_not_found"`, { timeout: 5000 }).toString();
      if (wgOut.includes('interface_not_found') || wgOut.includes('No such device')) {
        results.wg_status = 'interface_not_found';
        results.handshake = null;
      } else {
        results.wg_status = 'up';
        // Extrair handshake
        const hsMatch = wgOut.match(/latest handshake:\s*(.+)/);
        results.handshake = hsMatch ? hsMatch[1].trim() : 'never';
        // Extrair transfer
        const txMatch = wgOut.match(/transfer:\s*(.+)/);
        results.transfer = txMatch ? txMatch[1].trim() : null;
        // Extrair endpoint
        const epMatch = wgOut.match(/endpoint:\s*(.+)/);
        results.peer_endpoint = epMatch ? epMatch[1].trim() : null;
      }
    } catch (e: any) {
      results.wg_status = 'error';
      results.wg_error = e.message?.slice(0, 120);
    }

    // 2. Teste TCP para o IP alvo (câmera)
    if (target_ip) {
      const ports = target_port ? [parseInt(target_port)] : [80, 554, 8000, 443, 8080];
      results.tcp_tests = [];
      for (const port of ports) {
        const start = Date.now();
        try {
          const net = require('net');
          await new Promise<void>((resolve, reject) => {
            const sock = new net.Socket();
            sock.setTimeout(3000);
            sock.connect(port, target_ip, () => {
              sock.destroy();
              resolve();
            });
            sock.on('timeout', () => { sock.destroy(); reject(new Error('timeout')); });
            sock.on('error', (e: any) => { sock.destroy(); reject(e); });
          });
          results.tcp_tests.push({ port, status: 'open', latency_ms: Date.now() - start });
        } catch (e: any) {
          results.tcp_tests.push({ port, status: e.message === 'timeout' ? 'timeout' : 'closed', latency_ms: Date.now() - start });
        }
      }
      // Resumo: pelo menos uma porta aberta = câmera alcançável
      results.camera_reachable = results.tcp_tests.some((t: any) => t.status === 'open');
    }

    // 3. Ping via exec (ICMP)
    if (target_ip) {
      try {
        const { execSync } = require('child_process');
        const pingOut = execSync(`ping -c 3 -W 2 ${target_ip} 2>&1`, { timeout: 10000 }).toString();
        const lossMatch = pingOut.match(/(\d+)% packet loss/);
        const rttMatch = pingOut.match(/rtt .+ = [\d.]+\/([\d.]+)/);
        results.ping = {
          packet_loss: lossMatch ? parseInt(lossMatch[1]) : 100,
          avg_rtt_ms: rttMatch ? parseFloat(rttMatch[1]) : null,
          raw: pingOut.split('\n').slice(-3).join(' ').trim(),
        };
      } catch (e: any) {
        results.ping = { packet_loss: 100, avg_rtt_ms: null, raw: e.message?.slice(0, 120) };
      }
    }

    return res.json(results);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});


// ════════════════════════════════════════════════════════════
// WF MESSAGE SENDER (admin/test)
// ════════════════════════════════════════════════════════════

import { wfClient } from '../lib/wf-client';

router.post('/wf/send-test-message', auth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    if (process.env.WF_BOT_ENABLED !== 'true') {
      return res.status(503).json({ error: 'wf_bot_disabled', message: 'Bot WF está desabilitado. Defina WF_BOT_ENABLED=true e reinicie o backend.' });
    }
    const { to_device_id, to_name, text } = req.body;
    if (!to_device_id || !text) return res.status(400).json({ error: 'to_device_id e text obrigatórios' });
    const r = await wfClient.sendPrivateMessage(to_device_id, to_name || 'unknown', text);
    return res.json(r);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.get('/wf/messages', auth, async (_req: Request, res: Response) => {
  try {
    const rows: any[] = await query(
      `SELECT id, job_id, to_name, text, status, sent_at, delivered_at, error_message, created_at
       FROM wf_messages ORDER BY id DESC LIMIT 50`
    );
    return res.json(rows);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.get('/wf/status', auth, async (_req: Request, res: Response) => {
  return res.json({
    enabled: process.env.WF_BOT_ENABLED === 'true',
    relay_url: process.env.WF_RELAY_WS_URL || 'ws://groupates_walkiefleet:8070/ws',
    bot_login: process.env.WF_BOT_LOGIN || 'USER1',
  });
});

// ════════════════════════════════════════════════════════════
// MAP — Cockpit unificado /api/map/overview
// ════════════════════════════════════════════════════════════

router.get('/map/overview', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const FRESH_MS = 10 * 60 * 1000;
    const now = Date.now();

    // 1) Câmeras IP fixas com coords (sem tenant — globais)
    const ipCams = await query(
      `SELECT id, name, manufacturer, latitude, longitude, location_desc,
              active, shinobi_monitor_id,
              last_event_received_at, events_received_count, demo
       FROM ip_cameras
       WHERE active = true AND latitude IS NOT NULL AND longitude IS NOT NULL`
    );

    // 2) Câmeras Jimi (filtradas por tenant)
    let jimiCams: any[] = [];
    try {
      jimiCams = await query(
        `SELECT id, name, imei,
                last_lat AS latitude, last_lng AS longitude,
                last_gps_time AS last_position_at, status, demo
         FROM jimi_cameras
         WHERE tenant_id = $1 AND last_lat IS NOT NULL AND last_lng IS NOT NULL`,
        [tenantId]
      );
    } catch (e: any) {
      console.warn('[map] jimi_cameras query failed:', e.code || e.message);
    }

    // 3) Agentes WF (globais) com device Traccar
    const wfAgentRows = await query<any>(
      `SELECT id, wf_username, display_name, traccar_device_id, demo
       FROM wf_agents
       WHERE enabled = TRUE AND traccar_device_id IS NOT NULL`
    );
    const wfDeviceIds = new Set<number>(wfAgentRows.map((a: any) => a.traccar_device_id));

    // 4) Posições Traccar + devices (best-effort)
    let positions: any[] = [];
    let traccarDevices: any[] = [];
    try {
      positions = await getTraccarPositions(tenantId);
    } catch (e: any) {
      console.warn('[map] traccar positions offline:', e.message);
    }
    try {
      const cfg = await getTraccar(tenantId);
      if (cfg) {
        const r = await axios.get(`${cfg.base}/api/devices`, { auth: cfg.auth, timeout: 5000 });
        traccarDevices = Array.isArray(r.data) ? r.data : [];
      }
    } catch (e: any) {
      console.warn('[map] traccar devices offline:', e.message);
    }
    const deviceById = new Map<number, any>();
    for (const d of traccarDevices) deviceById.set(d.id, d);

    const freshPositions = positions.filter((p: any) => {
      if (!p.fixTime) return false;
      return (now - new Date(p.fixTime).getTime()) < FRESH_MS;
    });

    // 5) Cruzar wf_agents × posições frescas
    const agents: any[] = [];
    for (const a of wfAgentRows) {
      const pos = freshPositions.find((p: any) => p.deviceId === a.traccar_device_id);
      if (!pos) continue;
      agents.push({
        id: a.id,
        wf_username: a.wf_username,
        display_name: a.display_name,
        traccar_device_id: a.traccar_device_id,
        latitude: pos.latitude,
        longitude: pos.longitude,
        fix_time: pos.fixTime,
        speed_knots: pos.speed,
        demo: !!a.demo,
      });
    }

    // 6) Trackers = posições frescas que NÃO são wf_agents
    const trackers = freshPositions
      .filter((p: any) => !wfDeviceIds.has(p.deviceId))
      .map((p: any) => {
        const dev = deviceById.get(p.deviceId);
        const uniqueId: string = dev?.uniqueId || '';
        return {
          device_id: p.deviceId,
          name: dev?.name || `Device #${p.deviceId}`,
          latitude: p.latitude,
          longitude: p.longitude,
          fix_time: p.fixTime,
          speed_knots: p.speed,
          course: p.course,
          status: dev?.status || 'online',
          demo: uniqueId.startsWith('demo-') || (dev?.name || '').startsWith('[DEMO]'),
        };
      });

    // 7) Eventos 24h com coords da câmera origem
    const events = await query(
      `SELECT e.id, e.camera_id, e.event_type, e.severity, e.snapshot_url,
              e.payload, e.received_at, e.demo,
              e.dispatched_to_wf_username, e.dispatched_to_distance_m, e.dispatch_status,
              c.name AS camera_name, c.latitude, c.longitude, c.location_desc
       FROM ip_camera_events e
       JOIN ip_cameras c ON c.id = e.camera_id
       WHERE e.received_at > NOW() - INTERVAL '24 hours'
         AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
       ORDER BY e.received_at DESC
       LIMIT 200`
    );

    // 8) IoT — globais por enquanto (demo). Quando Tuya entrar com tenant, refiltrar.
    let iotDevices: any[] = [];
    try {
      iotDevices = await query(
        `SELECT id, name, device_type, vendor, latitude, longitude, location_desc,
                state, online, demo, last_seen_at
         FROM iot_devices
         WHERE latitude IS NOT NULL AND longitude IS NOT NULL`
      );
    } catch {
      iotDevices = [];
    }

    return res.json({
      ip_cameras: ipCams || [],
      jimi_cameras: jimiCams || [],
      agents,
      trackers,
      events: events || [],
      iot_devices: iotDevices,
      generated_at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[map/overview]', e);
    return res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
// WALKIEFLEET
// ════════════════════════════════════════════════════════════

// Grupos
router.get('/walkiefleet/groups', auth, async (req: Request, res: Response) => {
  const groups = await query(
    `SELECT g.*, COUNT(d.id) as device_count FROM walkiefleet_groups g
     LEFT JOIN walkiefleet_devices d ON d.assigned_group_id=g.id
     WHERE g.tenant_id=$1 GROUP BY g.id ORDER BY g.channel`, [req.tenantId]
  );
  return res.json(groups);
});

router.post('/walkiefleet/groups', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { name, description, channel, color } = req.body;
  if (!name || !channel) return res.status(400).json({ error: 'Nome e canal são obrigatórios' });
  try {
    const g = await queryOne(
      `INSERT INTO walkiefleet_groups(tenant_id,name,description,channel,color) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [req.tenantId, name, description || null, channel, color || '#3b82f6']
    );
    return res.status(201).json(g);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'Canal já em uso' });
    throw e;
  }
});

router.put('/walkiefleet/groups/:id', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { name, description, color, isActive } = req.body;
  const g = await queryOne(
    `UPDATE walkiefleet_groups SET name=COALESCE($1,name),description=COALESCE($2,description),
     color=COALESCE($3,color),is_active=COALESCE($4,is_active),updated_at=NOW()
     WHERE id=$5 AND tenant_id=$6 RETURNING *`,
    [name, description, color, isActive, req.params.id, req.tenantId]
  );
  if (!g) return res.status(404).json({ error: 'Grupo não encontrado' });
  return res.json(g);
});

router.delete('/walkiefleet/groups/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  await query('UPDATE walkiefleet_devices SET assigned_group_id=NULL WHERE assigned_group_id=$1', [req.params.id]);
  await query('DELETE FROM walkiefleet_groups WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  return res.json({ success: true });
});

// Dispositivos WalkieFleet
router.get('/walkiefleet/devices', auth, async (req: Request, res: Response) => {
  const { status, groupId, search } = req.query as any;
  let sql = `SELECT d.*, g.name as group_name, g.color as group_color, g.channel as group_channel
     FROM walkiefleet_devices d LEFT JOIN walkiefleet_groups g ON g.id=d.assigned_group_id
     WHERE d.tenant_id=$1`;
  const p: any[] = [req.tenantId]; let i = 2;
  if (status) { sql += ` AND d.status=$${i++}`; p.push(status); }
  if (groupId) { sql += ` AND d.assigned_group_id=$${i++}`; p.push(groupId); }
  if (search) { sql += ` AND (d.name ILIKE $${i} OR d.device_id ILIKE $${i} OR d.assigned_to ILIKE $${i})`; p.push(`%${search}%`); i++; }
  sql += ' ORDER BY d.name';
  return res.json(await query(sql, p));
});

router.get('/walkiefleet/stats', auth, async (req: Request, res: Response) => {
  const s = await queryOne<any>(
    `SELECT COUNT(*) as total,
     COUNT(*) FILTER(WHERE status='online') as online,
     COUNT(*) FILTER(WHERE status='offline') as offline,
     COUNT(*) FILTER(WHERE status='sos') as sos,
     COUNT(*) FILTER(WHERE status='busy') as busy,
     COUNT(*) FILTER(WHERE battery_level < 20 AND battery_level IS NOT NULL) as low_battery
     FROM walkiefleet_devices WHERE tenant_id=$1`, [req.tenantId]
  );
  const gc = await queryOne<any>('SELECT COUNT(*) as count FROM walkiefleet_groups WHERE tenant_id=$1 AND is_active=true', [req.tenantId]);
  return res.json({ ...s, groups: parseInt(gc!.count) });
});

router.post('/walkiefleet/devices', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { name, deviceId, brand, model, serialNumber, simNumber, channel, assignedTo, assignedGroupId, tags } = req.body;
  if (!name || !deviceId) return res.status(400).json({ error: 'Nome e ID do dispositivo são obrigatórios' });
  try {
    const d = await queryOne(
      `INSERT INTO walkiefleet_devices(tenant_id,created_by,name,device_id,brand,model,serial_number,sim_number,channel,assigned_to,assigned_group_id,tags)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.tenantId, req.user!.id, name, deviceId, brand || 'WalkieFleet', model || null,
       serialNumber || null, simNumber || null, channel || 1, assignedTo || null, assignedGroupId || null, tags || []]
    );
    return res.status(201).json(d);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'ID do dispositivo já cadastrado' });
    throw e;
  }
});

router.put('/walkiefleet/devices/:id', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { name, status, batteryLevel, signalStrength, channel, volume, assignedTo, assignedGroupId,
    lastLocationLat, lastLocationLng } = req.body;
  const d = await queryOne(
    `UPDATE walkiefleet_devices SET
     name=COALESCE($1,name), status=COALESCE($2,status), battery_level=COALESCE($3,battery_level),
     signal_strength=COALESCE($4,signal_strength), channel=COALESCE($5,channel), volume=COALESCE($6,volume),
     assigned_to=COALESCE($7,assigned_to), assigned_group_id=COALESCE($8,assigned_group_id),
     last_location_lat=COALESCE($9,last_location_lat), last_location_lng=COALESCE($10,last_location_lng),
     last_seen_at=NOW(), updated_at=NOW()
     WHERE id=$11 AND tenant_id=$12 RETURNING *`,
    [name, status, batteryLevel, signalStrength, channel, volume, assignedTo, assignedGroupId,
     lastLocationLat, lastLocationLng, req.params.id, req.tenantId]
  );
  if (!d) return res.status(404).json({ error: 'Dispositivo não encontrado' });
  return res.json(d);
});

router.delete('/walkiefleet/devices/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  await query('DELETE FROM walkiefleet_devices WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  return res.json({ success: true });
});

// Mensagens / Histórico
router.get('/walkiefleet/messages', auth, async (req: Request, res: Response) => {
  const { deviceId, groupId, limit = '50' } = req.query as any;
  let sql = `SELECT m.*, d.name as device_name, g.name as group_name
     FROM walkiefleet_messages m
     LEFT JOIN walkiefleet_devices d ON d.id=m.device_id
     LEFT JOIN walkiefleet_groups g ON g.id=m.group_id
     WHERE m.tenant_id=$1`;
  const p: any[] = [req.tenantId]; let i = 2;
  if (deviceId) { sql += ` AND m.device_id=$${i++}`; p.push(deviceId); }
  if (groupId) { sql += ` AND m.group_id=$${i++}`; p.push(groupId); }
  sql += ` ORDER BY m.created_at DESC LIMIT $${i}`;
  p.push(parseInt(limit));
  return res.json(await query(sql, p));
});

// PTT: registrar transmissao (chamado pelo WebSocket handler)
router.post('/walkiefleet/ptt/record', auth, async (req: Request, res: Response) => {
  const { deviceId, groupId, durationSeconds, callId } = req.body;
  const msg = await queryOne(
    `INSERT INTO walkiefleet_messages(tenant_id,device_id,group_id,message_type,duration_seconds,call_id)
     VALUES($1,$2,$3,'voice',$4,$5) RETURNING *`,
    [req.tenantId, deviceId || null, groupId || null, durationSeconds || 0, callId || null]
  );
  return res.status(201).json(msg);
});

// WalkieFleet server config
router.get('/walkiefleet/config', auth, async (_req: Request, res: Response) => {
  const t = await queryOne<any>('SELECT wf_server_host,wf_server_port,wf_dispatcher_login,wf_dispatcher_pass FROM tenants WHERE id=$1', [_req.tenantId]);
  return res.json({
    host: t?.wf_server_host || '',
    port: t?.wf_server_port || 5058,
    login: t?.wf_dispatcher_login || '',
    hasPassword: !!t?.wf_dispatcher_pass,
  });
});

router.post('/walkiefleet/config', auth, requireRole('admin'), async (req: Request, res: Response) => {
  const { host, port, login, password } = req.body;
  await query(
    'UPDATE tenants SET wf_server_host=$1,wf_server_port=$2,wf_dispatcher_login=$3,wf_dispatcher_pass=$4 WHERE id=$5',
    [host || null, port || 5058, login || null, password || null, req.tenantId]
  );
  return res.json({ success: true });
});

// Bulk update device status (from WebSocket events)
router.post('/walkiefleet/devices/bulk-status', auth, async (req: Request, res: Response) => {
  const { updates } = req.body; // [{deviceId, status, batteryLevel, signalStrength, lat, lng}]
  if (!Array.isArray(updates)) return res.status(400).json({ error: 'updates array required' });
  for (const u of updates) {
    await query(
      `UPDATE walkiefleet_devices SET status=COALESCE($1,status),battery_level=COALESCE($2,battery_level),
       signal_strength=COALESCE($3,signal_strength),last_location_lat=COALESCE($4,last_location_lat),
       last_location_lng=COALESCE($5,last_location_lng),last_seen_at=NOW() WHERE device_id=$6 AND tenant_id=$7`,
      [u.status, u.batteryLevel, u.signalStrength, u.lat, u.lng, u.deviceId, req.tenantId]
    );
  }
  return res.json({ updated: updates.length });
});

// ════════════════════════════════════════════════════════════
// WALKIEFLEET BRIDGE EVENTS (iframe -> React -> REST)
// Tenant-scoped. Persiste tudo que o bridge emite para sobreviver a reload.
// ════════════════════════════════════════════════════════════

// POST /walkiefleet/events/message — persiste mensagem (in ou out)
router.post('/walkiefleet/events/message', auth, async (req: Request, res: Response) => {
  const {
    direction, jobId,
    fromUserId, fromUserName,
    toUserId, toGroupId,
    conversationType,
    text, contentType,
    hasAttachment, isSos,
    ts,
  } = req.body || {};

  if (!direction || !conversationType) {
    return res.status(400).json({ error: 'campos obrigatórios: direction, conversationType' });
  }
  if (direction !== 'in' && direction !== 'out') {
    return res.status(400).json({ error: 'direction deve ser in|out' });
  }

  // Deriva message_type para satisfazer o check constraint legado (voice|text|sos|broadcast|location)
  const messageType = isSos ? 'sos' : (contentType === 'image' || contentType === 'file' ? 'text' : 'text');

  try {
    const row = await queryOne<any>(
      `INSERT INTO walkiefleet_messages
        (tenant_id, direction, job_id, from_user_id, from_user_name,
         to_user_id, to_group_id, conversation_type, content,
         content_type, has_attachment, is_sos, message_type,
         event_ts, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,to_timestamp($14::double precision/1000.0),NOW())
       RETURNING id`,
      [
        req.tenantId, direction, jobId || null,
        fromUserId || null, fromUserName || null,
        toUserId || null, toGroupId || null,
        conversationType,
        text || '',
        contentType || 'text',
        !!hasAttachment, !!isSos,
        messageType,
        ts || Date.now(),
      ]
    );
    return res.json({ ok: true, id: row?.id || null });
  } catch (err: any) {
    console.error('[wf-events] erro persistindo mensagem:', err.message);
    return res.status(500).json({ error: 'falha ao persistir mensagem', detail: err.message });
  }
});

// POST /walkiefleet/events/ptt-start — registra início de chamada PTT
router.post('/walkiefleet/events/ptt-start', auth, async (req: Request, res: Response) => {
  const { callId, sourceId, sourceName, targetId, targetName, conversationType, isEmergency, ts } = req.body || {};
  if (!callId) return res.status(400).json({ error: 'callId obrigatório' });
  try {
    await query(
      `INSERT INTO walkiefleet_ptt_calls
        (tenant_id, call_id, source_id, source_name, target_id, target_name,
         conversation_type, is_emergency, started_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9::double precision/1000.0),NOW())
       ON CONFLICT (tenant_id, call_id) DO NOTHING`,
      [
        req.tenantId, callId,
        sourceId || null, sourceName || null,
        targetId || null, targetName || null,
        conversationType || null,
        !!isEmergency,
        ts || Date.now(),
      ]
    );
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[wf-events] erro ptt-start:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /walkiefleet/events/ptt-end — encerra chamada PTT
router.post('/walkiefleet/events/ptt-end', auth, async (req: Request, res: Response) => {
  const { callId, durationMs, ts } = req.body || {};
  if (!callId) return res.status(400).json({ error: 'callId obrigatório' });
  try {
    await query(
      `UPDATE walkiefleet_ptt_calls
       SET ended_at = to_timestamp($1::double precision/1000.0),
           duration_ms = $2
       WHERE tenant_id = $3 AND call_id = $4`,
      [ts || Date.now(), durationMs || null, req.tenantId, callId]
    );
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[wf-events] erro ptt-end:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /walkiefleet/events/devices-snapshot — upsert em lote de devices vindos do DATAEX
router.post('/walkiefleet/events/devices-snapshot', auth, async (req: Request, res: Response) => {
  const { devices } = req.body || {};
  if (!Array.isArray(devices)) return res.status(400).json({ error: 'devices deve ser array' });

  let count = 0;
  try {
    for (const d of devices) {
      if (!d.deviceId) continue;
      const status = d.online ? 'online' : 'offline';
      const displayName = d.userName || d.login || d.deviceId.slice(0, 12);
      await query(
        `INSERT INTO walkiefleet_devices
          (tenant_id, device_id, name, wf_user_id, wf_user_name, login,
           status, last_location_lat, last_location_lng, last_seen_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
         ON CONFLICT (tenant_id, device_id) DO UPDATE SET
           wf_user_id    = EXCLUDED.wf_user_id,
           wf_user_name  = EXCLUDED.wf_user_name,
           login         = EXCLUDED.login,
           status        = EXCLUDED.status,
           last_location_lat = COALESCE(EXCLUDED.last_location_lat, walkiefleet_devices.last_location_lat),
           last_location_lng = COALESCE(EXCLUDED.last_location_lng, walkiefleet_devices.last_location_lng),
           last_seen_at  = NOW(),
           updated_at    = NOW()`,
        [
          req.tenantId, d.deviceId, displayName,
          d.userId || null, d.userName || null, d.login || null,
          status,
          d.lat ?? null, d.lng ?? null,
        ]
      );
      count++;
    }
    return res.json({ ok: true, count });
  } catch (err: any) {
    console.error('[wf-events] erro devices-snapshot:', err.message);
    return res.status(500).json({ error: err.message, count });
  }
});

// POST /walkiefleet/events/groups-snapshot — upsert em lote de grupos do DATAEX
// CRÍTICO p/ Prompt 26: popula is_emergency=true que o SOS vai procurar.
router.post('/walkiefleet/events/groups-snapshot', auth, async (req: Request, res: Response) => {
  const { groups } = req.body || {};
  if (!Array.isArray(groups)) return res.status(400).json({ error: 'groups deve ser array' });

  let count = 0;
  try {
    for (const g of groups) {
      if (!g.groupId) continue;
      await query(
        `INSERT INTO walkiefleet_groups
          (tenant_id, wf_group_id, name, priority, is_emergency, is_broadcast, all_call, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
         ON CONFLICT (tenant_id, wf_group_id) DO UPDATE SET
           name         = EXCLUDED.name,
           priority     = EXCLUDED.priority,
           is_emergency = EXCLUDED.is_emergency,
           is_broadcast = EXCLUDED.is_broadcast,
           all_call     = EXCLUDED.all_call,
           updated_at   = NOW()`,
        [
          req.tenantId, g.groupId,
          g.name || g.groupId.slice(0, 12),
          g.priority || 0,
          !!g.emergency, !!g.broadcast, !!g.allCall,
        ]
      );
      count++;
    }
    return res.json({ ok: true, count });
  } catch (err: any) {
    console.error('[wf-events] erro groups-snapshot:', err.message);
    return res.status(500).json({ error: err.message, count });
  }
});

// POST /walkiefleet/events/gps — última posição GPS de um device
router.post('/walkiefleet/events/gps', auth, async (req: Request, res: Response) => {
  const { deviceId, lat, lng, ts } = req.body || {};
  if (!deviceId || lat == null || lng == null) {
    return res.status(400).json({ error: 'deviceId, lat e lng obrigatórios' });
  }
  try {
    await query(
      `UPDATE walkiefleet_devices
       SET last_location_lat = $1,
           last_location_lng = $2,
           last_seen_at = to_timestamp($3::double precision/1000.0),
           updated_at = NOW()
       WHERE tenant_id = $4 AND device_id = $5`,
      [lat, lng, ts || Date.now(), req.tenantId, deviceId]
    );
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /walkiefleet/groups/emergency — devolve o grupo Emergency (alvo do SOS)
router.get('/walkiefleet/groups/emergency', auth, async (req: Request, res: Response) => {
  try {
    const row = await queryOne<any>(
      `SELECT wf_group_id, name FROM walkiefleet_groups
       WHERE tenant_id = $1 AND is_emergency = true
       ORDER BY priority DESC, name ASC LIMIT 1`,
      [req.tenantId]
    );
    if (!row) {
      return res.json({ group: null, reason: 'nenhum grupo Emergency configurado no servidor WF' });
    }
    return res.json({ group: { groupId: row.wf_group_id, name: row.name } });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// API KEYS
// ════════════════════════════════════════════════════════════

router.get('/api-keys', auth, async (req: Request, res: Response) => {
  return res.json(await query('SELECT id,name,key_prefix,is_active,last_used_at,created_at FROM api_keys WHERE tenant_id=$1 ORDER BY created_at DESC', [req.tenantId]));
});

router.post('/api-keys', auth, requireRole('admin'), async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name obrigatório' });
  const crypto = await import('crypto');
  const rawKey = `iot_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 12);
  const k = await queryOne('INSERT INTO api_keys(tenant_id,user_id,name,key_hash,key_prefix) VALUES($1,$2,$3,$4,$5) RETURNING id,name,key_prefix,created_at', [req.tenantId, req.user!.id, name, keyHash, keyPrefix]);
  return res.status(201).json({ ...k, key: rawKey, warning: 'Guarde esta chave! Ela não será exibida novamente.' });
});

router.delete('/api-keys/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  await query('DELETE FROM api_keys WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  return res.json({ success: true });
});


// ════════════════════════════════════════════════════════════
// TRACCAR GPS TRACKING
// ════════════════════════════════════════════════════════════
const TRACCAR_GPS_URL = process.env.TRACCAR_URL || 'http://traccar:8082';
const TRACCAR_EMAIL = process.env.TRACCAR_EMAIL || 'admin@groupates.com';
const TRACCAR_PASSWORD = process.env.TRACCAR_PASSWORD || 'groupates2024!';

// Helper para obter sessão do Traccar
async function getTraccarSession(): Promise<string | null> {
  try {
    const https = await import('https');
    const http = await import('http');
    const { URLSearchParams } = await import('url');
    const body = new URLSearchParams({ email: TRACCAR_EMAIL, password: TRACCAR_PASSWORD }).toString();
    return new Promise((resolve) => {
      const url = new URL(`${TRACCAR_GPS_URL}/api/session`);
      const options = {
        hostname: url.hostname,
        port: url.port || 8082,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
        rejectUnauthorized: false,
      };
      const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
        const cookies = res.headers['set-cookie'];
        if (cookies) {
          const jsessionid = cookies.find(c => c.startsWith('JSESSIONID='));
          if (jsessionid) resolve(jsessionid.split(';')[0]);
          else resolve(null);
        } else resolve(null);
        res.resume();
      });
      req.on('error', () => resolve(null));
      req.write(body);
      req.end();
    });
  } catch { return null; }
}

// Helper para chamar API do Traccar
async function traccarRequest(method: string, path: string, body?: any, cookie?: string): Promise<{ status: number; data: any }> {
  try {
    const http = await import('http');
    const https = await import('https');
    const sessionCookie = cookie || await getTraccarSession();
    if (!sessionCookie) return { status: 401, data: { error: 'Não foi possível autenticar no Traccar' } };
    const bodyStr = body ? JSON.stringify(body) : undefined;
    return new Promise((resolve) => {
      const url = new URL(`${TRACCAR_GPS_URL}/api${path}`);
      const options: any = {
        hostname: url.hostname,
        port: url.port || 8082,
        path: url.pathname + (url.search || ''),
        method,
        headers: { 'Cookie': sessionCookie, 'Content-Type': 'application/json', ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}) },
        rejectUnauthorized: false,
      };
      const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve({ status: res.statusCode || 200, data: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode || 200, data: data }); }
        });
      });
      req.on('error', (e) => resolve({ status: 500, data: { error: e.message } }));
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  } catch (e: any) { return { status: 500, data: { error: e.message } }; }
}

// GET /traccar/status
router.get('/traccar/status', auth, async (req: Request, res: Response) => {
  try {
    const cookie = await getTraccarSession();
    if (!cookie) return res.status(503).json({ configured: false, error: 'Traccar não acessível' });
    const result = await traccarRequest('GET', '/server', undefined, cookie);
    if (result.status === 200) {
      return res.json({ configured: true, connected: true, server: result.data, url: TRACCAR_URL });
    }
    return res.status(503).json({ configured: false, error: 'Falha ao conectar no Traccar' });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// POST /traccar/auto-configure
router.post('/traccar/auto-configure', auth, async (req: Request, res: Response) => {
  try {
    const cookie = await getTraccarSession();
    if (!cookie) return res.status(503).json({ success: false, error: 'Traccar não acessível' });
    // Salvar config no banco do tenant
    await query(
      `INSERT INTO tenant_settings(tenant_id, key, value) VALUES($1, 'traccar_url', $2)
       ON CONFLICT(tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [req.tenantId, TRACCAR_URL]
    ).catch(() => {});
    await query(
      `INSERT INTO tenant_settings(tenant_id, key, value) VALUES($1, 'traccar_email', $2)
       ON CONFLICT(tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [req.tenantId, TRACCAR_EMAIL]
    ).catch(() => {});
    return res.json({ success: true, url: TRACCAR_GPS_URL, email: TRACCAR_EMAIL });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// POST /traccar/configure
router.post('/traccar/configure', auth, async (req: Request, res: Response) => {
  const { url, email, password } = req.body;
  if (!url || !email || !password) return res.status(400).json({ error: 'url, email e password obrigatórios' });
  return res.json({ success: true, url, email });
});

// GET /traccar/devices
router.get('/traccar/devices', auth, async (req: Request, res: Response) => {
  try {
    const result = await traccarRequest('GET', '/devices');
    return res.status(result.status).json(result.data);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// POST /traccar/devices
router.post('/traccar/devices', auth, async (req: Request, res: Response) => {
  try {
    const result = await traccarRequest('POST', '/devices', req.body);
    return res.status(result.status).json(result.data);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// PUT /traccar/devices/:id
router.put('/traccar/devices/:id', auth, async (req: Request, res: Response) => {
  try {
    const result = await traccarRequest('PUT', `/devices/${req.params.id}`, req.body);
    return res.status(result.status).json(result.data);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// DELETE /traccar/devices/:id
router.delete('/traccar/devices/:id', auth, async (req: Request, res: Response) => {
  try {
    const result = await traccarRequest('DELETE', `/devices/${req.params.id}`);
    return res.status(result.status).json(result.data);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// GET /traccar/positions
router.get('/traccar/positions', auth, async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.query;
    const path = deviceId ? `/positions?deviceId=${deviceId}` : '/positions';
    const result = await traccarRequest('GET', path);
    return res.status(result.status).json(result.data);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// GET /traccar/positions/history
router.get('/traccar/positions/history', auth, async (req: Request, res: Response) => {
  try {
    const { deviceId, from, to } = req.query;
    if (!deviceId || !from || !to) return res.status(400).json({ error: 'deviceId, from e to obrigatórios' });
    const result = await traccarRequest('GET', `/reports/route?deviceId=${deviceId}&from=${from}&to=${to}`);
    return res.status(result.status).json(result.data);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// GET /traccar/groups
router.get('/traccar/groups', auth, async (req: Request, res: Response) => {
  try {
    const result = await traccarRequest('GET', '/groups');
    return res.status(result.status).json(result.data);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// GET /traccar/geofences
router.get('/traccar/geofences', auth, async (req: Request, res: Response) => {
  try {
    const result = await traccarRequest('GET', '/geofences');
    return res.status(result.status).json(result.data);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// GET /traccar/map-url
router.get('/traccar/map-url', auth, async (req: Request, res: Response) => {
  return res.json({ url: TRACCAR_URL });
});

// GET /traccar/notifications
router.get('/traccar/notifications', auth, async (req: Request, res: Response) => {
  try {
    const result = await traccarRequest('GET', '/notifications');
    return res.status(result.status).json(result.data);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});



// ── SuperAdmin: Re-provisionar tenant ──
router.post('/superadmin/tenants/:id/provision', auth, requireRole('superadmin'), async (req: Request, res: Response) => {
  const t = await queryOne<any>('SELECT * FROM tenants WHERE id=$1', [req.params.id]);
  if (!t) return res.status(404).json({ error: 'Tenant não encontrado' });
  const result = await provisionTenantTraccar(t.id, t.name, t.email, t.email, '');
  return res.json(result);
});

// ── SuperAdmin: Status de provisionamento ──
router.get('/superadmin/tenants/:id/provision-status', auth, requireRole('superadmin'), async (req: Request, res: Response) => {
  const t = await queryOne<any>(
    `SELECT id, name, slug, traccar_group_id, traccar_user_id, traccar_user_email, traccar_server_url, provisioned_at
     FROM tenants WHERE id=$1`,
    [req.params.id]
  );
  if (!t) return res.status(404).json({ error: 'Tenant não encontrado' });
  return res.json({
    ...t,
    is_provisioned: !!t.traccar_group_id,
  });
});



// ════════════════════════════════════════════════════════════
// RELATÓRIO DE USO POR TENANT (SuperAdmin)
// ════════════════════════════════════════════════════════════

router.get('/superadmin/usage-report', auth, requireRole('superadmin'), async (req: Request, res: Response) => {
  const report = await query(`
    SELECT
      t.id, t.name, t.slug, t.plan, t.is_active, t.created_at, t.provisioned_at,
      t.max_devices, t.max_users,
      COUNT(DISTINCT u.id) as user_count,
      COUNT(DISTINCT d.id) as device_count,
      COUNT(DISTINCT c.id) as camera_count,
      COUNT(DISTINCT tr.id) as tracker_count,
      COUNT(DISTINCT al.id) as alert_count_30d,
      COALESCE(SUM(bc.amount) FILTER (WHERE bc.status='paid'), 0) as total_billed,
      COALESCE(SUM(bc.amount) FILTER (WHERE bc.status='pending'), 0) as pending_billing
    FROM tenants t
    LEFT JOIN users u ON u.tenant_id=t.id
    LEFT JOIN devices d ON d.tenant_id=t.id
    LEFT JOIN jimi_cameras c ON c.tenant_id=t.id
    LEFT JOIN trackers tr ON tr.tenant_id=t.id
    LEFT JOIN alerts al ON al.tenant_id=t.id AND al.created_at > NOW()-INTERVAL '30 days'
    LEFT JOIN billing_cycles bc ON bc.tenant_id=t.id
    GROUP BY t.id
    ORDER BY t.created_at DESC
  `, []);
  return res.json(report);
});

// Relatório de uso do próprio tenant
router.get('/usage', auth, async (req: Request, res: Response) => {
  const [tenant, counts] = await Promise.all([
    queryOne<any>('SELECT * FROM tenants WHERE id=$1', [req.tenantId]),
    queryOne<any>(`
      SELECT
        COUNT(DISTINCT u.id) as user_count,
        COUNT(DISTINCT d.id) as device_count,
        COUNT(DISTINCT c.id) as camera_count,
        COUNT(DISTINCT tr.id) as tracker_count
      FROM tenants t
      LEFT JOIN users u ON u.tenant_id=t.id
      LEFT JOIN devices d ON d.tenant_id=t.id
      LEFT JOIN jimi_cameras c ON c.tenant_id=t.id
      LEFT JOIN trackers tr ON tr.tenant_id=t.id
      WHERE t.id=$1
    `, [req.tenantId]),
  ]);
  return res.json({
    tenant,
    usage: counts,
    limits: {
      max_devices: tenant?.max_devices,
      max_users: tenant?.max_users,
    },
    utilization: {
      devices: counts ? Math.round((Number(counts.device_count) / (tenant?.max_devices || 1)) * 100) : 0,
      users: counts ? Math.round((Number(counts.user_count) / (tenant?.max_users || 1)) * 100) : 0,
    }
  });
});


export default router;

// ============================================================
// MQTT - Tópicos e comandos para dispositivos
// ============================================================

// Obter tópicos MQTT de um dispositivo
);

// Enviar comando para um dispositivo via MQTT
router.post('/devices/:id/command', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const d = await queryOne<any>('SELECT id, tenant_id, mqtt_topic_command FROM devices WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  if (!d) return res.status(404).json({ error: 'Dispositivo não encontrado' });
  const topic = d.mqtt_topic_command || buildDeviceTopics(req.tenantId as string, d.id as string).command;
  const payload = { ...req.body, sent_at: new Date().toISOString(), sent_by: req.user!.id };
  try {
    publishMqtt(topic, payload);
    return res.json({ ok: true, topic, payload });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao publicar comando MQTT: ' + e.message });
  }
});

// Receber telemetria via HTTP (alternativa ao MQTT direto)
router.post('/devices/ingest/:identifier', async (req: Request, res: Response) => {
  const token = req.headers['x-device-token'] as string;
  if (!token) return res.status(401).json({ error: 'Token de dispositivo obrigatório' });
  const d = await queryOne<any>('SELECT id, tenant_id FROM devices WHERE identifier=$1', [req.params.identifier]);
  if (!d) return res.status(404).json({ error: 'Dispositivo não encontrado' });
  const data = req.body;
  await query('INSERT INTO device_telemetry(device_id, tenant_id, data) VALUES($1,$2,$3)', [d.id, d.tenant_id, JSON.stringify(data)]);
  await query('UPDATE devices SET last_seen_at=NOW(), status=$1, updated_at=NOW() WHERE id=$2', ['online', d.id]);
  return res.json({ ok: true, received_at: new Date().toISOString() });
});

// Atualizar tópicos MQTT de um dispositivo
router.put('/devices/:id/mqtt-config', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { mqtt_topic_telemetry, mqtt_topic_command, mqtt_topic_status, mqtt_username, mqtt_password } = req.body;
  const d = await queryOne<any>('UPDATE devices SET mqtt_topic_telemetry=$1, mqtt_topic_command=$2, mqtt_topic_status=$3, mqtt_username=$4, mqtt_password=$5, updated_at=NOW() WHERE id=$6 AND tenant_id=$7 RETURNING *',
    [mqtt_topic_telemetry, mqtt_topic_command, mqtt_topic_status, mqtt_username, mqtt_password, req.params.id, req.tenantId]);
  if (!d) return res.status(404).json({ error: 'Dispositivo não encontrado' });
  return res.json(d);
});

// Listar últimas telemetrias de um dispositivo
router.get('/devices/:id/telemetry/latest', auth, async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const rows: any[] = await query('SELECT data, received_at FROM device_telemetry WHERE device_id=$1 ORDER BY received_at DESC LIMIT $2', [req.params.id, limit]);
  return res.json({ data: rows || [] });
});

