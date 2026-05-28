# WalkieFleet Bot — Roteiro de ativação

**STATUS ATUAL:** desligado. Aguarda criação do usuário `BOT_DISPATCH` por Leonardo (CDCTelecom).

## Pré-requisitos

- Usuário `BOT_DISPATCH` criado no servidor WF real (porta 10031 do relay CDCTelecom).
- Senha do bot recebida via canal seguro (não Slack/WhatsApp).
- Grupo "GRUPO 1" tem o BOT_DISPATCH como membro, para receber as mensagens.

## Procedimento de ativação

1. Editar `/root/projeto/.env`:

   ```
   WF_BOT_ENABLED=true
   WF_BOT_LOGIN=BOT_DISPATCH
   WF_BOT_PASSWORD=<senha real>
   ```

2. Restart do backend (sem rebuild — só lê .env):

   ```
   cd /root/projeto && docker compose up -d backend
   docker logs iot_backend --tail 30 | grep -iE "wf|walkie|bot"
   ```

3. Confirmar conexão bem-sucedida:
   - Esperado: `[wf-client] login OK, deviceId=<base64>`
   - **NÃO** esperado: `INVALID_PASSWORD` (LoginResponse=2) ou `SINGLE_LOGIN` (LoginResponse=6).

4. Smoke test do dispatch automático (Prompt 25):

   ```
   curl -X POST http://localhost:8080/wf/send-test-message \
     -H "Content-Type: application/json" \
     -d '{"toUserId":"<USER1 deviceId>","text":"teste bot"}'
   ```

   USER1 deve receber a mensagem privada.

## Procedimento de desativação (rollback)

Se o bot causar problemas (loops, mensagens duplicadas, conflito com operador):

```
sed -i 's/WF_BOT_ENABLED=true/WF_BOT_ENABLED=false/' /root/projeto/.env
cd /root/projeto && docker compose up -d backend
```

## Como NÃO ativar

- NUNCA setar `WF_BOT_LOGIN=USER1` — USER1 é o operador humano. Conflito de single-login (LoginResponse=6).
- NUNCA hardcodar a senha no `docker-compose.yml` — usar `.env`.
- Não ativar em produção sem antes testar em janela curta com operador deslogado.
