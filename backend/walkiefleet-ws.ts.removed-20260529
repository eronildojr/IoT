/**
 * WalkieFleet PTT WebSocket Server
 *
 * Handles real-time PTT communication between browser clients.
 * Each connected browser can:
 *   - See who is online
 *   - Start/stop PTT transmissions to a group
 *   - Receive audio from other transmitters
 *   - See GPS locations of radio users
 *
 * Protocol (JSON messages):
 *   Client → Server:
 *     { type: "auth", token: "jwt..." }
 *     { type: "ptt_start", groupId: "uuid" }
 *     { type: "ptt_stop" }
 *     { type: "audio", data: "base64...", groupId: "uuid" }
 *     { type: "get_state" }
 *
 *   Server → Client:
 *     { type: "auth_ok", userId: "...", userName: "..." }
 *     { type: "state", users: [...], groups: [...], activePTT: {...} }
 *     { type: "ptt_started", userId: "...", userName: "...", groupId: "...", groupName: "..." }
 *     { type: "ptt_stopped", userId: "...", duration: N }
 *     { type: "audio", data: "base64...", userId: "...", groupId: "..." }
 *     { type: "user_online", userId: "...", userName: "..." }
 *     { type: "user_offline", userId: "..." }
 *     { type: "location", deviceId: "...", lat: N, lng: N }
 */

import { Server as HttpServer, IncomingMessage } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { query, queryOne } from './config/db';

interface WFClient {
  ws: WebSocket;
  userId: string;
  userName: string;
  tenantId: string;
  authenticated: boolean;
}

interface ActivePTT {
  userId: string;
  userName: string;
  groupId: string;
  groupName: string;
  startedAt: number;
}

const clients = new Map<WebSocket, WFClient>();
let activePTT: ActivePTT | null = null;

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export function registerWalkieFleetWS(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req: IncomingMessage, socket: any, head: Buffer) => {
    const url = req.url || '';
    if (!url.startsWith('/api/walkiefleet/ws')) {
      // Not our upgrade - let it fall through (don't destroy - other handlers may need it)
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    const client: WFClient = { ws, userId: '', userName: '', tenantId: '', authenticated: false };
    clients.set(ws, client);

    // Auth timeout - must authenticate within 10s
    const authTimer = setTimeout(() => {
      if (!client.authenticated) {
        ws.close(4001, 'Auth timeout');
      }
    }, 10000);

    ws.on('message', async (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        await handleMessage(client, msg);
      } catch (e) {
        // ignore parse errors
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      if (client.authenticated) {
        // If this user had active PTT, stop it
        if (activePTT && activePTT.userId === client.userId) {
          const duration = Math.round((Date.now() - activePTT.startedAt) / 1000);
          broadcast(client.tenantId, { type: 'ptt_stopped', userId: client.userId, duration });
          activePTT = null;
        }
        broadcast(client.tenantId, { type: 'user_offline', userId: client.userId, userName: client.userName });
      }
      clients.delete(ws);
    });
  });

  console.log('[WalkieFleet WS] WebSocket handler registered on /api/walkiefleet/ws');
}

