import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET /api/settings - listar todas as configurações (sem valores secretos)
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, key, 
        CASE WHEN is_secret AND value != '' THEN '••••••••' ELSE value END as value,
        description, is_secret, category, updated_at
       FROM system_settings ORDER BY category, key`
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/settings/:key - atualizar uma configuração
router.put('/:key', async (req: Request, res: Response) => {
  const { key } = req.params;
  const { value } = req.body;
  try {
    const result = await pool.query(
      `UPDATE system_settings SET value = $1, updated_at = NOW() 
       WHERE key = $2 RETURNING id, key, is_secret, category`,
      [value, key]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Setting not found' });
    }
    
    // Se for a chave OpenAI, atualizar a variável de ambiente em tempo real
    if (key === 'openai_api_key' && value) {
      process.env.OPENAI_API_KEY = value;
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/settings/value/:key - obter valor real de uma configuração (admin only)
router.get('/value/:key', async (req: Request, res: Response) => {
  const { key } = req.params;
  try {
    const result = await pool.query(
      'SELECT key, value, is_secret FROM system_settings WHERE key = $1',
      [key]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Setting not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
