import mqtt from 'mqtt';

let client: mqtt.MqttClient | null = null;
const subscribers: Map<string, ((topic: string, payload: Buffer) => void)[]> = new Map();

const MQTT_URL = process.env.MQTT_URL || 'mqtt://iot_mosquitto:1883';
const MQTT_USER = process.env.MQTT_USER || 'iotplatform';
const MQTT_PASS = process.env.MQTT_PASS || 'iot@2024';

export function getMqttClient(): mqtt.MqttClient {
  if (!client || !client.connected) {
    client = mqtt.connect(MQTT_URL, {
      username: MQTT_USER,
      password: MQTT_PASS,
      clientId: `iot_backend_${Date.now()}`,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    });

    client.on('connect', () => {
      console.log('[MQTT] Conectado ao broker:', MQTT_URL);
      // Re-subscribe em todos os tópicos registrados
      for (const topic of subscribers.keys()) {
        client!.subscribe(topic, { qos: 1 });
      }
    });

    client.on('error', (err) => {
      console.error('[MQTT] Erro:', err.message);
    });

    client.on('message', (topic, payload) => {
      const handlers = subscribers.get(topic) || [];
      // Verificar padrões wildcard
      for (const [pattern, cbs] of subscribers.entries()) {
        if (topicMatches(pattern, topic)) {
          cbs.forEach(cb => cb(topic, payload));
        }
      }
    });
  }
  return client;
}

function topicMatches(pattern: string, topic: string): boolean {
  const patternParts = pattern.split('/');
  const topicParts = topic.split('/');
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '#') return true;
    if (patternParts[i] === '+') continue;
    if (patternParts[i] !== topicParts[i]) return false;
  }
  return patternParts.length === topicParts.length;
}

export function publishMqtt(topic: string, payload: object | string, qos: 0 | 1 | 2 = 1): void {
  const c = getMqttClient();
  const msg = typeof payload === 'string' ? payload : JSON.stringify(payload);
  c.publish(topic, msg, { qos }, (err) => {
    if (err) console.error('[MQTT] Erro ao publicar em', topic, err.message);
  });
}

export function subscribeMqtt(topic: string, handler: (topic: string, payload: Buffer) => void): void {
  const c = getMqttClient();
  if (!subscribers.has(topic)) {
    subscribers.set(topic, []);
    c.subscribe(topic, { qos: 1 });
  }
  subscribers.get(topic)!.push(handler);
}

export function buildDeviceTopics(tenantId: string, deviceId: string) {
  return {
    telemetry: `iot/${tenantId}/${deviceId}/telemetry`,
    command:   `iot/${tenantId}/${deviceId}/command`,
    status:    `iot/${tenantId}/${deviceId}/status`,
  };
}

// Inicializar conexão ao carregar o módulo
getMqttClient();

