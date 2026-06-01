-- Câmeras públicas SP — ADENDO 2 (Prompt 30): todas as fontes MobileJet,
-- classificadas individualmente em jpeg/video/unavailable. Aditivo sobre a 037.
-- 037 já rodou em produção; estende-se o schema/seed aqui (mesma tabela).
ALTER TABLE public_cameras
  ADD COLUMN IF NOT EXISTS stream_type     TEXT NOT NULL DEFAULT 'jpeg',
  ADD COLUMN IF NOT EXISTS refresh_seconds INT,
  ADD COLUMN IF NOT EXISTS video_url       TEXT,
  ADD COLUMN IF NOT EXISTS video_kind      TEXT,
  ADD COLUMN IF NOT EXISTS approx_location BOOLEAN DEFAULT FALSE;

-- video/unavailable não têm snapshot_url
ALTER TABLE public_cameras ALTER COLUMN snapshot_url DROP NOT NULL;

-- chave natural por nome p/ seed idempotente
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='public_cameras_name_key') THEN
    ALTER TABLE public_cameras ADD CONSTRAINT public_cameras_name_key UNIQUE (name);
  END IF;
END $$;

-- CET (linhas da 037): confirmam-se como jpeg + refresh real medido
UPDATE public_cameras
   SET stream_type='jpeg', refresh_seconds=2
 WHERE snapshot_url LIKE 'https://cameras.cetsp.com.br/%';

-- Novas: vídeo (camerite/assis=iframe, youtube, hls) + indisponíveis (active=false)
INSERT INTO public_cameras
  (name, municipality, lat, lng, stream_type, video_kind, video_url, active, approx_location, refresh_seconds)
