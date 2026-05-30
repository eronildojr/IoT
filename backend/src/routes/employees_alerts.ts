import { Router, Request, Response } from 'express';
import pool from '../config/db';
import { auth } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import express from 'express';

const router = Router();

// Multer config para upload de fotos
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: Function) => {
    const isAlert = req.path.includes('/alerts');
    const dir = `/app/uploads/${isAlert ? 'alerts' : 'employees'}`;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: Function) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
    cb(null, `${Date.now()}_${safe}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ─── SERVE UPLOADED FILES ─────────────────────────────────────────────────────
router.use('/uploads', express.static('/app/uploads', { maxAge: '7d' }));

// ─── EMPLOYEES ────────────────────────────────────────────────────────────────

// GET /employees - listar funcionários
router.get('/employees', auth, async (req: Request, res: Response) => {
  try {
    const { search, active } = req.query;
    let q = `SELECT e.*, 
      (SELECT COUNT(*) FROM employee_recognitions er WHERE er.employee_id = e.id) as recognition_count,
      (SELECT MAX(er.recognized_at) FROM employee_recognitions er WHERE er.employee_id = e.id) as last_seen
      FROM employees e WHERE 1=1`;
    const params: any[] = [];
    if (search) {
      params.push(`%${search}%`);
      q += ` AND (e.name ILIKE $${params.length} OR e.department ILIKE $${params.length})`;
    }
    if (active !== undefined) {
      params.push(active === 'true');
      q += ` AND e.active = $${params.length}`;
    }
    q += ' ORDER BY e.name ASC';
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /employees - criar funcionário
router.post('/employees', auth, upload.single('photo'), async (req: Request, res: Response) => {
  try {
    const { name, department, employee_number } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    let photo_url = null, photo_path = null;
    if (req.file) {
      photo_path = req.file.path;
      photo_url = `/api/employees-alerts/uploads/employees/${req.file.filename}`;
    }
    const result = await pool.query(
      `INSERT INTO employees (name, department, employee_number, photo_url, photo_path) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, department || null, employee_number || null, photo_url, photo_path]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PUT /employees/:id - atualizar funcionário
