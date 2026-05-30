-- 030: colunas de anexo + expansão do CHECK de message_type (Prompt 30)
ALTER TABLE walkiefleet_messages
  ADD COLUMN IF NOT EXISTS attachment_mime     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS attachment_size     BIGINT,
  ADD COLUMN IF NOT EXISTS attachment_filename VARCHAR(500);

-- Expande o CHECK para incluir os tipos de comando (Bloco A) e de anexo (este prompt).
ALTER TABLE walkiefleet_messages DROP CONSTRAINT IF EXISTS walkiefleet_messages_message_type_check;
ALTER TABLE walkiefleet_messages
  ADD CONSTRAINT walkiefleet_messages_message_type_check
  CHECK (message_type IN ('voice','text','sos','broadcast','location','call-alert','radio-check','image','file'));
