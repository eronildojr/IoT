import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import routes from './routes';
import routingRoutes from './routes/routing';
import jimiRoutes from './routes/jimi';
import diagnosticsRoutes from './routes/diagnostics';
import { registerWalkieFleetWS } from './walkiefleet-ws';

dotenv.config();

async function runMigrations() {
  if (!process.env.DATABASE_URL) return;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS _migrations (name VARCHAR(256) PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT NOW())`);
    // No build, __dirname é /app/dist; SQLs ficam em /app/src/migrations
    const migrationsDir = path.join(__dirname, '..', 'src', 'migrations');
    if (!fs.existsSync(migrationsDir)) return;
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const { rows } = await client.query('SELECT name FROM _migrations WHERE name=$1', [file]);
      if (rows.length) { console.log(`[Migration] Skip: ${file}`); continue; }
      console.log(`[Migration] Running: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO _migrations(name) VALUES($1)', [file]);
      console.log(`[Migration] Done: ${file}`);
    }
    console.log('[Migration] All migrations complete!');
  } catch (e) {
    console.error('[Migration] Error:', e);
  } finally {
    client.release();
    await pool.end();
  }
}

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

// Middlewares de segurança
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb', type: ['application/json', 'text/json'] }));
app.use(express.text({ limit: '10mb', type: ['application/xml', 'text/xml', 'text/plain'] }));
app.use(express.urlencoded({ extended: true, limit: '10mb', type: 'application/x-www-form-urlencoded' }));

// Static serving for event snapshots
app.use('/snapshots', express.static(process.env.EVENT_SNAPSHOTS_DIR || '/app/data/event-snapshots', { maxAge: '7d', immutable: true }));

// Rate limiting
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Muitas tentativas. Tente em 15 minutos.' } }));
app.use('/api/auth/register', rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { error: 'Muitas contas criadas. Tente em 1 hora.' } }));
app.use(/^\/api\/(?!jimi\/push|jimi\/upload|ip-cameras\/\d+\/events\/)/, rateLimit({ windowMs: 60 * 1000, max: 300 }));

// Rotas
app.use('/api', routes);
app.use('/api/routing', routingRoutes);
app.use('/api/jimi', jimiRoutes);
app.use('/api/diagnostics', diagnosticsRoutes);

// Start WalkieFleet message client
import { wfClient } from './lib/wf-client';
setTimeout(() => wfClient.start(), 5000); // delay to let relay start first

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// 404
app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// Error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[ERROR]', err.stack || err);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).json({
    error: 'Erro interno do servidor',
    ...(isDev && { detail: err.message, stack: err.stack }),
  });
});

// Rodar migrações e iniciar servidor
runMigrations().then(() => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[IoT Platform] Backend rodando na porta ${PORT}`);
  });

  // WalkieFleet WebSocket (PTT em tempo real)
  registerWalkieFleetWS(server);

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`[Shutdown] Recebido ${signal}, encerrando...`);
    server.close(() => {
      console.log('[Shutdown] Servidor HTTP encerrado');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[Shutdown] Timeout, forcando encerramento');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}).catch(e => {
  console.error('[Startup] Falha nas migrações:', e);
  process.exit(1);
});

export default app;
