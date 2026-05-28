/**
 * WalkieFleet WebSocket client for sending text messages to agents.
 * Protocol: JSON arrays over WebSocket, matching wfclient.html reference.
 * Handshake: SERVER_CONFIG → DEVICE_CONFIG → CONFIG_SERVER_RESPONSE_ACK → LOGIN → LOGIN_RESPONSE
 */
import WebSocket from 'ws';
import crypto from 'crypto';
import { query } from '../config/db';

const WF_RELAY_URL = process.env.WF_RELAY_WS_URL || 'ws://groupates_walkiefleet:8070/ws';
const WF_BOT_LOGIN = process.env.WF_BOT_LOGIN || 'BOT_DISPATCH';
const WF_BOT_PASSWORD = process.env.WF_BOT_PASSWORD || '';
const ZERO_GUID = 'AAAAAAAAAAAAAAAAAAAAAA==';
const DELIVERY_TIMEOUT_MS = 10_000;
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30_000;

function randB64(n: number): string {
  return crypto.randomBytes(n).toString('base64');
}

interface PendingJob {
  jobId: string;
  resolve: (status: string) => void;
  timer: ReturnType<typeof setTimeout>;
}

class WfClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private loggedIn = false;
  private reconnectAttempt = 0;
  private ssrc = 0;
  private sessionId = randB64(16);
  private deviceLocalId = randB64(16);
  private pendingJobs = new Map<string, PendingJob>();
  private readyResolve: (() => void) | null = null;
  private readyReject: ((e: Error) => void) | null = null;
  private readyPromise: Promise<void> | null = null;
  private started = false;

  start() {
    if (process.env.WF_BOT_ENABLED !== 'true') {
      console.log('[wf-client] disabled via WF_BOT_ENABLED, skipping connection');
      return;
    }
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  private connect() {
    if (this.connected) return;
    console.log(`[wf-client] connecting to ${WF_RELAY_URL}`);

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    try {
      const ws = new WebSocket(WF_RELAY_URL);
      this.ws = ws;

      ws.on('open', () => {
        console.log('[wf-client] WS open, awaiting handshake');
        this.connected = true;
        this.reconnectAttempt = 0;
      });

      ws.on('message', (raw: WebSocket.RawData) => {
        try {
          const parsed = JSON.parse(raw.toString('utf-8'));
          const arr: any[] = Array.isArray(parsed) ? parsed : [parsed];
          for (const msg of arr) {
            if (!msg || typeof msg !== 'object') continue;
            this.handleMsg(msg);
          }
        } catch (e) {
          console.warn('[wf-client] non-JSON:', String(raw).slice(0, 100));
        }
      });

      ws.on('close', (code) => {
        console.log(`[wf-client] WS closed code=${code}`);
        this.onDisconnect();
      });

      ws.on('error', (err) => {
        console.error('[wf-client] WS error:', err.message);
      });
    } catch (e: any) {
      console.error('[wf-client] connect failed:', e.message);
      this.scheduleReconnect();
    }
  }

  private send(msgs: object[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('ws_not_open');
    this.ws.send(JSON.stringify(msgs));
  }

  private sendMsg(messageId: string, fields: object = {}) {
    this.send([{ MessageID: messageId, ...fields }]);
  }

  private handleMsg(msg: any) {
    const mid = msg.MessageID || '';

    if (mid === 'PROXY_READY' || mid === 'PROXY_CONNECTED') {
      // Relay proxy messages — ignore, server config comes next
      return;
    }

    if (mid === 'SERVER_CONFIG') {
      console.log('[wf-client] got SERVER_CONFIG, sending DEVICE_CONFIG');
      this.ssrc = Math.floor(Math.random() * 0x7fffffff) + 1;
      this.sendMsg('DEVICE_CONFIG', {
        Ssrc: this.ssrc,
        AppName: 'GroupATES-Dispatcher',
        VersionName: '5.5',
        VersionCode: 1,
        AudioCodec: 1,
        VoiceOverTcp: true,
        Password: WF_BOT_PASSWORD,
        DeviceData: {
          SessionID: this.sessionId,
          ID: this.deviceLocalId,
          DeviceDescription: 'MANUFACTURER=GROUPATES;MODEL=Dispatcher;SERIAL=BOT001;OSVERSION=1.0',
          Login: WF_BOT_LOGIN,
          AvatarHash: '',
          StatusID: ZERO_GUID,
        },
      });
    }

    if (mid === 'CONFIG_SERVER_RESPONSE_ACK') {
      console.log('[wf-client] DEVICE_CONFIG accepted, sending LOGIN');
      this.sendMsg('LOGIN');
    }

    if (mid === 'CONFIG_SERVER_RESPONSE_NACK') {
      const reason = msg.Reason || msg.ResponseCode || 'unknown';
      console.error(`[wf-client] DEVICE_CONFIG rejected: ${reason}`);
      this.readyReject?.(new Error(`config_nack: ${reason}`));
      this.ws?.close();
    }

    if (mid === 'LOGIN_RESPONSE') {
      if ((msg.Response || 0) === 0) {
        console.log(`[wf-client] logged in as ${WF_BOT_LOGIN} (UserID=${msg.UserID})`);
        this.loggedIn = true;
        this.readyResolve?.();
      } else {
        const codes: Record<number, string> = { 1: 'bad_version', 2: 'bad_credentials', 3: 'license_expired', 4: 'max_connections', 5: 'demo', 6: 'login_in_use' };
        const reason = codes[msg.Response] || `code_${msg.Response}`;
        console.error(`[wf-client] login failed: ${reason}`);
        this.readyReject?.(new Error(`login_failed: ${reason}`));
        this.ws?.close();
      }
    }

    if (mid === 'PING') {
      this.sendMsg('PING');
    }

    if (mid === 'STORAGE_JOB_STATE') {
      const states = msg.States || [];
      for (const s of states) {
        this.handleJobState(s.JobID, s.JobState);
      }
    }
  }

  private handleJobState(jobId: string, state: number) {
    if (!jobId) return;
    let col: string | null = null;
    let newStatus: string | null = null;
    if (state >= 60) { col = 'delivered_at'; newStatus = 'delivered'; }
    else if (state >= 50) { col = 'received_at'; newStatus = 'received'; }
    else if (state >= 30) { col = 'accepted_at'; newStatus = 'accepted'; }

    if (col && newStatus) {
      query(
        `UPDATE wf_messages SET ${col} = NOW(), status = $1 WHERE job_id = $2 AND status NOT IN ('delivered','failed_timeout','failed_error')`,
        [newStatus, jobId],
      ).catch(e => console.error('[wf-client] DB update fail:', e.message));
    }

    const pending = this.pendingJobs.get(jobId);
    if (pending && state >= 50) {
      clearTimeout(pending.timer);
      this.pendingJobs.delete(jobId);
      pending.resolve(newStatus || 'received');
    }
  }

  private onDisconnect() {
    this.connected = false;
    this.loggedIn = false;
    this.ws = null;

    for (const [jobId, p] of this.pendingJobs.entries()) {
      clearTimeout(p.timer);
      p.resolve('disconnected');
      query(`UPDATE wf_messages SET status='disconnected' WHERE job_id=$1 AND status IN ('pending','sent')`, [jobId]).catch(() => {});
    }
    this.pendingJobs.clear();

    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
    this.reconnectAttempt++;
    console.log(`[wf-client] reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);
    setTimeout(() => this.connect(), delay);
  }

  async waitReady(timeoutMs = 15_000): Promise<void> {
    if (this.loggedIn) return;
    if (!this.readyPromise) this.connect();
    return Promise.race([
      this.readyPromise!,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('ready_timeout')), timeoutMs)),
    ]);
  }

  async sendPrivateMessage(toDeviceId: string, toName: string, text: string, relatedEventId?: number): Promise<{
    jobId: string; finalStatus: string; deliveredAt: Date | null;
  }> {
    await this.waitReady();

    const jobId = randB64(16);
    const fromName = WF_BOT_LOGIN;

    await query(
      `INSERT INTO wf_messages (job_id, to_device_id, to_name, from_name, text, related_event_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending')`,
      [jobId, toDeviceId, toName, fromName, text, relatedEventId ?? null],
    );

    this.sendMsg('STORAGE_JOB_REQUEST', {
      JobID: jobId,
      Title: text.slice(0, 40),
      JobType: 0,
      JobState: 10,
      ConversationType: 0,
      FromName: fromName,
      ToName: toName,
      GroupID: ZERO_GUID,
      ToDeviceID: toDeviceId,
      ToUserID: ZERO_GUID,
      Time: Date.now(),
      DataLen: Buffer.byteLength(text, 'utf8'),
      PreviewLen: 0,
    });

    const dataB64 = Buffer.from(text, 'utf-8').toString('base64');
    this.sendMsg('STORAGE_JOB_CONTENT', {
      JobID: jobId,
      ContentType: 1,
      DataFlags: 1,
      Data: dataB64,
    });

    await query(`UPDATE wf_messages SET sent_at=NOW(), status='sent' WHERE job_id=$1`, [jobId]);
    console.log(`[wf-client] sent message ${jobId} to ${toName} (${toDeviceId.slice(0, 10)}...)`);

    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        this.pendingJobs.delete(jobId);
        await query(
          `UPDATE wf_messages SET status='failed_timeout' WHERE job_id=$1 AND status NOT IN ('delivered','received','accepted')`,
          [jobId],
        ).catch(() => {});
        const rows = await query<any>(`SELECT status, delivered_at FROM wf_messages WHERE job_id=$1`, [jobId]);
        resolve({ jobId, finalStatus: rows[0]?.status || 'failed_timeout', deliveredAt: rows[0]?.delivered_at || null });
      }, DELIVERY_TIMEOUT_MS);

      this.pendingJobs.set(jobId, {
        jobId,
        timer,
        resolve: async (status) => {
          const rows = await query<any>(`SELECT status, delivered_at FROM wf_messages WHERE job_id=$1`, [jobId]);
          resolve({ jobId, finalStatus: rows[0]?.status || status, deliveredAt: rows[0]?.delivered_at || null });
        },
      });
    });
  }
}

export const wfClient = new WfClient();
