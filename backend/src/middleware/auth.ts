import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { queryOne, query } from '../config/db';

export interface JwtPayload {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      tenantId?: string;
    }
  }
}

export function auth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  // Verificar se e uma API Key (prefixo iot_)
  if (token.startsWith('iot_')) {
    return authApiKey(token, req, res, next);
  }

  // JWT normal
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return res.status(500).json({ error: 'Configuracao do servidor incorreta' });
    const payload = jwt.verify(token, jwtSecret) as JwtPayload;
    req.user = payload;
    req.tenantId = payload.tenantId;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

async function authApiKey(rawKey: string, req: Request, res: Response, next: NextFunction) {
  try {
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await queryOne<any>(
      `SELECT ak.*, u.name, u.email, u.role FROM api_keys ak
       JOIN users u ON u.id = ak.user_id
       WHERE ak.key_hash = $1 AND ak.is_active = true`, [keyHash]
    );
    if (!apiKey) return res.status(401).json({ error: 'API Key inválida' });
    // Atualizar ultimo uso
    query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [apiKey.id]);
    req.user = { id: apiKey.user_id, tenantId: apiKey.tenant_id, email: apiKey.email, name: apiKey.name, role: apiKey.role };
    req.tenantId = apiKey.tenant_id;
    next();
  } catch {
    return res.status(401).json({ error: 'Erro ao validar API Key' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Sem permissão' });
    next();
  };
}
