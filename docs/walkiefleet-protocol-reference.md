# WalkieFleet — Referência destilada do protocolo

**Fonte:** decompilação oficial do cliente WPF WalkieFleet (CDCTelecom) — arquivos `Protocol.cs` (272 linhas), `MainWindow_xaml.cs` (833 linhas), `RTPPacket.cs` (260 linhas), `ALAW.cs` (105 linhas), `wfclient.html` (542 linhas, JS vanilla simplificado).

Este doc é a fonte da verdade para decisões de implementação. Quando houver divergência entre este doc e código existente, **este doc vence** (o código pode estar errado por inferência).

---

## 1. Handshake completo (ordem temporal)

```
1. WS abre        client → server
2. SERVER_CONFIG  server → client    { VoipPort, AudioSampleRate, AudioBitRate, AudioFrameSize, ... }
3. DEVICE_CONFIG  client → server    (formato abaixo)
4. CONFIG_SERVER_RESPONSE_ACK   server → client
   ou
   CONFIG_SERVER_RESPONSE_NACK  server → client    { Reason: string }
5. LOGIN          client → server    { MessageID: "LOGIN" }      [só o MessageID, sem outros campos]
6. LOGIN_RESPONSE server → client    { Result: int (LoginResponse enum), ... }
7. DATAEX         server → client    [fluxo contínuo: INITIALIZE → ADD/REMOVE/CHANGE]
```

### DEVICE_CONFIG — formato exato (MainWindow_xaml.cs:147-164)

```json
{
  "MessageID": "DEVICE_CONFIG",
  "Ssrc": <int aleatório, mesmo SSRC usado no header RTP do VOICE_PACKET>,
  "AppName": "GroupATES-WF",
  "VersionName": "5.5",
  "VersionCode": 1,
  "AudioCodec": 1,
  "Password": "<senha plain text>",
  "DeviceData": {
    "SessionID": "<base64 de GUID novo>",
    "ID": "<base64 do DeviceID — GUID persistente do dispositivo>",
    "StatusID": "<base64 de GUID.Empty = AAAAAAAAAAAAAAAAAAAAAA==>",
    "DeviceDescription": "MANUFACTURER=WLLC;MODEL=APIClientWPF;SERIAL=123456789;OSVERSION=5.0",
    "Login": "<username>",
    "AvatarHash": ""
  }
}
```

**Notas:**
- `AppName` pode ser qualquer string identificadora; o cliente vanilla usa `"GroupATES-WF"`.
- `Ssrc` é o mesmo número usado em todos os `VOICE_PACKET` daquela sessão; gerar `Math.floor(Math.random() * 2**32)`.
- `SessionID` é novo a cada conexão; `ID` (DeviceID) deve persistir em localStorage para o servidor reconhecer o mesmo dispositivo.

---

## 2. Enums — valores numéricos exatos (Protocol.cs)

### LoginResponse (resposta a LOGIN_RESPONSE.Result)
| Valor | Nome |
|---|---|
| 0 | OK |
| 1 | INVALID_VERSION |
| 2 | INVALID_PASSWORD |
| 3 | INVALID_LICENSE_EXPIRED |
| 4 | INVALID_LICENSE_EXCEEDED_CLIENTS |
| 5 | DEMO_TIMEOUT |
| 6 | SINGLE_LOGIN |

### FleetDataType (DATAEX.DataType)
| Valor | Nome |
|---|---|
| 0 | UNKNOWN |
| 10 | DEVICES |
| 11 | USERS |
| 12 | GROUPS |
| 13 | STATUSES |
| 14 | PASSWORD |
| 15 | LOCATION_REQUESTS |
| 20 | QUERYAVATAR |
| 21 | AVATARRESPONSE |
| 22 | QUERYLOGO |
| 23 | LOGORESPONSE |
| 25 | MEDIA_CONTROL |
| 100 | NETWORKS |
| 110 | NETWORKSETTINGS |
| 120 | NEWNETWORKSETTINGS |
| 130 | SERVERSETTINGS |
| 255 | COMPOUND |

### DataOpType (DATAEX.OpType)
| Valor | Nome |
|---|---|
| 0 | INITIALIZE |
| 1 | ADD |
| 2 | REMOVE |
| 3 | CHANGE |

