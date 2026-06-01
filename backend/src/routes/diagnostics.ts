import { Router, Request, Response } from 'express';
import axios from 'axios';
import { auth, requireRole } from '../middleware/auth';
import { query, queryOne } from '../config/db';
import * as shinobi from '../lib/shinobi-client';
import { checkTraccarHealth } from '../services/traccarHealth';

const router = Router();

router.use(auth, requireRole('admin', 'superadmin'));

interface HealthCheck {
  name: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
  latency_ms: number | null;
}

async function checkPostgres(): Promise<HealthCheck> {
  const t = Date.now();
  try {
    await query('SELECT 1');
    return { name: 'Postgres', status: 'ok', detail: 'Conectado', latency_ms: Date.now() - t };
  } catch (e: any) {
    return { name: 'Postgres', status: 'error', detail: e.message?.slice(0, 120) || 'falha', latency_ms: null };
  }
}

async function checkTraccar(tenantId: string): Promise<HealthCheck> {
  // Delega ao health check central (services/traccarHealth) que valida tanto
  // /api/server quanto /api/devices com a credencial do tenant — evita o
  // falso-positivo do antigo check que só batia em /api/server (público).
  const h = await checkTraccarHealth(tenantId);
  return { name: 'Traccar', status: h.status, detail: h.detail, latency_ms: h.latency_ms };
}

async function checkShinobi(): Promise<HealthCheck> {
  const t = Date.now();
  const base = process.env.SHINOBI_BASE_URL || 'http://groupates_shinobi:8080';
  try {
    const r = await axios.get(base, { timeout: 4000, validateStatus: () => true });
    return {
      name: 'Shinobi',
      status: r.status < 500 ? 'ok' : 'warn',
      detail: `HTTP ${r.status}`,
      latency_ms: Date.now() - t,
    };
  } catch (e: any) {
    return { name: 'Shinobi', status: 'error', detail: (e.message || 'falha').slice(0, 120), latency_ms: null };
  }
}

async function checkWalkieFleet(): Promise<HealthCheck> {
  const t = Date.now();
  try {
    const r = await axios.get('http://groupates_walkiefleet:8070/api/info', {
      timeout: 4000,
      validateStatus: () => true,
    });
    return {
      name: 'WalkieFleet',
      status: r.status < 500 ? 'ok' : 'warn',
      detail: `HTTP ${r.status}`,
      latency_ms: Date.now() - t,
    };
  } catch (e: any) {
    return { name: 'WalkieFleet', status: 'error', detail: (e.message || 'falha').slice(0, 120), latency_ms: null };
  }
}

router.get('/health', async (req: Request, res: Response) => {
  const checks = await Promise.all([
    checkPostgres(),
    checkTraccar(req.tenantId!),
    checkShinobi(),
    checkWalkieFleet(),
  ]);
  res.json({ timestamp: new Date().toISOString(), checks });
});

router.get('/cameras', async (_req: Request, res: Response) => {
  const rows = await query<any>(`
    SELECT id, name, manufacturer, model, ip_address, http_port, rtsp_port, rtsp_path,
           shinobi_monitor_id, active, updated_at
    FROM ip_cameras
    ORDER BY
      CASE
        WHEN active = false THEN 3
        ELSE 1
      END,
      name ASC
  `);
  const cameras = rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    manufacturer: row.manufacturer,
    model: row.model,
    ip: row.ip_address,
    http_port: row.http_port,
    rtsp_port: row.rtsp_port,
    rtsp_path: row.rtsp_path,
    active: row.active,
    synced: !!row.shinobi_monitor_id,
    status: !row.active
      ? { code: 'INATIVA', label: 'Inativa', color: 'gray' }
      : !row.shinobi_monitor_id
      ? { code: 'NAO_SINCRONIZADA', label: 'Aguardando sincronização', color: 'yellow' }
      : { code: 'SINCRONIZADA', label: 'Sincronizada', color: 'green' },
  }));
  res.json({ cameras });
});

router.post('/camera/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const cam = await queryOne<any>(
    'SELECT id, name, shinobi_monitor_id, active FROM ip_cameras WHERE id=$1',
    [id],
  );
  if (!cam) return res.status(404).json({ error: 'Câmera não encontrada' });

  if (!cam.active) {
    return res.json({
      camera: { id: cam.id, name: cam.name },
      result: { status: 'error', label: 'Câmera inativa', detail: 'Ative a câmera para diagnosticar' },
    });
  }
  if (!cam.shinobi_monitor_id) {
    return res.json({
      camera: { id: cam.id, name: cam.name },
      result: {
        status: 'error',
        label: 'Não sincronizada',
        detail: 'A câmera ainda não foi registrada no Shinobi. Edite e salve a câmera para forçar a sincronização.',
      },
    });
  }

  const t = Date.now();
  try {
    const buf = await shinobi.getSnapshotBuffer(cam.shinobi_monitor_id);
    if (buf) {
      return res.json({
        camera: { id: cam.id, name: cam.name },
        result: {
          status: 'ok',
          label: 'OK',
          detail: `Snapshot recebido (${(buf.length / 1024).toFixed(1)} kB)`,
          latency_ms: Date.now() - t,
        },
      });
    }
    return res.json({
      camera: { id: cam.id, name: cam.name },
      result: {
        status: 'error',
        label: 'Sem snapshot',
        detail: 'Shinobi não devolveu imagem. Pode estar inicializando o stream — tente novamente em ~10s.',
      },
    });
  } catch (e: any) {
    return res.json({
      camera: { id: cam.id, name: cam.name },
      result: { status: 'error', label: 'Erro', detail: (e.message || 'falha').slice(0, 200) },
    });
  }
});

export default router;
