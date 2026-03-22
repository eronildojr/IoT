import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/db';
import { auth, requireRole } from '../middleware/auth';
import crypto from 'crypto';
import axios from 'axios';

const router = Router();

// ════════════════════════════════════════════════════════════
// GEOCODING via Nominatim (OpenStreetMap) - Gratuito
// ════════════════════════════════════════════════════════════

async function geocode(address: string): Promise<{ lat: number; lng: number; display: string } | null> {
  try {
    const r = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: address, format: 'json', limit: 1, countrycodes: 'br' },
      headers: { 'User-Agent': 'IoTPlatform/1.0' },
      timeout: 10000,
    });
    if (r.data.length > 0) {
      return { lat: parseFloat(r.data[0].lat), lng: parseFloat(r.data[0].lon), display: r.data[0].display_name };
    }
    return null;
  } catch {
    return null;
  }
}

async function geocodeBatch(addresses: string[]): Promise<(({ lat: number; lng: number; display: string }) | null)[]> {
  const results: (({ lat: number; lng: number; display: string }) | null)[] = [];
  for (const addr of addresses) {
    const result = await geocode(addr);
    results.push(result);
    // Nominatim rate limit: 1 req/sec
    await new Promise(resolve => setTimeout(resolve, 1100));
  }
  return results;
}

// ════════════════════════════════════════════════════════════
// OTIMIZACAO DE ROTA via OSRM (gratuito)
// ════════════════════════════════════════════════════════════

interface Waypoint { lat: number; lng: number; }

async function optimizeRoute(
  start: Waypoint,
  stops: Waypoint[],
  end?: Waypoint
): Promise<{ order: number[]; totalDistance: number; totalDuration: number; legs: { distance: number; duration: number }[] } | null> {
  try {
    // Montar lista de coordenadas: start + stops + end (opcional)
    const coords: Waypoint[] = [start, ...stops];
    if (end) coords.push(end);

    const coordStr = coords.map(c => `${c.lng},${c.lat}`).join(';');

    // OSRM Trip API - resolve TSP (Travelling Salesman Problem)
    const url = `https://router.project-osrm.org/trip/v1/driving/${coordStr}`;
    const r = await axios.get(url, {
      params: {
        overview: 'full',
        geometries: 'geojson',
        steps: 'true',
        source: 'first',
        destination: end ? 'last' : 'any',
        roundtrip: end ? 'false' : 'false',
      },
      timeout: 30000,
    });

    if (r.data.code !== 'Ok' || !r.data.trips?.length) return null;

    const trip = r.data.trips[0];
    const waypoints = r.data.waypoints;

    // Extrair ordem otimizada (ignorando start=0 e end se presente)
    const order = waypoints
      .filter((_: any, i: number) => i > 0 && (!end || i < waypoints.length - 1))
      .map((wp: any) => wp.waypoint_index - 1); // -1 porque start e index 0

    const legs = trip.legs.map((leg: any) => ({
      distance: Math.round(leg.distance / 10) / 100, // metros -> km com 2 decimais
      duration: Math.round(leg.duration / 6) / 10, // seg -> min com 1 decimal
    }));

    return {
      order,
      totalDistance: Math.round(trip.distance / 10) / 100,
      totalDuration: Math.round(trip.duration / 6) / 10,
      legs,
    };
  } catch (e: any) {
    console.error('[Routing] OSRM error:', e.message);
    return null;
  }
}

