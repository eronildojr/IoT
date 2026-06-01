-- Câmeras públicas de SP no /mapa (Prompt 30) — camada ADITIVA.
-- Escopo travado nesta fase: somente CET (cameras.cetsp.com.br), única fonte
-- que é JPEG real (~2s). Catálogo extraído do app oficial da CET (array gCams);
-- coordenadas geocodificadas (OSM/Nominatim) a partir dos cruzamentos reais.
CREATE TABLE IF NOT EXISTS public_cameras (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  municipality  TEXT NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  snapshot_url  TEXT NOT NULL UNIQUE,
  requires_referer BOOLEAN DEFAULT FALSE,
  referer       TEXT,
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Seed CET — pasta(id) -> https://cameras.cetsp.com.br/Cams/<pasta>/1.jpg
-- (HTTPS, image/jpeg, sem hotlink/Referer). ON CONFLICT torna o seed re-aplicável.
INSERT INTO public_cameras (name, municipality, lat, lng, snapshot_url, requires_referer, active) VALUES
 ('Ascendino Reis × R Pedro de Toledo',        'São Paulo', -23.5950586, -46.6503662, 'https://cameras.cetsp.com.br/Cams/225/1.jpg', FALSE, TRUE),
 ('Brasil × Av Brig Luís Antônio',             'São Paulo', -23.5657001, -46.6760945, 'https://cameras.cetsp.com.br/Cams/184/1.jpg', FALSE, TRUE),
 ('Brasil × Av Henrique Schaumann',            'São Paulo', -23.5640176, -46.6774869, 'https://cameras.cetsp.com.br/Cams/195/1.jpg', FALSE, TRUE),
 ('Brig Luís Antônio × Al Santos',             'São Paulo', -23.5712859, -46.6464533, 'https://cameras.cetsp.com.br/Cams/210/1.jpg', FALSE, TRUE),
 ('Cidade Jardim × Av Nove de Julho',          'São Paulo', -23.5806903, -46.6839910, 'https://cameras.cetsp.com.br/Cams/220/1.jpg', FALSE, TRUE),
 ('Hélio Pellegrino × R Diogo Jácome',         'São Paulo', -23.5974768, -46.6785005, 'https://cameras.cetsp.com.br/Cams/222/1.jpg', FALSE, TRUE),
 ('Ibirapuera × R Ipê',                         'São Paulo', -23.6055559, -46.6641629, 'https://cameras.cetsp.com.br/Cams/224/1.jpg', FALSE, TRUE),
 ('Iguatemi × Av Brig Faria Lima',             'São Paulo', -23.5830605, -46.6831625, 'https://cameras.cetsp.com.br/Cams/200/1.jpg', FALSE, TRUE),
 ('Paulista × Av Brigadeiro Luiz Antônio',     'São Paulo', -23.5681660, -46.6493369, 'https://cameras.cetsp.com.br/Cams/23/1.jpg',  FALSE, TRUE),
 ('Consolação × R Caio Prado',                  'São Paulo', -23.5492278, -46.6485497, 'https://cameras.cetsp.com.br/Cams/180/1.jpg', FALSE, FALSE),
 ('Paulista × Metrô Consolação (R Augusta)',   'São Paulo', -23.5565983, -46.6586077, 'https://cameras.cetsp.com.br/Cams/22/1.jpg',  FALSE, FALSE)
ON CONFLICT (snapshot_url) DO NOTHING;
