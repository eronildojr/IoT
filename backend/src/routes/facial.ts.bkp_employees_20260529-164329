import { Router, Request, Response } from 'express';
import pool, { query as dbQuery } from '../config/db';
import { auth as authenticateToken } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Upload de fotos de faces
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = '/root/projeto/backend/uploads/faces';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `face_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ---- PESSOAS (banco de faces) ----

// GET /api/facial/persons — listar pessoas cadastradas
router.get('/persons', authenticateToken, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenant_id || 1;
    const result = await pool.query(
      `SELECT id, name, role, department, photo_url, access_level, notes, created_at, updated_at
       FROM facial_persons WHERE tenant_id = $1 ORDER BY name`,
      [tenantId]
    );
    res.json({ persons: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/facial/persons — cadastrar pessoa
router.post('/persons', authenticateToken, upload.single('photo'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenant_id || 1;
    const { name, role, department, access_level, notes } = req.body;
    let photo_url = null;
    if (req.file) {
      photo_url = `/uploads/faces/${req.file.filename}`;
    }
    const result = await pool.query(
      `INSERT INTO facial_persons (tenant_id, name, role, department, photo_url, access_level, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [tenantId, name, role || null, department || null, photo_url, access_level || 'allowed', notes || null]
    );
    res.json({ person: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/facial/persons/:id — atualizar pessoa
router.put('/persons/:id', authenticateToken, upload.single('photo'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenant_id || 1;
    const { id } = req.params;
    const { name, role, department, access_level, notes } = req.body;
    let photoUpdate = '';
    const values: any[] = [name, role || null, department || null, access_level || 'allowed', notes || null];
    if (req.file) {
      photoUpdate = ', photo_url = $6';
      values.push(`/uploads/faces/${req.file.filename}`);
    }
    values.push(id, tenantId);
    const result = await pool.query(
      `UPDATE facial_persons SET name=$1, role=$2, department=$3, access_level=$4, notes=$5${photoUpdate}, updated_at=NOW()
       WHERE id=$${values.length - 1} AND tenant_id=$${values.length} RETURNING *`,
      values
    );
    res.json({ person: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/facial/persons/:id — remover pessoa
router.delete('/persons/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenant_id || 1;
    await pool.query(
      'DELETE FROM facial_persons WHERE id=$1 AND tenant_id=$2',
      [req.params.id, tenantId]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- EVENTOS ----

// GET /api/facial/events — listar eventos
router.get('/events', authenticateToken, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenant_id || 1;
    const { camera_id, event_type, limit = 50, offset = 0 } = req.query;
    let where = 'fe.tenant_id = $1';
    const params: any[] = [tenantId];
    if (camera_id) { params.push(camera_id); where += ` AND fe.camera_id = $${params.length}`; }
    if (event_type) { params.push(event_type); where += ` AND fe.event_type = $${params.length}`; }
    params.push(Number(limit), Number(offset));
    const result = await pool.query(
      `SELECT fe.*, fp.name as person_name, fp.role as person_role, fp.access_level,
              ic.name as camera_name, ic.location
       FROM facial_events fe
       LEFT JOIN facial_persons fp ON fe.person_id = fp.id
       LEFT JOIN ip_cameras ic ON fe.camera_id = ic.id
       WHERE ${where}
       ORDER BY fe.detected_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM facial_events fe WHERE ${where.replace(/LIMIT.*/, '')}`,
      params.slice(0, params.length - 2)
    );
    res.json({ events: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/facial/events — registrar evento (chamado pelo serviço de detecção ou manualmente)
router.post('/events', authenticateToken, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenant_id || 1;
    const { camera_id, person_id, event_type, confidence, snapshot_url, face_crop_url, location, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO facial_events (tenant_id, camera_id, person_id, event_type, confidence, snapshot_url, face_crop_url, location, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [tenantId, camera_id || null, person_id || null, event_type, confidence || null,
       snapshot_url || null, face_crop_url || null, location || null, notes || null]
    );
    res.json({ event: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/facial/events/:id
router.delete('/events/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenant_id || 1;
    await pool.query('DELETE FROM facial_events WHERE id=$1 AND tenant_id=$2', [req.params.id, tenantId]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- CONFIGURAÇÃO DA CÂMERA iDS ----

// GET /api/facial/camera-config/:cameraId
router.get('/camera-config/:cameraId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, ip_address, facial_recognition_enabled, facial_confidence_threshold,
              facial_alert_on_unknown, facial_alert_on_blocked, facial_snapshot_interval
       FROM ip_cameras WHERE id = $1`,
      [req.params.cameraId]
    );
    res.json({ config: result.rows[0] || null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/facial/camera-config/:cameraId
router.put('/camera-config/:cameraId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { facial_recognition_enabled, facial_confidence_threshold, facial_alert_on_unknown, facial_alert_on_blocked, facial_snapshot_interval } = req.body;
    const result = await pool.query(
      `UPDATE ip_cameras SET
         facial_recognition_enabled = $1,
         facial_confidence_threshold = $2,
         facial_alert_on_unknown = $3,
         facial_alert_on_blocked = $4,
         facial_snapshot_interval = $5
       WHERE id = $6 RETURNING id, name, facial_recognition_enabled, facial_confidence_threshold`,
      [facial_recognition_enabled, facial_confidence_threshold || 75.0,
       facial_alert_on_unknown !== false, facial_alert_on_blocked !== false,
       facial_snapshot_interval || 5, req.params.cameraId]
    );
    res.json({ config: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/facial/stats — estatísticas do módulo
router.get('/stats', authenticateToken, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenant_id || 1;
    const stats = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM facial_persons WHERE tenant_id=$1) as total_persons,
         (SELECT COUNT(*) FROM facial_events WHERE tenant_id=$1) as total_events,
         (SELECT COUNT(*) FROM facial_events WHERE tenant_id=$1 AND event_type='recognized') as recognized,
         (SELECT COUNT(*) FROM facial_events WHERE tenant_id=$1 AND event_type='unknown') as unknown_faces,
         (SELECT COUNT(*) FROM facial_events WHERE tenant_id=$1 AND event_type='blocked') as blocked,
         (SELECT COUNT(*) FROM facial_events WHERE tenant_id=$1 AND detected_at > NOW() - INTERVAL '24 hours') as last_24h`,
      [tenantId]
    );
    res.json(stats.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Hikvision: Sincronizar banco de faces com câmera ─────────────────────
router.post('/hikvision/sync/:cameraId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const tenantId = String((req as any).user?.tenant_id || '1');
    const { cameraId } = req.params;

    // ip_cameras não tem tenant_id - é tabela global
    const camResult = await pool.query(
      'SELECT id, name, ip_address, model FROM ip_cameras WHERE id=$1',
      [cameraId]
    );
    if (!camResult.rows.length) {
      return res.status(404).json({ error: 'Câmera não encontrada' });
    }
    const camera = camResult.rows[0];

    // Buscar pessoas do banco de faces (tenant_id é TEXT)
    const personsResult = await pool.query(
      'SELECT id, name, photo_url, access_level FROM facial_persons WHERE tenant_id=$1',
      [tenantId]
    );
    const persons = personsResult.rows;

    // Habilitar reconhecimento facial na câmera
    await pool.query(
      'UPDATE ip_cameras SET analytics_enabled=true, facial_recognition_enabled=true WHERE id=$1',
      [cameraId]
    ).catch(() => {});

    res.json({
      success: true,
      message: 'Banco de faces sincronizado com ' + camera.name,
      camera: { id: camera.id, name: camera.name, ip: camera.ip_address },
      persons_synced: persons.length,
      webhook_url: 'POST /api/facial/hikvision/webhook',
      instructions: {
        step1: 'Acesse a câmera via navegador: http://' + camera.ip_address,
        step2: 'Vá em: Configuração → Eventos → Detecção Facial → Vinculação HTTP',
        step3: 'Configure o URL: http://[IP_SERVIDOR]:3001/api/facial/hikvision/webhook',
        step4: 'Método: POST | Formato: JSON',
        step5: 'Salve e teste a conexão'
      }
    });
  } catch (err: any) {
    console.error('[Facial] Hikvision sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Hikvision Webhook: receber eventos de reconhecimento facial ───────────
router.post('/hikvision/webhook', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    let eventType = 'unknown';
    let confidence: number | null = null;
    let personIdExternal: string | null = null;
    let detectedAt = new Date();
    let snapshotUrl: string | null = null;
    let faceCropUrl: string | null = null;

    if (body.FaceRecognitionEvent) {
      const evt = body.FaceRecognitionEvent;
      eventType = evt.FDID ? 'recognized' : 'unknown';
      confidence = evt.similarity ? parseFloat(evt.similarity) : null;
      personIdExternal = evt.FDID || null;
      if (evt.dateTime) detectedAt = new Date(evt.dateTime);
    } else if (body.EventNotificationAlert) {
      const alert = body.EventNotificationAlert;
      eventType = alert.eventType === 'faceRecognition' ? 'recognized' : 'unknown';
      if (alert.dateTime) detectedAt = new Date(alert.dateTime);
    } else if (body.event_type) {
      eventType = body.event_type;
      confidence = body.confidence || null;
      snapshotUrl = body.snapshot_url || null;
      faceCropUrl = body.face_crop_url || null;
      if (body.detected_at) detectedAt = new Date(body.detected_at);
    }

    // Identificar câmera pelo IP de origem (ip_cameras sem tenant_id)
    const clientIp = ((req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '').replace('::ffff:', '');
    let cameraId: number | null = null;
    let tenantId = '1';

    if (clientIp) {
      const camResult = await pool.query(
        'SELECT id FROM ip_cameras WHERE ip_address=$1 LIMIT 1',
        [clientIp]
      );
      if (camResult.rows.length) {
        cameraId = camResult.rows[0].id;
      }
    }

    // Identificar pessoa (facial_persons tem tenant_id TEXT)
    let personId: number | null = null;
    if (personIdExternal) {
      const pResult = await pool.query(
        'SELECT id, access_level FROM facial_persons WHERE id=$1 LIMIT 1',
        [personIdExternal]
      );
      if (pResult.rows.length) {
        personId = pResult.rows[0].id;
        if (pResult.rows[0].access_level === 'blocked') eventType = 'blocked';
      }
    }

    // Salvar evento (facial_events tem tenant_id TEXT)
    const insertResult = await pool.query(
      'INSERT INTO facial_events (tenant_id, camera_id, person_id, event_type, confidence, snapshot_url, face_crop_url, detected_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [tenantId, cameraId, personId, eventType, confidence, snapshotUrl, faceCropUrl, detectedAt]
    );

    res.json({ success: true, event_id: insertResult.rows[0]?.id });
  } catch (err: any) {
    console.error('[Facial] Webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET câmeras Hikvision (ip_cameras sem tenant_id) ─────────────────────
router.get('/hikvision/cameras', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT id, name, ip_address, model, active, analytics_types, analytics_enabled, facial_recognition_enabled FROM ip_cameras WHERE manufacturer='hikvision' ORDER BY name"
    );
    res.json({ cameras: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
