/**
 * chirpstackBridge.ts
 * Serviço que assina os tópicos MQTT do ChirpStack e sincroniza
 * dispositivos LoRaWAN na plataforma IoT.
 *
 * Tópicos assinados:
 *   application/+/device/+/event/up   → uplink (telemetria)
 *   application/+/device/+/event/join → join (dispositivo conectou)
 *   application/+/device/+/event/status → status
 */
import mqtt from 'mqtt';
import { query, queryOne } from '../config/db';

const CHIRPSTACK_MQTT_HOST = process.env.CHIRPSTACK_MQTT_HOST || 'iot_mosquitto';
const CHIRPSTACK_MQTT_PORT = parseInt(process.env.CHIRPSTACK_MQTT_PORT || '1883');
const CHIRPSTACK_MQTT_USER = process.env.CHIRPSTACK_MQTT_USER || '';
const CHIRPSTACK_MQTT_PASS = process.env.CHIRPSTACK_MQTT_PASS || '';
// Tenant padrão para dispositivos ChirpStack (Super Admin)
const DEFAULT_TENANT_ID = process.env.CHIRPSTACK_DEFAULT_TENANT_ID || 'e2ce35be-666e-4e93-acef-ab07aa258941';

let client: mqtt.MqttClient | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let isConnected = false;

export function startChirpstackBridge() {
  console.log('[ChirpStack Bridge] Iniciando conexão MQTT...');
  connectMqtt();
}

function connectMqtt() {
  const url = `mqtt://${CHIRPSTACK_MQTT_HOST}:${CHIRPSTACK_MQTT_PORT}`;
  
  client = mqtt.connect(url, {
    clientId: `iot_platform_bridge_${Date.now()}`,
    username: CHIRPSTACK_MQTT_USER || undefined,
    password: CHIRPSTACK_MQTT_PASS || undefined,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    clean: true,
  });

  client.on('connect', () => {
    isConnected = true;
    console.log('[ChirpStack Bridge] Conectado ao MQTT broker');
    
    // Assinar tópicos do ChirpStack v4
    // Formato: application/{appId}/device/{devEUI}/event/{eventType}
    const topics = [
      'application/+/device/+/event/up',
      'application/+/device/+/event/join',
      'application/+/device/+/event/status',
    ];
    
    client!.subscribe(topics, { qos: 1 }, (err) => {
      if (err) {
        console.error('[ChirpStack Bridge] Erro ao assinar tópicos:', err);
      } else {
        console.log('[ChirpStack Bridge] Assinando tópicos:', topics.join(', '));
      }
    });
  });

  client.on('message', async (topic: string, payload: Buffer) => {
    try {
      await handleMessage(topic, payload);
    } catch (err) {
      console.error('[ChirpStack Bridge] Erro ao processar mensagem:', err);
    }
  });

  client.on('error', (err) => {
    console.error('[ChirpStack Bridge] Erro MQTT:', err.message);
  });

  client.on('disconnect', () => {
    isConnected = false;
    console.log('[ChirpStack Bridge] Desconectado do MQTT');
  });

  client.on('reconnect', () => {
    console.log('[ChirpStack Bridge] Reconectando...');
  });
}

async function handleMessage(topic: string, payload: Buffer) {
  // Parsear o tópico: application/{appId}/device/{devEUI}/event/{eventType}
  const parts = topic.split('/');
  if (parts.length < 6) return;
  
  const appId = parts[1];
  const devEUI = parts[3];
  const eventType = parts[5];
  
  let data: any;
  try {
    data = JSON.parse(payload.toString());
  } catch {
    return; // Ignorar payloads inválidos
  }

  switch (eventType) {
    case 'join':
      await handleJoinEvent(devEUI, appId, data);
      break;
    case 'up':
      await handleUplinkEvent(devEUI, appId, data);
      break;
    case 'status':
      await handleStatusEvent(devEUI, data);
      break;
  }
}

