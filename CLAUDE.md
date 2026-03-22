# IoT Platform - Documentacao do Projeto

## O que e o projeto

Plataforma multi-tenant completa para gestao de dispositivos IoT, rastreadores GPS e automacoes. 100% self-hosted, sem dependencias de servicos externos. Permite que multiplas organizacoes (tenants) gerenciem seus dispositivos de forma isolada.

Funcionalidades principais:
- Multi-tenancy com isolamento por organizacao
- Biblioteca de 50+ modelos de dispositivos IoT pre-configurados (plug & play)
- Suporte a multiplos protocolos: MQTT, LoRaWAN, Wi-Fi, LTE/4G, Bluetooth, Modbus, Zigbee
- Dashboard em tempo real com graficos e metricas
- Rastreamento GPS via integracao com Traccar
- Sistema de alertas com regras configuraveis
- Automacoes no-code (SE dispositivo X -> ENTAO acao Y)
- Analise de telemetria com deteccao de anomalias
- API REST com chaves de API para integracao externa
- Gestao de usuarios com roles: SuperAdmin, Admin, Operador, Visualizador

## Stack Tecnologica

### Backend
- **Runtime**: Node.js 20 (Alpine)
- **Framework**: Express 4.18
- **Linguagem**: TypeScript 5.3 (strict: false)
- **Banco de dados**: PostgreSQL 16 (Alpine)
- **ORM**: pg (driver nativo, sem ORM)
- **Autenticacao**: JWT (jsonwebtoken) + bcryptjs
- **Seguranca**: helmet, cors, express-rate-limit
- **Logging**: morgan
- **HTTP Client**: axios (para Traccar)
- **WebSocket**: ws (disponivel mas nao utilizado nas rotas)

### Frontend
- **Framework**: React 18.3
- **Build**: Vite 5.4
- **Linguagem**: TypeScript 5.6
- **Estilizacao**: Tailwind CSS 3.4
- **Estado**: Zustand 5.0
- **Data Fetching**: TanStack React Query 5.59
- **Graficos**: Recharts 2.13
- **Mapas**: Leaflet + react-leaflet
- **Icones**: lucide-react
- **Datas**: date-fns
- **Roteamento**: react-router-dom 6.27
- **HTTP Client**: axios

