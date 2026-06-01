/**
 * Protocolo de despacho WalkieFleet (Script 33).
 * Sequência por despacho, reusando o canal WF existente (wfClient/WebSocket):
 *   1) Texto (chat privado) — canal confiável, conteúdo estruturado da ocorrência.
 *   2) Call Alert (COMMAND_REQUEST Type=1) — faz o rádio chamar atenção.
 *   3) (voz/PTT) — fora de escopo; gancho futuro.
 *
 * Degradação graciosa: se WF_BOT_ENABLED!=true ou o canal cair, NÃO lança —
 * retorna delivery='unavailable' com o motivo. O registro no banco (fonte da
 * verdade) é feito pelo chamador (rota), independentemente do canal WF.
 */
import { wfClient } from '../lib/wf-client';

export interface WfDispatchResult {
  delivery: 'sent' | 'unavailable';
  reason?: string;
  job_id?: string;
  job_status?: string;
  call_alert: 'sent' | 'failed' | 'skipped';
}

const PRIO_LABEL: Record<string, string> = {
  critical: 'PRIORIDADE MÁXIMA', high: 'PRIORIDADE ALTA',
  medium: 'PRIORIDADE MÉDIA', low: 'PRIORIDADE BAIXA',
};

export function buildDispatchText(occ: any): string {
  const prio = PRIO_LABEL[occ.priority_level] || 'OCORRÊNCIA';
  const cat = occ.category_name || 'Sem categoria';
  const place = [occ.neighborhood, occ.city].filter(Boolean).join(', ');
  const coords = (occ.latitude != null && occ.longitude != null) ? `${occ.latitude},${occ.longitude}` : 's/ coordenada';
  const desc = (occ.description_transcribed || occ.description_raw || '').slice(0, 400) || '—';
  const mapsLink = (occ.latitude != null && occ.longitude != null)
    ? `https://www.google.com/maps?q=${occ.latitude},${occ.longitude}` : '';
  return [
    `🚨 [${prio}] Ocorrência #${occ.id} — ${cat}`,
    `Local: ${place || 'bairro indefinido'} (${coords})`,
    `Descrição: ${desc}`,
    mapsLink ? `Mapa: ${mapsLink}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Dispara a sequência WF para um agente. Nunca lança: encapsula falhas em
 * delivery='unavailable'.
 */
export async function dispatchToAgent(
  occ: any, wfDeviceId: string, wfUserId: string | null, toName: string,
): Promise<WfDispatchResult> {
  if (process.env.WF_BOT_ENABLED !== 'true') {
    return { delivery: 'unavailable', reason: 'wf_bot_disabled', call_alert: 'skipped' };
  }
  if (!wfDeviceId) {
    return { delivery: 'unavailable', reason: 'missing_wf_device_id', call_alert: 'skipped' };
  }

  const text = buildDispatchText(occ);
  try {
    // 1) Texto (chat privado) — rastreia STORAGE_JOB_STATE em wf_messages.
    const msg = await wfClient.sendPrivateMessage(wfDeviceId, toName, text, occ.id);

    // 2) Call Alert — best-effort, não invalida o texto se falhar.
    let call_alert: WfDispatchResult['call_alert'] = 'skipped';
    try { await wfClient.sendCallAlert(wfDeviceId, wfUserId || undefined); call_alert = 'sent'; }
    catch (e: any) { call_alert = 'failed'; console.warn('[wf-dispatch] call alert falhou:', e.message); }

    return { delivery: 'sent', job_id: msg.jobId, job_status: msg.finalStatus, call_alert };
  } catch (e: any) {
    // Canal indisponível (bot caiu / timeout de login). Degrada com elegância.
    return { delivery: 'unavailable', reason: e.message || 'wf_channel_error', call_alert: 'skipped' };
  }
}