// Rota simples A -> B via OSRM Route API
async function getRouteGeometry(waypoints: Waypoint[]): Promise<any> {
  try {
    const coordStr = waypoints.map(c => `${c.lng},${c.lat}`).join(';');
    const r = await axios.get(`https://router.project-osrm.org/route/v1/driving/${coordStr}`, {
      params: { overview: 'full', geometries: 'geojson', steps: 'false' },
      timeout: 15000,
    });
    if (r.data.code === 'Ok' && r.data.routes?.length) {
      return r.data.routes[0].geometry;
    }
    return null;
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// DRIVERS (Motoristas)
// ════════════════════════════════════════════════════════════

router.get('/drivers', auth, async (req: Request, res: Response) => {
  const drivers = await query(
    `SELECT d.*, COUNT(r.id) FILTER(WHERE r.status='in_progress') as active_routes
     FROM drivers d LEFT JOIN routes r ON r.driver_id=d.id
     WHERE d.tenant_id=$1 GROUP BY d.id ORDER BY d.name`,
    [req.tenantId]
  );
  return res.json(drivers);
});

router.post('/drivers', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { name, phone, email, vehiclePlate, vehicleType = 'car' } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const colors = ['#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#3b82f6', '#ec4899'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const d = await queryOne(
    `INSERT INTO drivers(tenant_id,name,phone,email,vehicle_plate,vehicle_type,avatar_color)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.tenantId, name, phone || null, email || null, vehiclePlate || null, vehicleType, color]
  );
  return res.status(201).json(d);
});

router.put('/drivers/:id', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { name, phone, email, vehiclePlate, vehicleType, isActive } = req.body;
  const d = await queryOne(
    `UPDATE drivers SET
      name=COALESCE($1,name), phone=COALESCE($2,phone), email=COALESCE($3,email),
      vehicle_plate=COALESCE($4,vehicle_plate), vehicle_type=COALESCE($5,vehicle_type),
      is_active=COALESCE($6,is_active)
     WHERE id=$7 AND tenant_id=$8 RETURNING *`,
    [name, phone, email, vehiclePlate, vehicleType, isActive, req.params.id, req.tenantId]
  );
  if (!d) return res.status(404).json({ error: 'Não encontrado' });
  return res.json(d);
});

router.delete('/drivers/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  await query('DELETE FROM drivers WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  return res.json({ success: true });
});

// ════════════════════════════════════════════════════════════
// ROUTES (Rotas)
// ════════════════════════════════════════════════════════════

router.get('/routes', auth, async (req: Request, res: Response) => {
  const { status, date, driverId, page = '1', limit = '20' } = req.query as any;
  const off = (parseInt(page) - 1) * parseInt(limit);
  let sql = `SELECT r.*, d.name as driver_name, d.phone as driver_phone, d.vehicle_plate,
    COUNT(*) OVER() as total
    FROM routes r LEFT JOIN drivers d ON d.id=r.driver_id
    WHERE r.tenant_id=$1`;
  const p: any[] = [req.tenantId]; let i = 2;
  if (status) { sql += ` AND r.status=$${i++}`; p.push(status); }
  if (date) { sql += ` AND r.date=$${i++}`; p.push(date); }
  if (driverId) { sql += ` AND r.driver_id=$${i++}`; p.push(driverId); }
  sql += ` ORDER BY r.date DESC, r.created_at DESC LIMIT $${i++} OFFSET $${i++}`;
  p.push(parseInt(limit), off);
  const rows = await query<any>(sql, p);
  return res.json({ routes: rows, total: parseInt(rows[0]?.total || '0'), page: parseInt(page) });
});

router.get('/routes/:id', auth, async (req: Request, res: Response) => {
  const route = await queryOne<any>(
    `SELECT r.*, d.name as driver_name, d.phone as driver_phone, d.vehicle_plate, d.vehicle_type
     FROM routes r LEFT JOIN drivers d ON d.id=r.driver_id
     WHERE r.id=$1 AND r.tenant_id=$2`,
    [req.params.id, req.tenantId]
  );
  if (!route) return res.status(404).json({ error: 'Não encontrada' });
  const stops = await query(
    'SELECT * FROM route_stops WHERE route_id=$1 ORDER BY sequence_order',
    [req.params.id]
  );
  return res.json({ ...route, stops });
});

router.post('/routes', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { name, date, startAddress, endAddress, driverId, notes, optimizationMode = 'fastest' } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome da rota obrigatório' });

  // Geocode start/end if provided
  let startLat = null, startLng = null, endLat = null, endLng = null;
  if (startAddress) {
    const geo = await geocode(startAddress);
    if (geo) { startLat = geo.lat; startLng = geo.lng; }
  }
  if (endAddress) {
    const geo = await geocode(endAddress);
    if (geo) { endLat = geo.lat; endLng = geo.lng; }
  }

  const token = crypto.randomBytes(32).toString('hex');
  const route = await queryOne(
    `INSERT INTO routes(tenant_id,created_by,driver_id,name,date,start_address,start_lat,start_lng,end_address,end_lat,end_lng,driver_token,optimization_mode,notes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [req.tenantId, req.user!.id, driverId || null, name,
     date || new Date().toISOString().split('T')[0],
     startAddress || null, startLat, startLng,
     endAddress || null, endLat, endLng,
     token, optimizationMode, notes || null]
  );
  return res.status(201).json(route);
});

router.put('/routes/:id', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { name, date, driverId, status, notes } = req.body;
  const r = await queryOne(
    `UPDATE routes SET
      name=COALESCE($1,name), date=COALESCE($2,date), driver_id=COALESCE($3,driver_id),
      status=COALESCE($4,status), notes=COALESCE($5,notes)
     WHERE id=$6 AND tenant_id=$7 RETURNING *`,
    [name, date, driverId, status, notes, req.params.id, req.tenantId]
  );
  if (!r) return res.status(404).json({ error: 'Não encontrada' });
  return res.json(r);
});

router.delete('/routes/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  await query('DELETE FROM routes WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  return res.json({ success: true });
});

// ════════════════════════════════════════════════════════════
// STOPS (Paradas) - CRUD + Import
// ════════════════════════════════════════════════════════════

router.post('/routes/:id/stops', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { address, complement, customerName, customerPhone, notes, weightKg, volumeM3, serviceTimeMin = 5, timeWindowStart, timeWindowEnd } = req.body;
  if (!address) return res.status(400).json({ error: 'Endereço obrigatório' });

  const route = await queryOne<any>('SELECT id,tenant_id FROM routes WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  if (!route) return res.status(404).json({ error: 'Rota não encontrada' });

  // Geocode
  const geo = await geocode(address);
  const maxSeq = await queryOne<any>('SELECT COALESCE(MAX(sequence_order),0) as mx FROM route_stops WHERE route_id=$1', [req.params.id]);

  const stop = await queryOne(
    `INSERT INTO route_stops(route_id,tenant_id,sequence_order,address,complement,lat,lng,geocoded,customer_name,customer_phone,notes,weight_kg,volume_m3,service_time_min,time_window_start,time_window_end)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [req.params.id, req.tenantId, (maxSeq?.mx || 0) + 1, address, complement || null,
     geo?.lat || null, geo?.lng || null, !!geo,
     customerName || null, customerPhone || null, notes || null,
     weightKg || null, volumeM3 || null, serviceTimeMin,
     timeWindowStart || null, timeWindowEnd || null]
  );

  // Atualizar contagem
  await query('UPDATE routes SET total_stops=(SELECT COUNT(*) FROM route_stops WHERE route_id=$1) WHERE id=$1', [req.params.id]);

  return res.status(201).json(stop);
});

// IMPORT em lote (CSV parseado pelo frontend)
router.post('/routes/:id/stops/import', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { stops } = req.body;
  if (!stops || !Array.isArray(stops) || stops.length === 0) {
    return res.status(400).json({ error: 'Lista de paradas vazia' });
  }
  if (stops.length > 200) {
    return res.status(400).json({ error: 'Máximo 200 paradas por importação' });
  }

  const route = await queryOne<any>('SELECT id,tenant_id FROM routes WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  if (!route) return res.status(404).json({ error: 'Rota não encontrada' });

  const maxSeq = await queryOne<any>('SELECT COALESCE(MAX(sequence_order),0) as mx FROM route_stops WHERE route_id=$1', [req.params.id]);
  let seq = (maxSeq?.mx || 0);

  const imported: any[] = [];
  const errors: any[] = [];

  // Coletar enderecos para geocoding
  const needGeocode = stops.filter((s: any) => s.address && (!s.lat || !s.lng));
  const geoResults = await geocodeBatch(needGeocode.map((s: any) => s.address));

  let geoIdx = 0;
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (!s.address) { errors.push({ index: i, error: 'Endereço vazio' }); continue; }

    let lat = s.lat ? parseFloat(s.lat) : null;
    let lng = s.lng ? parseFloat(s.lng) : null;
    let geocoded = false;

    if (!lat || !lng) {
      const geo = geoResults[geoIdx++];
      if (geo) { lat = geo.lat; lng = geo.lng; geocoded = true; }
    } else {
      geocoded = true;
    }

    seq++;
    try {
      const stop = await queryOne(
        `INSERT INTO route_stops(route_id,tenant_id,sequence_order,address,complement,lat,lng,geocoded,customer_name,customer_phone,notes,weight_kg,service_time_min)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [req.params.id, req.tenantId, seq, s.address, s.complement || null,
         lat, lng, geocoded, s.customerName || s.customer_name || null,
         s.customerPhone || s.customer_phone || null, s.notes || null,
         s.weightKg || s.weight_kg || null, s.serviceTimeMin || s.service_time_min || 5]
      );
      imported.push(stop);
    } catch (e: any) {
      errors.push({ index: i, error: e.message });
    }
  }

  // Atualizar contagem
  await query('UPDATE routes SET total_stops=(SELECT COUNT(*) FROM route_stops WHERE route_id=$1) WHERE id=$1', [req.params.id]);

  return res.json({
    success: true,
    imported: imported.length,
    errors: errors.length,
    errorDetails: errors,
    geocoded: imported.filter((s: any) => s.geocoded).length,
    notGeocoded: imported.filter((s: any) => !s.geocoded).length,
  });
});