### PTT_REQUEST.Type (cliente → servidor, MessageID="PTT_REQUEST")
| Valor | Nome | Significado |
|---|---|---|
| 0 | VOICE_PRIVATE_PRESS | Iniciar chamada de voz privada |
| 1 | VOICE_PRIVATE_RELEASE | Encerrar chamada de voz privada |
| 2 | VOICE_GROUP_PRESS | Iniciar chamada de voz em grupo |
| 3 | VOICE_GROUP_RELEASE | Encerrar chamada de voz em grupo |
| 4 | VIDEO_PRIVATE_PRESS | Iniciar chamada de vídeo privada |
| 5 | VIDEO_PRIVATE_RELEASE | Encerrar chamada de vídeo privada |
| 6 | VIDEO_GROUP_PRESS | Iniciar chamada de vídeo em grupo |
| 7 | VIDEO_GROUP_RELEASE | Encerrar chamada de vídeo em grupo |

### PTT_RESPONSE.Response (cliente → servidor, MessageID="PTT_RESPONSE")
| Valor | Nome |
|---|---|
| 0 | OK |
| 1 | DECLINE_BUSY |
| 2 | DECLINE_UNKNOWN |

### PTT_CONTROL.Control (servidor → cliente, MessageID="PTT_CONTROL")
| Valor | Nome | Disparado quando |
|---|---|---|
| 0 | VOICE_PRIVATE_BEGIN | Servidor está abrindo canal privado de voz |
| 1 | VOICE_PRIVATE_PRESSED | Confirma que voz está aberta (cliente liga mic se isOurOwn) |
| 2 | VOICE_PRIVATE_RELEASED | Voz fechada do outro lado |
| 3 | VOICE_PRIVATE_END | Chamada terminou |
| 4 | VOICE_GROUP_BEGIN | Servidor abrindo canal de grupo |
| 5 | VOICE_GROUP_PRESSED | Voz de grupo aberta |
| 6 | VOICE_GROUP_RELEASED | Voz de grupo fechada |
| 7 | VOICE_GROUP_END | Chamada de grupo terminou |
| 9 | VOICE_PRIVATE_ENTER | Cliente entrou em canal privado pré-existente |
| 10 | VOICE_GROUP_ENTER | Cliente entrou em canal de grupo pré-existente |
| 11 | VIDEO_PRIVATE_BEGIN | (idem para vídeo) |
| 12 | VIDEO_PRIVATE_PRESSED | |
| 13 | VIDEO_PRIVATE_RELEASED | |
| 14 | VIDEO_PRIVATE_END | |
| 15 | VIDEO_GROUP_BEGIN | |
| 16 | VIDEO_GROUP_PRESSED | |
| 17 | VIDEO_GROUP_RELEASED | |
| 18 | VIDEO_GROUP_END | |
| 19 | VIDEO_PRIVATE_CONFIRM | |
| 20 | VIDEO_PRIVATE_ENTER | |
| 21 | VIDEO_GROUP_ENTER | |

### ConversationType
| Valor | Nome |
|---|---|
| 0 | PRIVATE |
| 1 | GROUP |

### JobType (STORAGE_JOB_REQUEST.JobType)
| Valor | Nome |
|---|---|
| 0 | TEXT |
| 1 | IMAGE |
| 4 | FILE |

### ContentType (STORAGE_JOB_CONTENT.ContentType)
| Valor | Nome |
|---|---|
| 0 | PREVIEW |
| 1 | DATA |

### StorageDataFlags (STORAGE_JOB_CONTENT.DataFlags — bitmask)
| Valor | Nome | Significado |
|---|---|---|
| 0 | NONE | Bloco intermediário |
| 1 | LASTBLOCK | Último bloco do job (servidor só publica a mensagem quando recebe um bloco com este bit) |

### JobState (STORAGE_JOB_STATE.JobState)
| Valor | Nome | Significado para UI |
|---|---|---|
| -10 | FAIL | erro/cancelado pelo servidor |
| 0 | NONE | inicial |
| 10 | SENDING | cliente enviando blocos |
| 30 | ACCEPTED_ON_SERVER | servidor recebeu (primeiro tick ✓) |
| 50 | ACCEPTED_BY_CLIENT | destinatário pegou (segundo tick ✓✓) |
| 60 | DELIVERED | aplica só para mensagens privadas — entregue |
| 80 | CANCELLED | cancelada |

---

## 3. SOS / Emergency — fato importante

**O cliente WPF oficial NÃO envia flag `Emergency` em `PTT_REQUEST`.**

