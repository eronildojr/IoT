import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, queryOne } from '../config/db';
import { auth, requireRole } from '../middleware/auth';
import axios from 'axios';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// ════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════

router.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });
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
  const { name, status, location, config, tags, notes, batteryLevel, signalStrength } = req.body;
  const d = await queryOne(`UPDATE devices SET name=COALESCE($1,name),status=COALESCE($2,status),location=COALESCE($3,location),config=COALESCE($4,config),tags=COALESCE($5,tags),notes=COALESCE($6,notes),battery_level=COALESCE($7,battery_level),signal_strength=COALESCE($8,signal_strength) WHERE id=$9 AND tenant_id=$10 RETURNING *`,
    [name, status, location ? JSON.stringify(location) : null, config ? JSON.stringify(config) : null, tags, notes, batteryLevel, signalStrength, req.params.id, req.tenantId]);
  if (!d) return res.status(404).json({ error: 'Não encontrado' });
  return res.json(d);
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
  const { name, email, plan = 'basic', maxDevices = 10, maxUsers = 5 } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name e email obrigatórios' });
  let slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50);
  let i = 1;
  while (await queryOne('SELECT id FROM tenants WHERE slug=$1', [slug])) slug = `${slug}-${i++}`;
  const t = await queryOne(`INSERT INTO tenants(name,slug,email,plan,max_devices,max_users) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [name, slug, email, plan, maxDevices, maxUsers]);
  return res.status(201).json(t);
});

router.put('/superadmin/tenants/:id', auth, requireRole('superadmin'), async (req: Request, res: Response) => {
  const { name, plan, maxDevices, maxUsers, isActive, traccarServerUrl, traccarAdminUser, traccarAdminPass } = req.body;
  const t = await queryOne(`UPDATE tenants SET name=COALESCE($1,name),plan=COALESCE($2,plan),max_devices=COALESCE($3,max_devices),max_users=COALESCE($4,max_users),is_active=COALESCE($5,is_active),traccar_server_url=COALESCE($6,traccar_server_url),traccar_admin_user=COALESCE($7,traccar_admin_user),traccar_admin_pass=COALESCE($8,traccar_admin_pass) WHERE id=$9 RETURNING *`,
    [name, plan, maxDevices, maxUsers, isActive, traccarServerUrl, traccarAdminUser, traccarAdminPass, req.params.id]);
  return res.json(t);
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

router.get('/traccar/devices', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.json([]);
  try { return res.json((await axios.get(`${cfg.base}/api/devices`, { auth: cfg.auth, timeout: 10000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro ao buscar dispositivos Traccar', detail: e.message }); }
});

router.get('/traccar/positions', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.json([]);
  try { return res.json((await axios.get(`${cfg.base}/api/positions`, { auth: cfg.auth, timeout: 10000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro ao buscar posições', detail: e.message }); }
});

router.get('/traccar/history/:deviceId', auth, async (req: Request, res: Response) => {
  const cfg = await getTraccar(req.tenantId!);
  if (!cfg) return res.json([]);
  const { from, to } = req.query;
  try { return res.json((await axios.get(`${cfg.base}/api/positions`, { auth: cfg.auth, params: { deviceId: req.params.deviceId, from, to }, timeout: 15000 })).data); }
  catch (e: any) { return res.status(502).json({ error: 'Erro ao buscar histórico', detail: e.message }); }
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

export default router;