router.delete('/routes/:id/stops/:stopId', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  await query('DELETE FROM route_stops WHERE id=$1 AND route_id=$2 AND tenant_id=$3',
    [req.params.stopId, req.params.id, req.tenantId]);
  await query('UPDATE routes SET total_stops=(SELECT COUNT(*) FROM route_stops WHERE route_id=$1) WHERE id=$1', [req.params.id]);
  return res.json({ success: true });
});

// ════════════════════════════════════════════════════════════
// OTIMIZACAO
// ════════════════════════════════════════════════════════════

router.post('/routes/:id/optimize', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const route = await queryOne<any>(
    'SELECT * FROM routes WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]
  );
  if (!route) return res.status(404).json({ error: 'Rota não encontrada' });

  const stops = await query<any>(
    'SELECT * FROM route_stops WHERE route_id=$1 AND lat IS NOT NULL AND lng IS NOT NULL ORDER BY sequence_order',
    [req.params.id]
  );

  if (stops.length < 2) return res.status(400).json({ error: 'Mínimo 2 paradas geocodificadas para otimizar' });

  // Ponto de partida
  let start: Waypoint;
  if (route.start_lat && route.start_lng) {
    start = { lat: route.start_lat, lng: route.start_lng };
  } else {
    start = { lat: stops[0].lat, lng: stops[0].lng };
  }

  let end: Waypoint | undefined;
  if (route.end_lat && route.end_lng) {
    end = { lat: route.end_lat, lng: route.end_lng };
  }

  const waypoints = stops.map((s: any) => ({ lat: s.lat, lng: s.lng }));
  const result = await optimizeRoute(start, waypoints, end);

  if (!result) return res.status(502).json({ error: 'Falha ao otimizar rota. Tente novamente.' });

  // Reordenar paradas conforme resultado
  for (let i = 0; i < result.order.length && i < stops.length; i++) {
    const stopIdx = result.order[i];
    if (stopIdx >= 0 && stopIdx < stops.length) {
      const leg = result.legs[i] || { distance: 0, duration: 0 };
      await query(
        `UPDATE route_stops SET sequence_order=$1, distance_from_prev_km=$2, duration_from_prev_min=$3 WHERE id=$4`,
        [i + 1, leg.distance, leg.duration, stops[stopIdx].id]
      );
    }
  }

  // Atualizar rota
  await query(
    `UPDATE routes SET status='optimized', total_distance_km=$1, total_duration_min=$2 WHERE id=$3`,
    [result.totalDistance, result.totalDuration, req.params.id]
  );

  // Retornar rota atualizada
  const updated = await queryOne<any>('SELECT * FROM routes WHERE id=$1', [req.params.id]);
  const updatedStops = await query('SELECT * FROM route_stops WHERE route_id=$1 ORDER BY sequence_order', [req.params.id]);

  return res.json({ ...updated, stops: updatedStops, optimization: result });
});