A propriedade `Emergency` (Protocol.cs:22) pertence ao **`FleetGroup`** — é atributo do grupo, recebido via `DATAEX` com `DataType=12 (GROUPS)`. Cada grupo do servidor é configurado com:

```csharp
public int Priority;
public bool Emergency, Broadcast, AllCall;
```

**Implicação para o SOS do GroupATES:**
SOS = enviar `PTT_REQUEST.Type = 2 (VOICE_GROUP_PRESS)` direcionado para um grupo cuja propriedade `Emergency=true` no servidor.

O cliente precisa:
1. Filtrar `State.groups` pelos que têm `Emergency===true`.
2. Quando o botão SOS é pressionado, fazer `PTT_REQUEST` para o `GroupID` desse grupo de emergência (ou para o primeiro encontrado).
3. Se não houver grupo `Emergency=true` no DATAEX, mostrar erro "Nenhum grupo de emergência configurado no servidor" — não inventar fluxo paralelo.

**O atual `COMMAND_REQUEST Type=1` (index.html:1856) está errado** — é um comando custom que só repinta UI; não rota voz.

---

## 4. VOICE_PACKET — formato (RTPPacket.cs)

### Header RTP (12 bytes — pt=106 ALaw)

```
Byte 0:   0x80                              # Version=2 << 6 | Padding=0 | Extension=0 | CSRC count=0
Byte 1:   0x6A (= 106 decimal, ALaw)        # Marker=0 | PayloadType=106
Bytes 2-3: SequenceNumber                   # uint16 BE, incrementa +1 por frame
Bytes 4-7: Timestamp                        # uint32 BE, incrementa +480 por frame (samples)
Bytes 8-11: SSRC                            # uint32 BE, fixo na sessão (mesmo do DEVICE_CONFIG.Ssrc)
```

### Payload

- 480 bytes (= 480 samples ALaw @ 8000 Hz = **60 ms por frame**)
- Cada byte = 1 sample ALaw (de PCM 16-bit lei A G.711)

### Frame size do scriptProcessor

```
sampleRate base: 8000 Hz
frameSize: 480 samples
frame duration: 60 ms
```

### Envio

```json
{
  "MessageID": "VOICE_PACKET",
  "Data": "<base64 de [header RTP 12B || payload ALaw 480B]>"
}
```

Total = 12 + 480 = 492 bytes → base64 ≈ 656 chars.

---

## 5. STORAGE_JOB — fluxo completo (mensagens texto/imagem/arquivo)

### TX (cliente envia mensagem)

```
Passo 1: STORAGE_JOB_REQUEST       client → server
{
  "MessageID": "STORAGE_JOB_REQUEST",
  "JobID": "<base64 GUID novo>",
  "JobType": 0,                            // 0=TEXT, 1=IMAGE, 4=FILE
  "ConversationType": 0,                   // 0=PRIVATE, 1=GROUP
  "ToUserID": "<base64 GUID dest. ou ZERO_GUID se grupo>",
  "ToDeviceID": "<base64 GUID dest. ou ZERO_GUID se grupo>",
  "ToGroupID": "<base64 GUID grupo ou ZERO_GUID se privado>",
  "FileName": "msg.txt",                   // qualquer string
  "FileLen": <bytes totais do payload>
}

Passo 2: para cada bloco (até CONTENT_BLOCK bytes — tipicamente 4096):
STORAGE_JOB_CONTENT                client → server
{
  "MessageID": "STORAGE_JOB_CONTENT",
  "JobID": "<mesmo JobID>",
  "ContentType": 1,                        // 1=DATA, 0=PREVIEW (thumb de imagem)
  "DataFlags": 0,                          // 0=NONE no meio, 1=LASTBLOCK no último
  "Data": "<base64 do bloco>"
}

→ no último bloco: DataFlags = 1
```

### RX (cliente recebe mensagem)

```
Servidor envia:
1. STORAGE_JOB_REQUEST      // cabeçalho do job entrante
2. STORAGE_JOB_CONTENT      // um ou mais blocos; último com DataFlags=1

Cliente responde com STORAGE_JOB_STATE para sinalizar:
- Ao receber STORAGE_JOB_REQUEST → enviar STORAGE_JOB_STATE com JobState=50 (ACCEPTED_BY_CLIENT)
- Ao processar último bloco → enviar STORAGE_JOB_STATE com JobState=60 (DELIVERED)
```

### STORAGE_JOB_STATE — formato

