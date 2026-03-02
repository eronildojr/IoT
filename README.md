# 🌐 IoT Platform — Plataforma Universal de Gestão IoT

Plataforma multi-tenant completa para gestão de dispositivos IoT, rastreadores GPS e automações. 100% self-hosted, sem dependências de serviços externos.

---

## ✨ Funcionalidades

| Módulo | Descrição |
|---|---|
| **Multi-tenant** | Cada cliente tem seu próprio ambiente isolado |
| **Biblioteca IoT** | 30+ modelos pré-configurados (plug & play) |
| **Protocolos** | MQTT, LoRaWAN, Wi-Fi, LTE/4G, Bluetooth |
| **Dashboard** | Gráficos em tempo real, status, alertas |
| **Rastreadores GPS** | Integração com Traccar (todos os protocolos) |
| **Alertas** | Regras configuráveis com notificações |
| **Automações** | No-code: SE dispositivo X → ENTÃO ação Y |
| **Análise & IA** | Detecção de anomalias, tendências, estatísticas |
| **API REST** | Integração com sistemas externos via API Keys |
| **Usuários** | Admin, Operador, Visualizador por organização |
| **Super Admin** | Gestão de clientes, planos e limites |

---

## 🚀 Instalação Rápida (Ubuntu 20.04/22.04/24.04)

### Pré-requisitos
- Servidor Ubuntu com mínimo **2 GB RAM** e **20 GB disco**
- Acesso root/sudo
- Porta 80 e 443 abertas no firewall

### 1. Clonar / Copiar o projeto
```bash
# Copiar o projeto para o servidor via SCP ou Git
scp -r iotplatform/ usuario@seu-servidor:/opt/iotplatform
ssh usuario@seu-servidor
cd /opt/iotplatform
```

### 2. Instalação automática
```bash
sudo bash install.sh
```

O script instala Docker, configura o ambiente e sobe todos os serviços automaticamente.

### 3. Primeiro acesso
Após a instalação, acesse:
- **Plataforma:** `http://SEU-IP`
- **Traccar GPS:** `http://SEU-IP:8082`

Credenciais padrão (definidas no `.env`):
- E-mail: `admin@iotplatform.com`
- Senha: `Admin@2024!`

---

## 🔒 Configurar SSL (HTTPS)

Após apontar seu domínio para o servidor:

```bash
sudo bash ssl.sh meudominio.com email@meudominio.com
```

---

## ⚙️ Configuração Manual

### Editar variáveis de ambiente
```bash
cp .env.example .env
nano .env
```

| Variável | Descrição |
|---|---|
| `POSTGRES_PASSWORD` | Senha do banco de dados |
| `JWT_SECRET` | Chave secreta JWT (mínimo 32 chars aleatórios) |
| `SUPERADMIN_EMAIL` | E-mail do super administrador |
| `SUPERADMIN_PASSWORD` | Senha do super administrador |
| `DOMAIN` | Seu domínio (para SSL) |

### Subir os serviços
```bash
docker compose up -d --build
```

### Subir com Traccar GPS
```bash
docker compose --profile traccar up -d --build
```

---

## 📡 Integração de Dispositivos

### Enviar telemetria via API
```bash
# Obter API Key em: Configurações → API Keys
curl -X POST https://meudominio.com/api/devices/DEVICE_ID/telemetry \
  -H "Authorization: Bearer SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"data": {"temperature": 25.5, "humidity": 60, "battery": 85}}'
```

### Exemplo com ESP32 (Arduino/MicroPython)
```cpp
// ESP32 enviando temperatura via HTTP
#include <WiFi.h>
#include <HTTPClient.h>

const char* apiUrl = "http://SEU-IP/api/devices/DEVICE_ID/telemetry";
const char* apiKey = "SUA_API_KEY";

void sendTelemetry(float temp, float humidity) {
  HTTPClient http;
  http.begin(apiUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + apiKey);
  
  String body = "{\"data\":{\"temperature\":" + String(temp) + 
                ",\"humidity\":" + String(humidity) + "}}";
  http.POST(body);
  http.end();
}
```

### Exemplo com Python (Raspberry Pi)
```python
import requests

API_URL = "http://SEU-IP/api/devices/DEVICE_ID/telemetry"
API_KEY = "SUA_API_KEY"

def send_telemetry(data: dict):
    r = requests.post(
        API_URL,
        json={"data": data},
        headers={"Authorization": f"Bearer {API_KEY}"}
    )
    return r.json()

# Uso
send_telemetry({"temperature": 25.5, "motion": True, "door_open": False})
```

---

## 📍 Rastreadores GPS (Traccar)

O Traccar suporta mais de 200 protocolos de rastreadores. Portas abertas:

| Porta | Protocolo | Rastreadores |
|---|---|---|
| 5055 | OsmAnd | Apps mobile |
| 5001 | Teltonika | FMB series |
| 5013 | GPS103 | TK103, GPS103 |
| 5027 | H02 | Concox, Meitrack |
| 5023 | GT06 | Coban, Xexun |
| 8082 | Web UI | Configuração |

Configure o servidor Traccar na plataforma em: **Rastreadores GPS → Configurar Traccar**

---

## 🔧 Comandos Úteis

```bash
# Ver logs em tempo real
docker compose logs -f backend

# Reiniciar serviços
docker compose restart

# Parar tudo
docker compose down

# Backup do banco
bash backup.sh

# Atualizar plataforma
git pull
docker compose up -d --build

# Acessar banco de dados
docker compose exec postgres psql -U iotuser -d iotplatform

# Ver status dos containers
docker compose ps
```

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                    Internet                          │
└─────────────────────┬───────────────────────────────┘
                      │ :80 / :443
┌─────────────────────▼───────────────────────────────┐
│                 Nginx (Reverse Proxy)                │
│              HTTP → HTTPS redirect                   │
└──────────┬──────────────────────┬───────────────────┘
           │ /api/*               │ /*
┌──────────▼──────────┐  ┌────────▼────────────────────┐
│  Backend Node.js    │  │   Frontend React (Nginx)     │
│  Express + JWT      │  │   SPA com React Router       │
│  Port: 3001         │  │   Port: 80                   │
└──────────┬──────────┘  └─────────────────────────────┘
           │
┌──────────▼──────────┐  ┌─────────────────────────────┐
│   PostgreSQL 16     │  │   Traccar GPS Server         │
│   Port: 5432        │  │   Port: 8082 + protocolos    │
└─────────────────────┘  └─────────────────────────────┘
```

---

## 📊 Planos e Limites

Configure no Super Admin (`/superadmin`):

| Plano | Dispositivos | Usuários |
|---|---|---|
| Free | 10 | 3 |
| Starter | 50 | 10 |
| Pro | 200 | 50 |
| Enterprise | Ilimitado | Ilimitado |

---

## 🆘 Suporte e Troubleshooting

### Backend não inicia
```bash
docker compose logs backend
# Verificar se PostgreSQL está saudável
docker compose ps postgres
```

### Banco de dados com erro
```bash
# Recriar banco
docker compose down -v
docker compose up -d
```

### Certificado SSL não renova
```bash
docker compose restart certbot
```

---

**Versão:** 1.0.0 | **Stack:** Node.js 20 + PostgreSQL 16 + React 18 + Nginx
