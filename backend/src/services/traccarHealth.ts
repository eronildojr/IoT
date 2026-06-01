/**
 * Health check REALISTA do Traccar (centralizado).
 *
 * Antes, tanto /api/traccar/status quanto o card "Traccar" do /diagnostico
 * batiam apenas em GET /api/server — que é PÚBLICO no Traccar (não exige auth).
 * Resultado: com a senha do tenant errada, /api/devices dava 401 mas o health
 * check seguia dizendo "connected: true" (falso-positivo). Ver memória
 * [[traccar-admin-creds]].
 *
 * Aqui validamos as DUAS camadas:
 *   1. /api/server (sem auth) → processo/container de pé + versão
 *   2. /api/devices (com a credencial do tenant) → backend consegue LER dados
 * Reutiliza getTraccar() de lib/dispatch para manter a credencial por-tenant.
 */
import axios from 'axios';
import { getTraccar } from '../lib/dispatch';

export type TraccarHealthResult = {
  connected: boolean;
  status: 'ok' | 'warn' | 'error';
  detail: string;
  latency_ms: number | null;
  version?: string;
  device_count?: number;
};

export async function checkTraccarHealth(tenantId: string): Promise<TraccarHealthResult> {
  const start = Date.now();

  // getTraccar lê traccar_server_url + creds do tenant; null = não configurado.
  const cfg = await getTraccar(tenantId);
  if (!cfg) {
    return { connected: false, status: 'warn', detail: 'Traccar não configurado neste tenant', latency_ms: null };
  }

  // 1. Servidor disponível? (/api/server é público — confirma só o processo de pé)
  let version: string | undefined;
  try {
    const r = await axios.get(`${cfg.base}/api/server`, { timeout: 3000 });
    version = r.data?.version;
  } catch {
    return { connected: false, status: 'error', detail: 'Servidor Traccar inacessível', latency_ms: Date.now() - start };
  }

  // 2. Credencial do tenant funciona? (/api/devices exige auth — confirma leitura de dados)
  try {
    const r = await axios.get(`${cfg.base}/api/devices`, { auth: cfg.auth, timeout: 4000 });
    const count = Array.isArray(r.data) ? r.data.length : 0;
    return {
      connected: true,
      status: 'ok',
      detail: `Traccar ${version || ''} — ${count} dispositivo${count === 1 ? '' : 's'}`.trim(),
      latency_ms: Date.now() - start,
      version,
      device_count: count,
    };
  } catch (e: any) {
    const code = e?.response?.status;
    if (code === 401 || code === 403) {
      return {
        connected: false,
        status: 'error',
        detail: 'Credencial Traccar inválida — atualize em Configurações > Tenant',
        latency_ms: Date.now() - start,
        version,
      };
    }
    if (code === 500 || code === 502 || code === 503) {
      return { connected: false, status: 'warn', detail: `Traccar respondendo com HTTP ${code}`, latency_ms: Date.now() - start, version };
    }
    return {
      connected: false,
      status: 'error',
      detail: `Falha ao consultar Traccar: ${String(e?.message || 'erro desconhecido').slice(0, 80)}`,
      latency_ms: Date.now() - start,
      version,
    };
  }
}