async function handleMessage(client: WFClient, msg: any) {
  const { type } = msg;

  if (type === 'auth') {
    try {
      const decoded: any = jwt.verify(msg.token, JWT_SECRET);
      client.userId = decoded.id;
      client.userName = decoded.name || decoded.email;
      client.tenantId = decoded.tenantId;
      client.authenticated = true;

      send(client.ws, { type: 'auth_ok', userId: client.userId, userName: client.userName });
      broadcast(client.tenantId, { type: 'user_online', userId: client.userId, userName: client.userName }, client.ws);

      // Send current state
      await sendState(client);
    } catch {
      send(client.ws, { type: 'auth_error', message: 'Invalid token' });
      client.ws.close(4002, 'Auth failed');
    }
    return;
  }

  if (!client.authenticated) return;

  if (type === 'get_state') {
    await sendState(client);
  }

  else if (type === 'ptt_start') {
    if (activePTT) {
      send(client.ws, { type: 'error', message: 'Canal ocupado', activeUser: activePTT.userName });
      return;
    }
    const groupId = msg.groupId;
    const group = await queryOne<any>('SELECT id,name FROM walkiefleet_groups WHERE id=$1 AND tenant_id=$2', [groupId, client.tenantId]);
    if (!group) {
      send(client.ws, { type: 'error', message: 'Grupo nao encontrado' });
      return;
    }
    activePTT = { userId: client.userId, userName: client.userName, groupId, groupName: group.name, startedAt: Date.now() };
    broadcast(client.tenantId, { type: 'ptt_started', userId: client.userId, userName: client.userName, groupId, groupName: group.name });
  }

  else if (type === 'ptt_stop') {
    if (activePTT && activePTT.userId === client.userId) {
      const duration = Math.round((Date.now() - activePTT.startedAt) / 1000);
      broadcast(client.tenantId, { type: 'ptt_stopped', userId: client.userId, userName: client.userName, duration, groupId: activePTT.groupId, groupName: activePTT.groupName });

      // Save to history
      // Find device linked to this user (if any)
      const device = await queryOne<any>('SELECT id FROM walkiefleet_devices WHERE assigned_to ILIKE $1 AND tenant_id=$2 LIMIT 1', [`%${client.userName}%`, client.tenantId]);
      await query(
        `INSERT INTO walkiefleet_messages(tenant_id,device_id,group_id,message_type,duration_seconds,call_id)
         VALUES($1,$2,$3,'voice',$4,$5)`,
        [client.tenantId, device?.id || null, activePTT.groupId, duration, `ptt_${Date.now()}`]
      );

      activePTT = null;
    }
  }

  else if (type === 'audio') {
    // Relay audio to all clients in the same tenant (except sender)
    if (activePTT && activePTT.userId === client.userId) {
      broadcast(client.tenantId, { type: 'audio', data: msg.data, userId: client.userId, groupId: msg.groupId }, client.ws);
    }
  }

  else if (type === 'update_device') {
    // Update device status/location from the page
    const { deviceId, status, batteryLevel, signalStrength, lat, lng } = msg;
    if (deviceId) {
      await query(
        `UPDATE walkiefleet_devices SET status=COALESCE($1,status),battery_level=COALESCE($2,battery_level),
         signal_strength=COALESCE($3,signal_strength),last_location_lat=COALESCE($4,last_location_lat),
         last_location_lng=COALESCE($5,last_location_lng),last_seen_at=NOW() WHERE device_id=$6 AND tenant_id=$7`,
        [status, batteryLevel, signalStrength, lat, lng, deviceId, client.tenantId]
      );
      broadcast(client.tenantId, { type: 'device_updated', deviceId, status, lat, lng });
    }
  }

  else if (type === 'sos') {
    // SOS alert
    const { deviceId } = msg;
    if (deviceId) {
      await query("UPDATE walkiefleet_devices SET status='sos' WHERE device_id=$1 AND tenant_id=$2", [deviceId, client.tenantId]);
      const device = await queryOne<any>('SELECT id,name FROM walkiefleet_devices WHERE device_id=$1 AND tenant_id=$2', [deviceId, client.tenantId]);
      await query(
        `INSERT INTO walkiefleet_messages(tenant_id,device_id,message_type,is_sos) VALUES($1,$2,'sos',true)`,
        [client.tenantId, device?.id || null]
      );
      broadcast(client.tenantId, { type: 'sos_alert', deviceId, deviceName: device?.name, userName: client.userName });
    }
  }
}

async function sendState(client: WFClient) {
  const [devices, groups, messages] = await Promise.all([
    query('SELECT * FROM walkiefleet_devices WHERE tenant_id=$1 ORDER BY name', [client.tenantId]),
    query(`SELECT g.*, COUNT(d.id) as device_count FROM walkiefleet_groups g
           LEFT JOIN walkiefleet_devices d ON d.assigned_group_id=g.id
           WHERE g.tenant_id=$1 GROUP BY g.id ORDER BY g.channel`, [client.tenantId]),
    query(`SELECT m.*, d.name as device_name, g.name as group_name
           FROM walkiefleet_messages m LEFT JOIN walkiefleet_devices d ON d.id=m.device_id
           LEFT JOIN walkiefleet_groups g ON g.id=m.group_id
           WHERE m.tenant_id=$1 ORDER BY m.created_at DESC LIMIT 30`, [client.tenantId]),
  ]);

  // Online dispatchers
  const onlineUsers: string[] = [];
  clients.forEach(c => {
    if (c.authenticated && c.tenantId === client.tenantId) {
      onlineUsers.push(c.userName);
    }
  });

  send(client.ws, {
    type: 'state',
    devices, groups, messages,
    activePTT,
    onlineDispatchers: onlineUsers,
  });
}

function send(ws: WebSocket, data: any) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(tenantId: string, data: any, exclude?: WebSocket) {
  clients.forEach(client => {
    if (client.authenticated && client.tenantId === tenantId && client.ws !== exclude) {
      send(client.ws, data);
    }
  });
}