```json
{
  "MessageID": "STORAGE_JOB_STATE",
  "JobID": "<id do job>",
  "JobSequence": <int>,
  "JobState": <int — enum JobState>,
  "Destination": "<base64 GUID — quem deve receber este state>"
}
```

### STORAGE_JOB_CONTENT_REQUEST — recuperar bloco perdido / sob demanda

```json
{
  "MessageID": "STORAGE_JOB_CONTENT_REQUEST",
  "JobID": "<id>",
  "ContentType": 1,
  "Offset": <byte offset>,
  "Length": <bytes a pedir>
}
```

Servidor responde com `STORAGE_JOB_CONTENT` correspondente.

---

## 6. GPS

### RX — Servidor envia posição

```json
GPS_RESULT_TO_CLIENT  server → client
{
  "MessageID": "GPS_RESULT_TO_CLIENT",
  "DeviceID": "<base64 GUID>",
  "Latitude": -23.5505,
  "Longitude": -46.6333,
  "Altitude": 760.0,
  "Speed": 0.0,
  "Course": 0.0,
  "Accuracy": 5.0,
  "UTCTime": <unix ms>
}
```

### TX — Cliente pede posição on-demand

```json
GPS_DEVICE_REQUEST  client → server
{
  "MessageID": "GPS_DEVICE_REQUEST",
  "DeviceID": "<base64 GUID alvo>",
  "Period": 30        // 0 = uma vez; >0 = stream periódico em segundos
}
```

### TX — Cliente cancela stream

```json
GPS_DEVICE_CANCEL  client → server
{
  "MessageID": "GPS_DEVICE_CANCEL",
  "DeviceID": "<base64 GUID alvo>"
}
```

### Servidor pede ao cliente sua posição

```json
GPS_SERVER_REQUEST  server → client
→ cliente responde:
GPS_RESULT_TO_SERVER  client → server
{
  "MessageID": "GPS_RESULT_TO_SERVER",
  "Latitude": ..., "Longitude": ..., "UTCTime": ...
}
```

---

## 7. Utilitários — Base64 de GUID

GUIDs no protocolo são sempre serializados como base64 dos 16 bytes raw.

```javascript
// ZERO_GUID (Guid.Empty) → 16 zeros → "AAAAAAAAAAAAAAAAAAAAAA=="
const ZERO_GUID_B64 = "AAAAAAAAAAAAAAAAAAAAAA==";

// Gerar GUID novo em base64:
function newGuidB64() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // v4 markers:
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return btoa(String.fromCharCode(...bytes));
}
```

---

## 8. Lacunas conhecidas neste doc

Itens não cobertos pela referência decompilada (descobrir empiricamente):

- **Formato exato do VIDEO_PACKET** — RTPPacket.cs aplica ao vídeo também, mas codec não está claro (provavelmente MJPEG dado o tamanho dos pacotes UDP em :40224; confirmar via packet capture).
- **COMMAND_REQUEST / COMMAND_CONFIRM** — não documentado no Protocol.cs decompilado; tratar como extensão da CDCTelecom. Não usar sem confirmar com Leonardo.
- **DEVICE_CONFIG.VoiceOverTcp** — wfclient.html usa `true` quando o cliente quer enviar voz pelo próprio WS (em vez de UDP). Não confirmado se obrigatório.

---

## 9. Mapeamento de arquivos do GroupATES

| Componente | Path no servidor |
|---|---|
| Cliente vanilla (iframe) | `/opt/groupatesiot/walkiefleet/static/index.html` |
| Relay Python (UDP↔WS) | `/opt/groupatesiot/walkiefleet/main.py` |
| Wrapper React | `/root/projeto/frontend/src/pages/WalkieFleet.tsx` |
| Bot backend (envia mensagens) | `/root/projeto/backend/src/lib/wf-client.ts` |
| WS interno backend (órfão) | `/root/projeto/backend/src/walkiefleet-ws.ts` |
| Dispatch automático | `/root/projeto/backend/src/routes/index.ts` (função `dispatchEventAsync`) |
| Migrações DB | `008_cameras_walkiefleet.sql`, `014_walkiefleet_ptt.sql`, `019_dispatcher.sql` |

Container do relay: `groupates_walkiefleet`, porta interna `8070`, exposto via nginx em `/wf-dispatch/`.
Relay externo CDCTelecom (servidor WF real): porta `10031` (não confundir com `9999` desktop ou `40185` mobile).

---

**Última atualização:** $(date -u +"%Y-%m-%d %H:%M UTC") — gerado pelo Prompt 22.