// Obter geometria da rota (polyline para o mapa)
router.get('/routes/:id/geometry', auth, async (req: Request, res: Response) => {
  const route = await queryOne<any>('SELECT * FROM routes WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
  if (!route) return res.status(404).json({ error: 'Não encontrada' });

  const stops = await query<any>(
    'SELECT lat,lng FROM route_stops WHERE route_id=$1 AND lat IS NOT NULL AND lng IS NOT NULL ORDER BY sequence_order',
    [req.params.id]
  );

  const waypoints: Waypoint[] = [];
  if (route.start_lat && route.start_lng) waypoints.push({ lat: route.start_lat, lng: route.start_lng });
  stops.forEach((s: any) => waypoints.push({ lat: s.lat, lng: s.lng }));
  if (route.end_lat && route.end_lng) waypoints.push({ lat: route.end_lat, lng: route.end_lng });

  if (waypoints.length < 2) return res.json({ geometry: null });

  const geometry = await getRouteGeometry(waypoints);
  return res.json({ geometry });
});

// Atribuir motorista e enviar link
router.post('/routes/:id/assign', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  const { driverId } = req.body;
  if (!driverId) return res.status(400).json({ error: 'driverId obrigatório' });

  const driver = await queryOne<any>('SELECT * FROM drivers WHERE id=$1 AND tenant_id=$2', [driverId, req.tenantId]);
  if (!driver) return res.status(404).json({ error: 'Motorista não encontrado' });

  const route = await queryOne<any>(
    `UPDATE routes SET driver_id=$1, status='assigned' WHERE id=$2 AND tenant_id=$3 RETURNING *`,
    [driverId, req.params.id, req.tenantId]
  );
  if (!route) return res.status(404).json({ error: 'Rota não encontrada' });

  // Gerar link do motorista
  const driverLink = `/driver/${route.driver_token}`;

  return res.json({ ...route, driverLink, driver });
});

