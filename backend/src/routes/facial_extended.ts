import { Router, Request, Response } from 'express';
import pool from '../config/db';
import { auth } from '../middleware/auth';
import axios from 'axios';

const router = Router();

// ============================================================
// 1. GRUPOS DE ACESSO
// ============================================================

// GET /facial/groups - Listar grupos
router.get('/groups', auth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT g.*, COUNT(p.id) as person_count 
       FROM facial_access_groups g 
       LEFT JOIN facial_persons p ON p.group_id = g.id 
       WHERE g.tenant_id = $1 
       GROUP BY g.id ORDER BY g.name`,
      [(req as any).user?.tenant_id || 'default']
    );
    res.json({ groups: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /facial/groups - Criar grupo
router.post('/groups', auth, async (req: Request, res: Response) => {
  const { name, description, group_type, color } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO facial_access_groups (tenant_id, name, description, group_type, color)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [(req as any).user?.tenant_id || 'default', name, description, group_type || 'employee', color || '#3B82F6']
    );
    res.json({ group: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /facial/groups/:id - Atualizar grupo
router.put('/groups/:id', auth, async (req: Request, res: Response) => {
  const { name, description, group_type, color, active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE facial_access_groups SET name=$1, description=$2, group_type=$3, color=$4, active=$5,
       updated_at=EXTRACT(EPOCH FROM NOW())*1000 WHERE id=$6 AND tenant_id=$7 RETURNING *`,
      [name, description, group_type, color, active, req.params.id, (req as any).user?.tenant_id || 'default']
    );
    res.json({ group: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /facial/groups/:id - Deletar grupo
router.delete('/groups/:id', auth, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM facial_access_groups WHERE id=$1 AND tenant_id=$2',
      [req.params.id, (req as any).user?.tenant_id || 'default']);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /facial/persons/:id/group - Vincular pessoa a grupo
router.put('/persons/:id/group', auth, async (req: Request, res: Response) => {
  const { group_id, employee_id, email, phone, user_uuid } = req.body;
  try {
    const result = await pool.query(
      `UPDATE facial_persons SET group_id=$1, employee_id=$2, email=$3, phone=$4, user_uuid=$5 
       WHERE id=$6 RETURNING *`,
      [group_id, employee_id, email, phone, user_uuid, req.params.id]
    );
    res.json({ person: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 2. AGENDAMENTO DE ACESSO
// ============================================================

// GET /facial/schedules - Listar agendamentos
router.get('/schedules', auth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT s.*, p.name as person_name, g.name as group_name 
       FROM facial_access_schedules s
       LEFT JOIN facial_persons p ON p.id = s.person_id
       LEFT JOIN facial_access_groups g ON g.id = s.group_id
       WHERE s.tenant_id = $1 ORDER BY s.name`,
      [(req as any).user?.tenant_id || 'default']
    );
    res.json({ schedules: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /facial/schedules - Criar agendamento
router.post('/schedules', auth, async (req: Request, res: Response) => {
  const { name, person_id, group_id, days_of_week, time_start, time_end, valid_from, valid_until } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO facial_access_schedules (tenant_id, name, person_id, group_id, days_of_week, time_start, time_end, valid_from, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [(req as any).user?.tenant_id || 'default', name, person_id, group_id, days_of_week || [1,2,3,4,5], time_start || '08:00', time_end || '18:00', valid_from, valid_until]
    );
    res.json({ schedule: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /facial/schedules/:id - Atualizar agendamento
router.put('/schedules/:id', auth, async (req: Request, res: Response) => {
  const { name, days_of_week, time_start, time_end, valid_from, valid_until, active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE facial_access_schedules SET name=$1, days_of_week=$2, time_start=$3, time_end=$4, 
       valid_from=$5, valid_until=$6, active=$7 WHERE id=$8 AND tenant_id=$9 RETURNING *`,
      [name, days_of_week, time_start, time_end, valid_from, valid_until, active, req.params.id, (req as any).user?.tenant_id || 'default']
    );
    res.json({ schedule: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /facial/schedules/:id
router.delete('/schedules/:id', auth, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM facial_access_schedules WHERE id=$1 AND tenant_id=$2',
      [req.params.id, (req as any).user?.tenant_id || 'default']);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 3. PONTOS DE ACESSO (CATRACAS/PORTÕES)
// ============================================================

// GET /facial/access-points
router.get('/access-points', auth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT ap.*, c.name as camera_name, c.ip_address as camera_ip
       FROM facial_access_points ap
       LEFT JOIN ip_cameras c ON c.id = ap.camera_id
       WHERE ap.tenant_id = $1 ORDER BY ap.name`,
      [(req as any).user?.tenant_id || 'default']
    );
    res.json({ access_points: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /facial/access-points
router.post('/access-points', auth, async (req: Request, res: Response) => {
  const { name, location, camera_id, relay_ip, relay_port, relay_channel, relay_type, relay_open_cmd, relay_close_cmd, auto_open_on_recognized, auto_open_on_vip, block_unknown, block_blacklisted } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO facial_access_points (tenant_id, name, location, camera_id, relay_ip, relay_port, relay_channel, relay_type, relay_open_cmd, relay_close_cmd, auto_open_on_recognized, auto_open_on_vip, block_unknown, block_blacklisted)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [(req as any).user?.tenant_id || 'default', name, location, camera_id, relay_ip, relay_port || 80, relay_channel || 1, relay_type || 'http', relay_open_cmd, relay_close_cmd, auto_open_on_recognized !== false, auto_open_on_vip !== false, block_unknown !== false, block_blacklisted !== false]
    );
    res.json({ access_point: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /facial/access-points/:id
router.put('/access-points/:id', auth, async (req: Request, res: Response) => {
  const { name, location, camera_id, relay_ip, relay_port, relay_channel, relay_type, relay_open_cmd, relay_close_cmd, auto_open_on_recognized, auto_open_on_vip, block_unknown, block_blacklisted, active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE facial_access_points SET name=$1, location=$2, camera_id=$3, relay_ip=$4, relay_port=$5, relay_channel=$6, relay_type=$7, relay_open_cmd=$8, relay_close_cmd=$9, auto_open_on_recognized=$10, auto_open_on_vip=$11, block_unknown=$12, block_blacklisted=$13, active=$14
       WHERE id=$15 AND tenant_id=$16 RETURNING *`,
      [name, location, camera_id, relay_ip, relay_port, relay_channel, relay_type, relay_open_cmd, relay_close_cmd, auto_open_on_recognized, auto_open_on_vip, block_unknown, block_blacklisted, active, req.params.id, (req as any).user?.tenant_id || 'default']
    );
    res.json({ access_point: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /facial/access-points/:id
router.delete('/access-points/:id', auth, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM facial_access_points WHERE id=$1 AND tenant_id=$2',
      [req.params.id, (req as any).user?.tenant_id || 'default']);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /facial/access-points/:id/trigger - Acionar relay manualmente
router.post('/access-points/:id/trigger', auth, async (req: Request, res: Response) => {
  try {
    const apResult = await pool.query('SELECT * FROM facial_access_points WHERE id=$1', [req.params.id]);
    if (!apResult.rows.length) return res.status(404).json({ error: 'Access point not found' });
    const ap = apResult.rows[0];
    
    let relaySuccess = false;
    if (ap.relay_ip && ap.relay_type === 'http') {
      try {
        const cmd = ap.relay_open_cmd || `http://${ap.relay_ip}:${ap.relay_port}/open?channel=${ap.relay_channel}`;
        await axios.get(cmd, { timeout: 3000 });
        relaySuccess = true;
      } catch (e) {
        relaySuccess = false;
      }
    }
    
    await pool.query(
      `INSERT INTO facial_access_log (tenant_id, access_point_id, action, reason, relay_triggered)
       VALUES ($1, $2, 'granted', 'Manual trigger', $3)`,
      [(req as any).user?.tenant_id || 'default', ap.id, relaySuccess]
    );
    
    res.json({ success: true, relay_triggered: relaySuccess });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 4. LOG DE CONTROLE DE ACESSO
// ============================================================

// GET /facial/access-log
router.get('/access-log', auth, async (req: Request, res: Response) => {
  const { limit = 100, offset = 0, action, person_id } = req.query;
  try {
    let where = `al.tenant_id = $1`;
    const params: any[] = [(req as any).user?.tenant_id || 'default'];
    if (action) { params.push(action); where += ` AND al.action = $${params.length}`; }
    if (person_id) { params.push(person_id); where += ` AND al.person_id = $${params.length}`; }
    
    const result = await pool.query(
      `SELECT al.*, p.name as person_name, ap.name as access_point_name
       FROM facial_access_log al
       LEFT JOIN facial_persons p ON p.id = al.person_id
       LEFT JOIN facial_access_points ap ON ap.id = al.access_point_id
       WHERE ${where}
       ORDER BY al.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    );
    res.json({ logs: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 5. DASHBOARD DE PRESENÇA
// ============================================================

// GET /facial/presence - Log de presença
router.get('/presence', auth, async (req: Request, res: Response) => {
  const { date, person_id, limit = 200 } = req.query;
  try {
    let where = `pl.tenant_id = $1`;
    const params: any[] = [(req as any).user?.tenant_id || 'default'];
    
    if (date) {
      const d = new Date(date as string);
      const start = d.getTime();
      const end = start + 86400000;
      params.push(start, end);
      where += ` AND pl.created_at >= $${params.length-1} AND pl.created_at < $${params.length}`;
    }
    if (person_id) { params.push(person_id); where += ` AND pl.person_id = $${params.length}`; }
    
    const result = await pool.query(
      `SELECT pl.*, p.name as person_name, p.department, p.role as person_role,
              c.name as camera_name, ap.name as access_point_name
       FROM facial_presence_log pl
       LEFT JOIN facial_persons p ON p.id = pl.person_id
       LEFT JOIN ip_cameras c ON c.id = pl.camera_id
       LEFT JOIN facial_access_points ap ON ap.id = pl.access_point_id
       WHERE ${where}
       ORDER BY pl.created_at DESC LIMIT $${params.length+1}`,
      [...params, limit]
    );
    res.json({ presence: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /facial/presence/summary - Resumo de presença por pessoa
router.get('/presence/summary', auth, async (req: Request, res: Response) => {
  const { date } = req.query;
  const targetDate = date ? new Date(date as string) : new Date();
  const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
  const end = start + 86400000;
  
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.department, p.role as person_role, p.photo_url,
              COUNT(pl.id) as total_events,
              MIN(pl.created_at) as first_seen,
              MAX(pl.created_at) as last_seen,
              SUM(CASE WHEN pl.event_type='entry' THEN 1 ELSE 0 END) as entries,
              SUM(CASE WHEN pl.event_type='exit' THEN 1 ELSE 0 END) as exits
       FROM facial_persons p
       LEFT JOIN facial_presence_log pl ON pl.person_id = p.id AND pl.created_at >= $2 AND pl.created_at < $3
       WHERE p.tenant_id = $1
       GROUP BY p.id ORDER BY total_events DESC`,
      [(req as any).user?.tenant_id || 'default', start, end]
    );
    res.json({ summary: result.rows, date: targetDate.toISOString().split('T')[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 6. ALERTAS FACIAIS
// ============================================================

// GET /facial/alert-rules
router.get('/alert-rules', auth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT ar.*, p.name as person_name, g.name as group_name
       FROM facial_alert_rules ar
       LEFT JOIN facial_persons p ON p.id = ar.person_id
       LEFT JOIN facial_access_groups g ON g.id = ar.group_id
       WHERE ar.tenant_id = $1 ORDER BY ar.name`,
      [(req as any).user?.tenant_id || 'default']
    );
    res.json({ rules: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /facial/alert-rules
router.post('/alert-rules', auth, async (req: Request, res: Response) => {
  const { name, trigger_type, person_id, group_id, camera_ids, notify_whatsapp, notify_email, notify_push, whatsapp_numbers, email_addresses, cooldown_minutes } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO facial_alert_rules (tenant_id, name, trigger_type, person_id, group_id, camera_ids, notify_whatsapp, notify_email, notify_push, whatsapp_numbers, email_addresses, cooldown_minutes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [(req as any).user?.tenant_id || 'default', name, trigger_type || 'blocked_detected', person_id, group_id, camera_ids, notify_whatsapp || false, notify_email || false, notify_push !== false, whatsapp_numbers, email_addresses, cooldown_minutes || 5]
    );
    res.json({ rule: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /facial/alert-rules/:id
router.put('/alert-rules/:id', auth, async (req: Request, res: Response) => {
  const { name, trigger_type, notify_whatsapp, notify_email, notify_push, whatsapp_numbers, email_addresses, cooldown_minutes, active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE facial_alert_rules SET name=$1, trigger_type=$2, notify_whatsapp=$3, notify_email=$4, notify_push=$5, whatsapp_numbers=$6, email_addresses=$7, cooldown_minutes=$8, active=$9
       WHERE id=$10 AND tenant_id=$11 RETURNING *`,
      [name, trigger_type, notify_whatsapp, notify_email, notify_push, whatsapp_numbers, email_addresses, cooldown_minutes, active, req.params.id, (req as any).user?.tenant_id || 'default']
    );
    res.json({ rule: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /facial/alert-rules/:id
router.delete('/alert-rules/:id', auth, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM facial_alert_rules WHERE id=$1 AND tenant_id=$2',
      [req.params.id, (req as any).user?.tenant_id || 'default']);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 7. ANÁLISE COMPORTAMENTAL
// ============================================================

// GET /facial/behavior
router.get('/behavior', auth, async (req: Request, res: Response) => {
  const { limit = 100, behavior_type, camera_id } = req.query;
  try {
    let where = `be.tenant_id = $1`;
    const params: any[] = [(req as any).user?.tenant_id || 'default'];
    if (behavior_type) { params.push(behavior_type); where += ` AND be.behavior_type = $${params.length}`; }
    if (camera_id) { params.push(camera_id); where += ` AND be.camera_id = $${params.length}`; }
    
    const result = await pool.query(
      `SELECT be.*, c.name as camera_name
       FROM facial_behavior_events be
       LEFT JOIN ip_cameras c ON c.id = be.camera_id
       WHERE ${where}
       ORDER BY be.created_at DESC LIMIT $${params.length+1}`,
      [...params, limit]
    );
    res.json({ events: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /facial/behavior - Receber evento comportamental (webhook câmera)
router.post('/behavior', async (req: Request, res: Response) => {
  const { camera_id, behavior_type, confidence, duration_seconds, person_count, snapshot_url, bbox_x, bbox_y, bbox_w, bbox_h, metadata } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO facial_behavior_events (tenant_id, camera_id, behavior_type, confidence, duration_seconds, person_count, snapshot_url, bbox_x, bbox_y, bbox_w, bbox_h, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      ['default', camera_id, behavior_type, confidence || 0, duration_seconds, person_count, snapshot_url, bbox_x, bbox_y, bbox_w, bbox_h, metadata ? JSON.stringify(metadata) : null]
    );
    res.json({ event: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /facial/behavior/stats - Estatísticas comportamentais
router.get('/behavior/stats', auth, async (req: Request, res: Response) => {
  try {
    const last24h = Date.now() - 86400000;
    const result = await pool.query(
      `SELECT behavior_type, COUNT(*) as count, AVG(confidence) as avg_confidence
       FROM facial_behavior_events
       WHERE tenant_id = $1 AND created_at >= $2
       GROUP BY behavior_type ORDER BY count DESC`,
      [(req as any).user?.tenant_id || 'default', last24h]
    );
    res.json({ stats: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 8. RELATÓRIOS DE AUDITORIA
// ============================================================

// GET /facial/reports/audit - Relatório de auditoria
router.get('/reports/audit', auth, async (req: Request, res: Response) => {
  const { from, to, person_id, format = 'json' } = req.query;
  const fromTs = from ? new Date(from as string).getTime() : Date.now() - 7 * 86400000;
  const toTs = to ? new Date(to as string).getTime() : Date.now();
  
  try {
    const result = await pool.query(
      `SELECT fe.*, p.name as person_name, p.department, p.role as person_role, c.name as camera_name
       FROM facial_events fe
       LEFT JOIN facial_persons p ON p.id = fe.person_id
       LEFT JOIN ip_cameras c ON c.id = fe.camera_id
       WHERE fe.tenant_id = $1 AND EXTRACT(EPOCH FROM fe.detected_at)*1000 >= $2 AND EXTRACT(EPOCH FROM fe.detected_at)*1000 <= $3
       ${person_id ? 'AND fe.person_id = $4' : ''}
       ORDER BY fe.created_at DESC LIMIT 1000`,
      person_id ? [(req as any).user?.tenant_id || 'default', fromTs, toTs, person_id] : [(req as any).user?.tenant_id || 'default', fromTs, toTs]
    );
    
    const presenceResult = await pool.query(
      `SELECT pl.*, p.name as person_name, p.department, c.name as camera_name
       FROM facial_presence_log pl
       LEFT JOIN facial_persons p ON p.id = pl.person_id
       LEFT JOIN ip_cameras c ON c.id = pl.camera_id
       WHERE pl.tenant_id = $1 AND pl.created_at >= $2 AND pl.created_at <= $3
       ORDER BY pl.created_at DESC LIMIT 1000`,
      [(req as any).user?.tenant_id || 'default', fromTs, toTs]
    );
    
    res.json({
      period: { from: new Date(fromTs).toISOString(), to: new Date(toTs).toISOString() },
      facial_events: result.rows,
      presence_log: presenceResult.rows,
      total_events: result.rows.length,
      total_presence: presenceResult.rows.length
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /facial/reports/presence-daily - Relatório diário de presença
router.get('/reports/presence-daily', auth, async (req: Request, res: Response) => {
  const { days = 7 } = req.query;
  const fromTs = Date.now() - Number(days) * 86400000;
  
  try {
    const result = await pool.query(
      `SELECT 
         DATE(TO_TIMESTAMP(created_at::bigint/1000)) as date,
         COUNT(DISTINCT person_id) as unique_persons,
         COUNT(*) as total_events,
         SUM(CASE WHEN event_type='entry' THEN 1 ELSE 0 END) as entries,
         SUM(CASE WHEN event_type='exit' THEN 1 ELSE 0 END) as exits
       FROM facial_presence_log
       WHERE tenant_id = $1 AND created_at >= $2
       GROUP BY DATE(TO_TIMESTAMP(created_at/1000))
       ORDER BY date DESC`,
      [(req as any).user?.tenant_id || 'default', fromTs]
    );
    res.json({ daily: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 9. INTEGRAÇÃO COM USUÁRIOS DO SISTEMA
// ============================================================

// GET /facial/system-users - Listar usuários do sistema para vincular
router.get('/system-users', auth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role,
              fp.id as facial_person_id, fp.name as facial_name
       FROM users u
       LEFT JOIN facial_persons fp ON fp.user_uuid = u.id::text
       ORDER BY u.name`
    );
    res.json({ users: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 10. ESTATÍSTICAS GERAIS DO MÓDULO FACIAL
// ============================================================

// GET /facial/dashboard - Dashboard completo
router.get('/dashboard', auth, async (req: Request, res: Response) => {
  const tenantId = (req as any).user?.tenant_id || 'default';
  const last24h = Date.now() - 86400000;
  const last7d = Date.now() - 7 * 86400000;
  
  try {
    const [persons, events, groups, accessPoints, alertRules, behavior, presenceToday, accessLog] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN access_level='allowed' THEN 1 ELSE 0 END) as allowed, SUM(CASE WHEN access_level='blocked' THEN 1 ELSE 0 END) as blocked, SUM(CASE WHEN access_level='vip' THEN 1 ELSE 0 END) as vip FROM facial_persons WHERE tenant_id=$1`, [tenantId]),
      pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN event_type='recognized' THEN 1 ELSE 0 END) as recognized, SUM(CASE WHEN event_type='unknown' THEN 1 ELSE 0 END) as unknown, SUM(CASE WHEN EXTRACT(EPOCH FROM detected_at)*1000 >= $2 THEN 1 ELSE 0 END) as last_24h FROM facial_events WHERE tenant_id=$1`, [tenantId, last24h]),
      pool.query(`SELECT COUNT(*) as total FROM facial_access_groups WHERE tenant_id=$1 AND active=true`, [tenantId]),
      pool.query(`SELECT COUNT(*) as total FROM facial_access_points WHERE tenant_id=$1 AND active=true`, [tenantId]),
      pool.query(`SELECT COUNT(*) as total FROM facial_alert_rules WHERE tenant_id=$1 AND active=true`, [tenantId]),
      pool.query(`SELECT COUNT(*) as total FROM facial_behavior_events WHERE tenant_id=$1 AND created_at >= $2`, [tenantId, last24h]),
      pool.query(`SELECT COUNT(DISTINCT person_id) as unique_persons FROM facial_presence_log WHERE tenant_id=$1 AND created_at >= $2`, [tenantId, last24h]),
      pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN action='granted' THEN 1 ELSE 0 END) as granted, SUM(CASE WHEN action='denied' THEN 1 ELSE 0 END) as denied FROM facial_access_log WHERE tenant_id=$1 AND created_at >= $2`, [tenantId, last24h]),
    ]);
    
    res.json({
      persons: persons.rows[0],
      events: events.rows[0],
      groups: groups.rows[0],
      access_points: accessPoints.rows[0],
      alert_rules: alertRules.rows[0],
      behavior_24h: behavior.rows[0],
      presence_today: presenceToday.rows[0],
      access_log_24h: accessLog.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