### Infraestrutura
- **Containerizacao**: Docker + Docker Compose 3.9
- **Reverse Proxy**: Nginx (Alpine)
- **SSL**: Certbot (Let's Encrypt)
- **GPS Server**: Traccar (opcional, via profile)
- **Volumes**: postgres_data, certbot_www, certbot_certs, traccar_data

## Estrutura de Pastas

```
/
├── backend/
│   ├── src/
│   │   ├── index.ts           # Entry point: Express app, migracoes, server
│   │   ├── config/
│   │   │   └── db.ts          # Pool PostgreSQL, query helpers, transacoes
│   │   ├── middleware/
│   │   │   └── auth.ts        # JWT auth middleware, role guard
│   │   ├── routes/
│   │   │   └── index.ts       # TODAS as rotas da API (~500 linhas)
│   │   └── migrations/
│   │       ├── 001_schema.sql       # Schema principal (tenants, users, devices, telemetry, alerts, automations, api_keys)
│   │       ├── 002_devices_seed.sql # Seed inicial de modelos de dispositivos
│   │       ├── 003_devices_library_v2.sql # Refatoracao da biblioteca (TRUNCATE + re-insert)
│   │       ├── 004_connection_fields.sql  # Campos de conexao IP:Porta
│   │       ├── 005_library_seed_fixed.sql # Seed expandido com 50+ modelos
│   │       └── run.ts          # Runner de migracoes standalone
│   ├── Dockerfile             # Multi-stage build (builder + runner)
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx           # Entry point React
│   │   ├── App.tsx            # Router com guards de autenticacao
│   │   ├── index.css          # Tailwind + componentes base + Leaflet dark mode
│   │   ├── components/
│   │   │   └── Layout.tsx     # Sidebar + navigation + user info
│   │   ├── services/
│   │   │   └── api.ts         # Axios instance + interceptors + todas APIs
│   │   ├── store/
│   │   │   └── auth.ts        # Zustand store de autenticacao
│   │   └── pages/
│   │       ├── Login.tsx       # Tela de login
│   │       ├── Register.tsx    # Registro de nova organizacao
│   │       ├── Dashboard.tsx   # Dashboard com cards, graficos, dispositivos recentes
│   │       ├── Devices.tsx     # Lista de dispositivos com filtros
│   │       ├── DeviceDetail.tsx # Detalhe: telemetria, conexao IP:Porta, config
│   │       ├── DeviceLibrary.tsx # Biblioteca de modelos plug & play
│   │       ├── Trackers.tsx    # Rastreadores GPS com mapa Leaflet + Traccar
│   │       ├── Alerts.tsx      # Alertas e regras de alerta
│   │       ├── Automations.tsx # Automacoes no-code
│   │       ├── Analytics.tsx   # Analise de telemetria + deteccao anomalias
│   │       ├── Users.tsx       # Gestao de usuarios da organizacao
│   │       ├── Settings.tsx    # Perfil + API Keys
│   │       └── SuperAdmin.tsx  # Gestao de tenants (superadmin only)
│   ├── Dockerfile             # Multi-stage: Vite build + Nginx serve
│   ├── nginx.conf             # SPA fallback + cache de assets
│   ├── vite.config.ts         # Alias @, proxy /api -> backend:3001
│   ├── tailwind.config.js
│   └── package.json
│
├── nginx/
│   ├── nginx.conf             # Config global Nginx
│   └── conf.d/
│       └── app.conf           # Reverse proxy: /api -> backend, / -> frontend
│
├── traccar/
│   └── traccar.xml            # Config Traccar: H2 DB, portas GPS
│
├── docker-compose.yml         # Servicos: postgres, backend, frontend, nginx, certbot, traccar
├── .env.example               # Variaveis de ambiente
├── .gitignore
├── install.sh                 # Instalacao automatica (Docker + .env + up)
├── ssl.sh                     # Configuracao SSL com Let's Encrypt
├── backup.sh                  # Backup do banco PostgreSQL
└── README.md                  # Documentacao de uso
```

## Como Rodar o Projeto

### Prerequisitos
- Docker e Docker Compose
- Ubuntu 20.04/22.04/24.04 (recomendado)
- Minimo 2 GB RAM, 20 GB disco

### Instalacao Rapida
```bash
# 1. Clonar o projeto
git clone <repo-url>
cd projeto

# 2. Instalacao automatica
sudo bash install.sh

# 3. Ou manualmente:
cp .env.example .env
# Editar .env com suas credenciais
docker compose up -d --build

# 4. Com Traccar GPS (opcional):
docker compose --profile traccar up -d --build
```

### Acesso
- Plataforma: http://SEU-IP
- Traccar: http://SEU-IP:8082
- Credenciais padrao: admin@iotplatform.com / Admin@2024!

### Desenvolvimento Local
```bash
# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

### Comandos Uteis
```bash
docker compose logs -f backend          # Logs
docker compose restart                   # Reiniciar
docker compose down                      # Parar
docker compose exec postgres psql -U iotuser -d iotplatform  # Acessar DB
bash backup.sh                           # Backup do banco
```

## Pontos de Atencao e Problemas Encontrados

### Criticos
1. **JWT Secret fallback inseguro**: Em `routes/index.ts:9` e `middleware/auth.ts:25`, o fallback do JWT_SECRET e `'secret'`, o que e perigoso se a variavel de ambiente nao for definida
2. **tsconfig strict: false**: O TypeScript nao esta em modo estrito, permitindo erros silenciosos de tipos

### Arquiteturais
3. **Arquivo de rotas monolitico**: Todas as 500+ linhas de rotas estao em `backend/src/routes/index.ts`. Deveria ser dividido em modulos (auth, devices, alerts, automations, traccar, superadmin, apikeys)
4. **SuperAdmin createTenant incompleto**: A rota `POST /superadmin/tenants` cria o tenant mas NAO cria um usuario admin para ele, tornando o tenant inacessivel
5. **API Key authentication ausente**: As API Keys sao criadas e armazenadas mas NAO ha middleware que autentique via API Key (apenas JWT funciona)

### Frontend
6. **Dashboard com dados mock**: O grafico de "Atividade 24h" usa `Math.random()` ao inves de dados reais
7. **data_types nao existe**: `DeviceLibrary.tsx` referencia `m.data_types` mas o campo no banco e `data_schema` (JSONB)
8. **Settings mostra key_preview inexistente**: O campo retornado pela API e `key_prefix`, mas o frontend usa `k.key_preview`

### Seguranca
9. **Sem rate limit no registro**: A rota `/auth/register` nao tem rate limiting, permitindo criacao massiva de contas
10. **Credenciais Traccar hardcoded**: Credenciais padrao do Traccar estao hardcoded em varios lugares

### Performance
11. **Sem indice em users.email**: A busca por email na tabela users nao tem indice dedicado (apenas UNIQUE(tenant_id, email))
12. **Telemetria sem particao**: A tabela telemetry pode crescer muito sem estrategia de particao ou limpeza

## Proximas Melhorias Sugeridas

### Prioridade Alta
- [ ] Dividir `routes/index.ts` em modulos separados
- [ ] Ativar `strict: true` no tsconfig e corrigir erros
- [ ] Implementar autenticacao via API Key (middleware)
- [ ] Corrigir criacao de tenant no SuperAdmin (criar usuario admin junto)
- [ ] Remover dados mock do Dashboard
- [ ] Adicionar rate limit no registro
- [ ] Adicionar graceful shutdown no backend

### Prioridade Media
- [ ] Adicionar WebSocket para atualizacoes em tempo real
- [ ] Implementar paginacao real na telemetria
- [ ] Adicionar validacao de email com regex
- [ ] Implementar troca de senha
- [ ] Adicionar logs estruturados (winston/pino)
- [ ] Adicionar testes unitarios e de integracao
- [ ] Criar indice global em users.email

### Prioridade Baixa
- [ ] Implementar export de dados (CSV/JSON)
- [ ] Dashboard de telemetria com dados reais (substituir mock)
- [ ] Implementar notificacoes push/email nos alertas
- [ ] Adicionar suporte a MQTT broker integrado
- [ ] Particionar tabela de telemetria por tempo
- [ ] Implementar soft delete em dispositivos
- [ ] Adicionar dark/light theme toggle