VALUES
  ('Guarulhos — Camerite 592674', 'Guarulhos', -23.4508, -46.5337, 'video', 'iframe', 'https://ddss-monitoramento.camerite.com/embed/592674/undefined/undefined/c1327?autoplay=true&sound=true', TRUE, TRUE, NULL),
  ('Guarulhos — Camerite 594901', 'Guarulhos', -23.45719, -46.530813, 'video', 'iframe', 'https://ddss-monitoramento.camerite.com/embed/594901/undefined/undefined/c1380?autoplay=true&sound=true', TRUE, TRUE, NULL),
  ('Guarulhos — Camerite 595069', 'Guarulhos', -23.453922, -46.538413, 'video', 'iframe', 'https://ddss-monitoramento.camerite.com/embed/595069/undefined/undefined/c1031?autoplay=true&sound=true', TRUE, TRUE, NULL),
  ('Guarulhos — Camerite 733461', 'Guarulhos', -23.451402, -46.529584, 'video', 'iframe', 'https://ddss-monitoramento.camerite.com/embed/733461/undefined/undefined/c1281-favos?autoplay=true&sound=true', TRUE, TRUE, NULL),
  ('Guarulhos — Camerite 733817', 'Guarulhos', -23.459401, -46.534681, 'video', 'iframe', 'https://ddss-monitoramento.camerite.com/embed/733817/undefined/undefined/c1155?autoplay=true&sound=true', TRUE, TRUE, NULL),
  ('Guarulhos — Camerite 824944', 'Guarulhos', -23.449577, -46.53698, 'video', 'iframe', 'https://ddss-monitoramento.camerite.com/embed/824944/undefined/undefined/c1451?autoplay=true&sound=true', TRUE, TRUE, NULL),
  ('Guarulhos — YouTube h_yJm6r6P8Y', 'Guarulhos', -23.455858, -46.527361, 'video', 'youtube', 'https://www.youtube.com/embed/h_yJm6r6P8Y', TRUE, TRUE, NULL),
  ('Guarulhos — YouTube mWuQ0MGhgwU', 'Guarulhos', -23.457274, -46.539927, 'video', 'youtube', 'https://www.youtube.com/embed/mWuQ0MGhgwU', TRUE, TRUE, NULL),
  ('Campos do Jordão — SP046-KM167', 'Campos do Jordão', -22.7357, -45.5912, 'video', 'hls', 'https://34.104.32.249.nip.io/SP046-KM167/stream.m3u8', TRUE, TRUE, NULL),
  ('Campos do Jordão — SP123-KM033A', 'Campos do Jordão', -22.74209, -45.588328, 'video', 'hls', 'https://34.104.32.249.nip.io/SP123-KM033A/stream.m3u8', TRUE, TRUE, NULL),
  ('Campos do Jordão — SP123-KM033B', 'Campos do Jordão', -22.738822, -45.595888, 'video', 'hls', 'https://34.104.32.249.nip.io/SP123-KM033B/stream.m3u8', TRUE, TRUE, NULL),
  ('Campos do Jordão — SP123-KM046', 'Campos do Jordão', -22.736302, -45.587105, 'video', 'hls', 'https://34.104.32.249.nip.io/SP123-KM046/stream.m3u8', TRUE, TRUE, NULL),
  ('Assis — Câmera 104', 'Assis', -22.6584, -50.4119, 'video', 'iframe', 'https://www.ccoassis.tec.br:8083/publicLive/104/substream', TRUE, TRUE, NULL),
  ('Assis — Câmera 118', 'Assis', -22.66479, -50.40903, 'video', 'iframe', 'https://www.ccoassis.tec.br:8083/publicLive/118/substream', TRUE, TRUE, NULL),
  ('Assis — Câmera 122', 'Assis', -22.661522, -50.416585, 'video', 'iframe', 'https://www.ccoassis.tec.br:8083/publicLive/122/substream', TRUE, TRUE, NULL),
  ('Assis — Câmera 130', 'Assis', -22.659002, -50.407808, 'video', 'iframe', 'https://www.ccoassis.tec.br:8083/publicLive/130/substream', TRUE, TRUE, NULL),
  ('Assis — Câmera 136', 'Assis', -22.667001, -50.412875, 'video', 'iframe', 'https://www.ccoassis.tec.br:8083/publicLive/136/substream', TRUE, TRUE, NULL),
  ('Assis — Câmera 138', 'Assis', -22.657177, -50.415161, 'video', 'iframe', 'https://www.ccoassis.tec.br:8083/publicLive/138/substream', TRUE, TRUE, NULL),
  ('Assis — Câmera 142', 'Assis', -22.663458, -50.405599, 'video', 'iframe', 'https://www.ccoassis.tec.br:8083/publicLive/142/substream', TRUE, TRUE, NULL),
  ('Assis — Câmera 208', 'Assis', -22.664874, -50.41809, 'video', 'iframe', 'https://www.ccoassis.tec.br:8083/publicLive/208/substream', TRUE, TRUE, NULL),
  ('Assis — Câmera 224', 'Assis', -22.655454, -50.409357, 'video', 'iframe', 'https://www.ccoassis.tec.br:8083/publicLive/224/substream', TRUE, TRUE, NULL),
  ('Assis — Câmera 236', 'Assis', -22.668626, -50.408881, 'video', 'iframe', 'https://www.ccoassis.tec.br:8083/publicLive/236/substream', TRUE, TRUE, NULL),
  ('Assis — Câmera 736', 'Assis', -22.658646, -50.419462, 'video', 'iframe', 'https://www.ccoassis.tec.br:8083/publicLive/736/substream', TRUE, TRUE, NULL),
  ('Santo André — portal (YT canal, sem embed)', 'Santo André', -23.670626, -46.535258, 'unavailable', NULL, NULL, FALSE, TRUE, NULL),
  ('Barueri — portal (sem mídia extraível)', 'Barueri', -23.507346, -46.88371, 'unavailable', NULL, NULL, FALSE, TRUE, NULL),
  ('São Caetano do Sul — portal (X-Frame DENY)', 'São Caetano do Sul', -23.620458, -46.546248, 'unavailable', NULL, NULL, FALSE, TRUE, NULL),
  ('CET São Paulo II — agregador transitoaovivo (ToS)', 'São Paulo', -23.557896, -46.637958, 'unavailable', NULL, NULL, FALSE, TRUE, NULL),
  ('Taboão da Serra — duplica portal CET-SP', 'Taboão da Serra', -23.619852, -46.793717, 'unavailable', NULL, NULL, FALSE, TRUE, NULL),
  ('CAM Diversas — diretório de links (fora do escopo SP)', 'São Paulo', -23.55588, -46.624918, 'unavailable', NULL, NULL, FALSE, TRUE, NULL)
ON CONFLICT (name) DO NOTHING;