// ════════════════════════════════════════════════════════════
// DRIVER APP (Pagina do Motorista - Acesso publico via token)
// ════════════════════════════════════════════════════════════

// Obter rota pelo token (sem auth - acesso do motorista)
router.get('/driver-route/:token', async (req: Request, res: Response) => {
  const route = await queryOne<any>(
    `SELECT r.*, d.name as driver_name, d.phone as driver_phone, d.vehicle_plate, d.vehicle_type,
     t.name as tenant_name
     FROM routes r
     LEFT JOIN drivers d ON d.id=r.driver_id
     LEFT JOIN tenants t ON t.id=r.tenant_id
     WHERE r.driver_token=$1`,
    [req.params.token]
  );
  if (!route) return res.status(404).json({ error: 'Rota não encontrada' });

  const stops = await query(
    'SELECT * FROM route_stops WHERE route_id=$1 ORDER BY sequence_order',
    [route.id]
  );

  return res.json({ ...route, stops });
});

// Motorista inicia a rota
router.post('/driver-route/:token/start', async (req: Request, res: Response) => {
  const route = await queryOne<any>(
    `UPDATE routes SET status='in_progress', started_at=NOW()
     WHERE driver_token=$1 AND status IN ('assigned','optimized') RETURNING *`,
    [req.params.token]
  );
  if (!route) return res.status(400).json({ error: 'Rota não pode ser iniciada' });
  return res.json(route);
});