async function handleJoinEvent(devEUI: string, appId: string, data: any) {
  console.log(`[ChirpStack Bridge] JOIN: devEUI=${devEUI}`);
  
  // Verificar se o dispositivo já existe
  const existing = await queryOne<any>(
    `SELECT id FROM devices WHERE lorawan_dev_eui = $1`,
    [devEUI.toLowerCase()]
  );
  
  if (!existing) {
    // Criar o dispositivo automaticamente
    const deviceName = data.deviceName || `LoRaWAN-${devEUI.slice(-4).toUpperCase()}`;
    const region = detectRegion(data);
    
    await query(
      `INSERT INTO devices(
        tenant_id, name, identifier, protocol, type,
        lorawan_dev_eui, lorawan_region, lorawan_chirpstack_id,
        status, notes, tags
      ) VALUES($1,$2,$3,'lorawan','iot',$4,$5,$6,'online',$7,$8)
      ON CONFLICT (tenant_id, identifier) DO UPDATE SET
        status='online', lorawan_region=$5, lorawan_chirpstack_id=$6, updated_at=NOW()`,
      [
        DEFAULT_TENANT_ID,
        deviceName,
        `lorawan_${devEUI.toLowerCase()}`,
        devEUI.toLowerCase(),
        region,
        appId,
        `Dispositivo LoRaWAN registrado automaticamente via ChirpStack. DevEUI: ${devEUI}`,
        ['lorawan', 'auto-provisioned'],
      ]
    );
    console.log(`[ChirpStack Bridge] Dispositivo criado: ${deviceName} (${devEUI})`);
  } else {
    // Atualizar status para online
    await query(
      `UPDATE devices SET status='online', last_seen_at=NOW(), updated_at=NOW() WHERE lorawan_dev_eui=$1`,
      [devEUI.toLowerCase()]
    );
  }
}

async function handleUplinkEvent(devEUI: string, appId: string, data: any) {
  // Extrair métricas de RF
  const rxInfo = data.rxInfo?.[0] || {};
  const txInfo = data.txInfo || {};
  const rssi = rxInfo.rssi || null;
  const snr = rxInfo.snr || null;
  const sf = txInfo.modulation?.lora?.spreadingFactor || null;
  
  // Verificar se o dispositivo existe
  let device = await queryOne<any>(
    `SELECT id, tenant_id FROM devices WHERE lorawan_dev_eui = $1`,
    [devEUI.toLowerCase()]
  );
  
  if (!device) {
    // Auto-provisionar se não existir
    await handleJoinEvent(devEUI, appId, { deviceName: data.deviceName });
    device = await queryOne<any>(
      `SELECT id, tenant_id FROM devices WHERE lorawan_dev_eui = $1`,
      [devEUI.toLowerCase()]
    );
    if (!device) return;
  }
  
  // Atualizar métricas de RF e status
  await query(
    `UPDATE devices SET
      status='online',
      last_seen_at=NOW(),
      lorawan_last_uplink=NOW(),
      lorawan_last_rssi=$2,
      lorawan_last_snr=$3,
      lorawan_last_sf=$4,
      lorawan_frame_count=COALESCE(lorawan_frame_count,0)+1,
      updated_at=NOW()
    WHERE id=$1`,
    [device.id, rssi, snr, sf]
  );
  
  // Processar o payload decodificado (se disponível)
  const decodedPayload = data.object || data.data;
  if (decodedPayload && typeof decodedPayload === 'object') {
    // Salvar telemetria
    await query(
      `INSERT INTO telemetry(device_id, tenant_id, payload, received_at)
       VALUES($1,$2,$3,NOW())`,
      [device.id, device.tenant_id, JSON.stringify(decodedPayload)]
    ).catch(() => {
      // Tabela pode não ter a coluna certa - ignorar silenciosamente
    });
    
    // Atualizar last_telemetry no device
    await query(
      `UPDATE devices SET last_telemetry=$2, last_payload=$2 WHERE id=$1`,
      [device.id, JSON.stringify(decodedPayload)]
    ).catch(() => {});
  }
  
  console.log(`[ChirpStack Bridge] UPLINK: devEUI=${devEUI}, RSSI=${rssi}dBm, SNR=${snr}dB`);
}

async function handleStatusEvent(devEUI: string, data: any) {
  const batteryLevel = data.batteryLevel ?? null;
  const margin = data.margin ?? null;
  
  await query(
    `UPDATE devices SET
      battery_level=$2,
      signal_strength=$3,
      last_seen_at=NOW(),
      updated_at=NOW()
    WHERE lorawan_dev_eui=$1`,
    [devEUI.toLowerCase(), batteryLevel, margin]
  );
}

function detectRegion(data: any): string {
  // Tentar detectar a região pelo contexto
  const region = data.region || data.rxInfo?.[0]?.region || '';
  if (region.includes('US')) return 'US915';
  if (region.includes('AU')) return 'AU915';
  if (region.includes('EU')) return 'EU868';
  return 'EU868'; // padrão
}

export function getChirpstackBridgeStatus() {
  return {
    connected: isConnected,
    broker: `mqtt://${CHIRPSTACK_MQTT_HOST}:${CHIRPSTACK_MQTT_PORT}`,
  };
}
