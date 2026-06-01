-- Prompt 31 (FASE B): precisão honesta da posição de cada câmera pública.
-- Aditivo. ZERO coordenada inventada.
--
-- FASE A concluída: o app público da CET (View/Cam.aspx, array gCams + barraLista)
-- NÃO expõe lat/lng em lugar nenhum — só o nome do cruzamento — e só nomeia as 11
-- favoritas. Não há página de mapa/feed/.kml/.ashx com coordenada. Logo:
--   * 11 favoritas  -> já geocodadas (Nominatim/OSM) a partir do cruzamento real (mig. 037)
--   * 194 genéricas -> SEM fonte de posição: ficam no centro de SP, marcadas aproximadas
-- Cobertura de geocoding NOVO = 0 (o feed não devolve nome p/ as 194).

ALTER TABLE public_cameras ADD COLUMN IF NOT EXISTS location_precision TEXT DEFAULT 'municipality_center';
  -- 'cet_dataset' (coord do feed CET) | 'geocoded' (coord via geocoder) | 'municipality_center' (sem fonte, centro)
ALTER TABLE public_cameras ADD COLUMN IF NOT EXISTS geocode_source TEXT;
ALTER TABLE public_cameras ADD COLUMN IF NOT EXISTS address TEXT;

-- 11 favoritas CET: coord real obtida por geocoding do cruzamento (não é dado do feed).
-- Discriminador robusto = NÃO estar no centro de SP. Não sobrescreve nada melhor.
UPDATE public_cameras
   SET location_precision = 'geocoded',
       geocode_source     = COALESCE(geocode_source, 'nominatim'),
       address            = COALESCE(address, name)
 WHERE snapshot_url LIKE '%cetsp%'
   AND NOT (lat = -23.5505 AND lng = -46.6333);

-- 194 genéricas no centro: permanecem aproximadas (idempotente; reforça o DEFAULT).
UPDATE public_cameras
   SET location_precision = 'municipality_center'
 WHERE snapshot_url LIKE '%cetsp%'
   AND lat = -23.5505 AND lng = -46.6333;