// Motorista atualiza status de uma parada
router.put('/driver-route/:token/stops/:stopId', async (req: Request, res: Response) => {
  const { status, driverNotes, failureReason } = req.body;
  if (!['arrived', 'completed', 'failed', 'skipped'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  const route = await queryOne<any>('SELECT id FROM routes WHERE driver_token=$1', [req.params.token]);
  if (!route) return res.status(404).json({ error: 'Rota não encontrada' });

  const updates: any = { status };
  let sql = 'UPDATE route_stops SET status=$1';
  const params: any[] = [status];
  let idx = 2;

  if (status === 'arrived') {
    sql += `, arrived_at=NOW()`;
  } else if (status === 'completed') {
    sql += `, completed_at=NOW()`;
  }
  if (driverNotes) { sql += `, driver_notes=$${idx++}`; params.push(driverNotes); }
  if (failureReason) { sql += `, failure_reason=$${idx++}`; params.push(failureReason); }

  sql += ` WHERE id=$${idx++} AND route_id=$${idx++} RETURNING *`;
  params.push(req.params.stopId, route.id);

  const stop = await queryOne(sql, params);
  if (!stop) return res.status(404).json({ error: 'Parada não encontrada' });

  // Atualizar contagem de completas
  const completed = await queryOne<any>(
    "SELECT COUNT(*) as c FROM route_stops WHERE route_id=$1 AND status IN ('completed','skipped')",
    [route.id]
  );
  await query('UPDATE routes SET completed_stops=$1 WHERE id=$2', [parseInt(completed!.c), route.id]);

  // Verificar se todas foram concluidas
  const total = await queryOne<any>('SELECT total_stops FROM routes WHERE id=$1', [route.id]);
  if (parseInt(completed!.c) >= parseInt(total!.total_stops)) {
    await query("UPDATE routes SET status='completed', completed_at=NOW() WHERE id=$1", [route.id]);
  }

  return res.json(stop);
});

// Motorista envia posicao GPS
router.post('/driver-route/:token/position', async (req: Request, res: Response) => {
  const { lat, lng, speed, heading, accuracy } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat e lng obrigatórios' });

  const route = await queryOne<any>(
    'SELECT id, driver_id FROM routes WHERE driver_token=$1',
    [req.params.token]
  );
  if (!route || !route.driver_id) return res.status(404).json({ error: 'Rota não encontrada' });

  await query(
    'INSERT INTO driver_positions(route_id,driver_id,lat,lng,speed,heading,accuracy) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [route.id, route.driver_id, lat, lng, speed || null, heading || null, accuracy || null]
  );

  return res.json({ success: true });
});

// Obter posicoes do motorista (para acompanhamento em tempo real)
router.get('/routes/:id/positions', auth, async (req: Request, res: Response) => {
  const { limit = '100' } = req.query as any;
  const positions = await query(
    'SELECT * FROM driver_positions WHERE route_id=$1 ORDER BY timestamp DESC LIMIT $2',
    [req.params.id, parseInt(limit)]
  );
  return res.json(positions);
});

// Geocode endpoint
router.post('/geocode', auth, async (req: Request, res: Response) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'address obrigatório' });
  const result = await geocode(address);
  if (!result) return res.json({ found: false });
  return res.json({ found: true, ...result });
});

export default router;