router.put('/employees/:id', auth, upload.single('photo'), async (req: Request, res: Response) => {
  try {
    const { name, department, employee_number, active } = req.body;
    const existing = await pool.query('SELECT * FROM employees WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    let photo_url = existing.rows[0].photo_url;
    let photo_path = existing.rows[0].photo_path;
    if (req.file) {
      photo_path = req.file.path;
      photo_url = `/api/employees-alerts/uploads/employees/${req.file.filename}`;
    }
    const result = await pool.query(
      `UPDATE employees SET name=$1, department=$2, employee_number=$3, photo_url=$4, photo_path=$5, active=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
      [
        name || existing.rows[0].name,
        department !== undefined ? department : existing.rows[0].department,
        employee_number !== undefined ? employee_number : existing.rows[0].employee_number,
        photo_url, photo_path,
        active !== undefined ? (active === 'true' || active === true) : existing.rows[0].active,
        req.params.id
      ]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE /employees/:id
router.delete('/employees/:id', auth, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM employees WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /employees/:id/recognitions - histórico de reconhecimentos
router.get('/employees/:id/recognitions', auth, async (req: Request, res: Response) => {
  try {
    const { limit = '50', offset = '0', from, to } = req.query as Record<string, string>;
    let q = `SELECT er.*, COALESCE(ic.name, er.camera_name) as cam_name, COALESCE(ic.location_desc, er.location) as cam_location
      FROM employee_recognitions er
      LEFT JOIN ip_cameras ic ON ic.id = er.camera_id
      WHERE er.employee_id = $1`;
    const params: any[] = [req.params.id];
    if (from) { params.push(from); q += ` AND er.recognized_at >= $${params.length}`; }
    if (to) { params.push(to); q += ` AND er.recognized_at <= $${params.length}`; }
    q += ` ORDER BY er.recognized_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));
    const result = await pool.query(q, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM employee_recognitions WHERE employee_id=$1', [req.params.id]);
    res.json({ data: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /employees/:id/recognitions - registrar reconhecimento manual
router.post('/employees/:id/recognitions', auth, async (req: Request, res: Response) => {
  try {
    const { camera_id, camera_name, location, snapshot_url, confidence } = req.body;
    const emp = await pool.query('SELECT name FROM employees WHERE id=$1', [req.params.id]);
    if (!emp.rows.length) return res.status(404).json({ error: 'Funcionário não encontrado' });
    const result = await pool.query(
      `INSERT INTO employee_recognitions (employee_id, employee_name, camera_id, camera_name, location, snapshot_url, confidence) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, emp.rows[0].name, camera_id || null, camera_name || null, location || null, snapshot_url || null, confidence || null]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── ALERTS ───────────────────────────────────────────────────────────────────

// GET /alerts - listar alertas faciais
router.get('/alerts', auth, async (req: Request, res: Response) => {
  try {
    const { active } = req.query;
    let q = `SELECT ap.*, 
      (SELECT COUNT(*) FROM facial_alert_events ae WHERE ae.alert_person_id = ap.id) as event_count,
      (SELECT MAX(ae.detected_at) FROM facial_alert_events ae WHERE ae.alert_person_id = ap.id) as last_detected
      FROM facial_alert_persons ap WHERE 1=1`;
    const params: any[] = [];
    if (active !== undefined) {
      params.push(active === 'true');
      q += ` AND ap.active = $${params.length}`;
    }
    q += ' ORDER BY ap.created_at DESC';
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /alerts - criar alerta facial
router.post('/alerts', auth, upload.single('photo'), async (req: Request, res: Response) => {
  try {
    const { name, reason, severity, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    let photo_url = null, photo_path = null;
    if (req.file) {
      photo_path = req.file.path;
      photo_url = `/api/employees-alerts/uploads/alerts/${req.file.filename}`;
    }
    const result = await pool.query(
      `INSERT INTO facial_alert_persons (name, reason, severity, notes, photo_url, photo_path) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, reason || null, severity || 'high', notes || null, photo_url, photo_path]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PUT /alerts/:id - atualizar alerta
router.put('/alerts/:id', auth, upload.single('photo'), async (req: Request, res: Response) => {
  try {
    const { name, reason, severity, notes, active } = req.body;
    const existing = await pool.query('SELECT * FROM facial_alert_persons WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    let photo_url = existing.rows[0].photo_url;
    let photo_path = existing.rows[0].photo_path;
    if (req.file) {
      photo_path = req.file.path;
      photo_url = `/api/employees-alerts/uploads/alerts/${req.file.filename}`;
    }
    const result = await pool.query(
      `UPDATE facial_alert_persons SET name=$1, reason=$2, severity=$3, notes=$4, photo_url=$5, photo_path=$6, active=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
      [
        name || existing.rows[0].name,
        reason !== undefined ? reason : existing.rows[0].reason,
        severity || existing.rows[0].severity,
        notes !== undefined ? notes : existing.rows[0].notes,
        photo_url, photo_path,
        active !== undefined ? (active === 'true' || active === true) : existing.rows[0].active,
        req.params.id
      ]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE /alerts/:id
router.delete('/alerts/:id', auth, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM facial_alert_persons WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /alerts/events - eventos de alerta disparados
router.get('/alerts/events', auth, async (req: Request, res: Response) => {
  try {
    const { limit = '50', offset = '0', acknowledged } = req.query as Record<string, string>;
    let q = `SELECT ae.* FROM facial_alert_events ae WHERE 1=1`;
    const params: any[] = [];
    if (acknowledged !== undefined) {
      params.push(acknowledged === 'true');
      q += ` AND ae.acknowledged = $${params.length}`;
    }
    q += ` ORDER BY ae.detected_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── LOCATION REPORTS ─────────────────────────────────────────────────────────

// GET /location-report - relatório de localização facial
router.get('/location-report', auth, async (req: Request, res: Response) => {
  try {
    const { from, to, employee_id, camera_id, limit = '100', offset = '0' } = req.query as Record<string, string>;
    let q = `SELECT er.*, 
      COALESCE(e.name, er.employee_name) as emp_name,
      e.department, e.photo_url as employee_photo,
      COALESCE(ic.name, er.camera_name) as cam_name,
      COALESCE(ic.location_desc, er.location) as cam_location
      FROM employee_recognitions er
      LEFT JOIN employees e ON e.id = er.employee_id
      LEFT JOIN ip_cameras ic ON ic.id = er.camera_id
      WHERE 1=1`;
    const params: any[] = [];
    if (from) { params.push(from); q += ` AND er.recognized_at >= $${params.length}`; }
    if (to) { params.push(to); q += ` AND er.recognized_at <= $${params.length}`; }
    if (employee_id) { params.push(parseInt(employee_id)); q += ` AND er.employee_id = $${params.length}`; }
    if (camera_id) { params.push(parseInt(camera_id)); q += ` AND er.camera_id = $${params.length}`; }
    q += ` ORDER BY er.recognized_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));
    const result = await pool.query(q, params);
    res.json({ data: result.rows, total: result.rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /location-report/summary - resumo por funcionário
router.get('/location-report/summary', auth, async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const fromClause = from ? `AND er.recognized_at >= '${from}'` : '';
    const toClause = to ? `AND er.recognized_at <= '${to}'` : '';
    const q = `SELECT e.id, e.name, e.department, e.photo_url,
      COUNT(er.id) as total_recognitions,
      COUNT(DISTINCT er.camera_id) as cameras_seen,
      MIN(er.recognized_at) as first_seen,
      MAX(er.recognized_at) as last_seen,
      array_agg(DISTINCT COALESCE(ic.name, er.camera_name)) FILTER (WHERE COALESCE(ic.name, er.camera_name) IS NOT NULL) as cameras_list
      FROM employees e
      LEFT JOIN employee_recognitions er ON er.employee_id = e.id ${fromClause} ${toClause}
      LEFT JOIN ip_cameras ic ON ic.id = er.camera_id
      WHERE e.active = true
      GROUP BY e.id, e.name, e.department, e.photo_url
      ORDER BY total_recognitions DESC`;
    const result = await pool.query(q);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /employees/import-from-server - importar fotos da pasta /root/fotos
router.post('/employees/import-from-server', auth, async (req: Request, res: Response) => {
  try {
    const photosDir = '/root/fotos';
    if (!fs.existsSync(photosDir)) {
      return res.status(404).json({ error: 'Pasta /root/fotos não encontrada' });
    }
    const files = fs.readdirSync(photosDir);
    const imageExts = ['.jpg', '.jpeg', '.png', '.heic', '.webp'];
    const imageFiles = files.filter(f => {
      const lower = f.toLowerCase();
      // Ignorar .mp4 e arquivos com dupla extensão como .heic.mp4
      if (lower.endsWith('.mp4')) return false;
      const ext = path.extname(lower);
      return imageExts.includes(ext);
    });

    let imported = 0, skipped = 0;
    const results: any[] = [];

    for (const file of imageFiles) {
      const nameWithoutExt = path.basename(file, path.extname(file));
      let name = nameWithoutExt;
      let department: string | null = null;

      // Remover número inicial (ex: "1- " ou "100- " ou "1-")
      name = name.replace(/^\d+[\s.\-]+\s*/, '').trim();
      // Remover sufixos de extensão duplicados (ex: ".jpg" no meio)
      name = name.replace(/\.(jpg|jpeg|png|heic|webp)$/i, '').trim();

      // Extrair setor
      const setorMatch = name.match(/_\s*SETOR[_\s-]+(.+?)(?:\s*$)/i);
      if (setorMatch) {
        department = setorMatch[1].replace(/_/g, ' ').trim();
        name = name.replace(/_\s*SETOR[_\s-]+.+$/i, '').trim();
      }
      // Limpar underscores e espaços extras
      name = name.replace(/\s*_\s*/g, ' ').replace(/\s+/g, ' ').trim();
      // Remover " - SETOR - " e variações
      name = name.replace(/\s*-\s*SETOR\s*-\s*.+$/i, '').trim();

      if (!name || name.length < 2) { skipped++; continue; }

      // Verificar se já existe
      const existing = await pool.query('SELECT id FROM employees WHERE name ILIKE $1', [name]);
      if (existing.rows.length > 0) { skipped++; continue; }

      // Copiar arquivo para uploads
      const srcPath = path.join(photosDir, file);
      const destDir = '/app/uploads/employees';
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      const safeFile = file.replace(/[^a-zA-Z0-9._-]/g, '_');
      const destFile = `imported_${Date.now()}_${safeFile}`;
      const destPath = path.join(destDir, destFile);
      
      try {
        fs.copyFileSync(srcPath, destPath);
        const photo_url = `/api/employees-alerts/uploads/employees/${destFile}`;
        const insertResult = await pool.query(
          `INSERT INTO employees (name, department, photo_url, photo_path) VALUES ($1,$2,$3,$4) RETURNING id, name, department`,
          [name, department, photo_url, destPath]
        );
        results.push(insertResult.rows[0]);
        imported++;
      } catch (copyErr: any) {
        console.error(`Erro ao copiar ${file}:`, copyErr.message);
        skipped++;
      }
    }

    res.json({ imported, skipped, total: imageFiles.length, sample: results.slice(0, 10) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
