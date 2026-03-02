-- ============================================================
-- MIGRAÇÃO 003: Biblioteca massiva de dispositivos IoT reais
-- + Campos de conexão IP:Porta por dispositivo
-- ============================================================

-- Adicionar campos de conexão na tabela de dispositivos cadastrados
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS connection_host VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS connection_port INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS connection_protocol VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS connection_path VARCHAR(255) DEFAULT '/',
  ADD COLUMN IF NOT EXISTS connection_status VARCHAR(20) DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS connection_last_check TIMESTAMP DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS connection_config JSONB DEFAULT '{}';

-- Adicionar campos extras na tabela device_models para biblioteca rica
ALTER TABLE device_models
  ADD COLUMN IF NOT EXISTS brand VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS model_number VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_port INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_host_pattern VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS communication_type VARCHAR(50) DEFAULT 'push',
  ADD COLUMN IF NOT EXISTS data_sheet_url VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS config_template JSONB DEFAULT '{}';

-- Limpar biblioteca antiga e reinserir completa
TRUNCATE TABLE device_models RESTART IDENTITY CASCADE;

-- ============================================================
-- CATEGORIA 1: SENSORES DE TEMPERATURA E UMIDADE
-- ============================================================
INSERT INTO device_models (name, category, protocol, data_types, description, brand, model_number, default_port, communication_type, tags, config_template) VALUES

('SHT31 Sensor de Temperatura/Umidade', 'Temperatura e Umidade', 'MQTT', ARRAY['temperature','humidity'], 'Sensor digital de alta precisão ±0.3°C, interface I2C', 'Sensirion', 'SHT31', 1883, 'push', ARRAY['temperatura','umidade','i2c','indoor'], '{"topic": "sensors/{device_id}/data", "qos": 1}'),

('SHT40 Sensor Premium T/H', 'Temperatura e Umidade', 'MQTT', ARRAY['temperature','humidity'], 'Sensor de alta precisão ±0.2°C com proteção IP67', 'Sensirion', 'SHT40', 1883, 'push', ARRAY['temperatura','umidade','ip67','industrial'], '{"topic": "sensors/{device_id}/data", "qos": 1}'),

('AM2301 DHT21 Sensor T/H', 'Temperatura e Umidade', 'MQTT', ARRAY['temperature','humidity'], 'Sensor digital com fio, range -40°C a +80°C, IP67', 'Aosong', 'AM2301', 1883, 'push', ARRAY['temperatura','umidade','externo'], '{"topic": "iot/{device_id}/telemetry"}'),

('DS18B20 Sensor Temperatura', 'Temperatura e Umidade', 'MQTT', ARRAY['temperature'], 'Sensor 1-Wire à prova d''água, precisão ±0.5°C', 'Maxim Integrated', 'DS18B20', 1883, 'push', ARRAY['temperatura','1-wire','liquido','externo'], '{"topic": "temp/{device_id}"}'),

('Milesight EM300-TH', 'Temperatura e Umidade', 'LoRaWAN', ARRAY['temperature','humidity'], 'Sensor LoRaWAN industrial IP67, bateria 3 anos', 'Milesight', 'EM300-TH', 1700, 'push', ARRAY['lorawan','industrial','bateria','ip67'], '{"app_eui": "", "dev_eui": "", "app_key": ""}'),

('Dragino LHT65 LoRa T/H', 'Temperatura e Umidade', 'LoRaWAN', ARRAY['temperature','humidity'], 'Sensor LoRaWAN com sonda externa, bateria 10 anos', 'Dragino', 'LHT65', 1700, 'push', ARRAY['lorawan','bateria','sonda','outdoor'], '{"app_eui": "", "dev_eui": ""}'),

('RAK1901 Sensor T/H WisBlock', 'Temperatura e Umidade', 'LoRaWAN', ARRAY['temperature','humidity'], 'Módulo WisBlock SHTC3, precisão ±2% RH', 'RAK Wireless', 'RAK1901', 1700, 'push', ARRAY['lorawan','wisblock','modular'], '{}'),

('Bosch BME280 T/H/Pressão', 'Temperatura e Umidade', 'MQTT', ARRAY['temperature','humidity','pressure'], 'Sensor ambiental 3 em 1: T/H/Pressão, I2C/SPI', 'Bosch Sensortec', 'BME280', 1883, 'push', ARRAY['temperatura','umidade','pressao','i2c'], '{"topic": "environment/{device_id}"}'),

('Honeywell HIH8000 Série', 'Temperatura e Umidade', 'HTTP', ARRAY['temperature','humidity'], 'Sensor industrial com saída digital I2C e analógica', 'Honeywell', 'HIH8000', 80, 'poll', ARRAY['temperatura','umidade','industrial','honeywell'], '{"endpoint": "/api/sensor/data", "interval": 60}'),

('Vaisala HMT310 Transmissor', 'Temperatura e Umidade', 'Modbus RTU', ARRAY['temperature','humidity'], 'Transmissor industrial de alta precisão ±1% RH', 'Vaisala', 'HMT310', 502, 'poll', ARRAY['temperatura','umidade','modbus','industrial'], '{"register": 1, "slave_id": 1}'),

('AEOTEC Multisensor 7', 'Temperatura e Umidade', 'Z-Wave', ARRAY['temperature','humidity','motion','light','uv'], 'Sensor 6 em 1 para automação residencial', 'Aeotec', 'ZWA024', 4123, 'push', ARRAY['z-wave','residencial','multisensor'], '{}'),

('Shelly H&T Gen3', 'Temperatura e Umidade', 'Wi-Fi/MQTT', ARRAY['temperature','humidity'], 'Sensor Wi-Fi compacto com bateria, API REST', 'Shelly', 'SNSN-0013A', 1883, 'push', ARRAY['wifi','mqtt','residencial','bateria'], '{"topic": "shellies/{device_id}/sensor"}'),

('Govee H5179 Sensor T/H', 'Temperatura e Umidade', 'Bluetooth/Wi-Fi', ARRAY['temperature','humidity'], 'Sensor com display, app móvel e alertas', 'Govee', 'H5179', 8080, 'push', ARRAY['bluetooth','wifi','display','residencial'], '{}'),

('Inkbird IBS-TH2 Plus', 'Temperatura e Umidade', 'Bluetooth', ARRAY['temperature','humidity'], 'Sensor Bluetooth com sonda externa, app iOS/Android', 'Inkbird', 'IBS-TH2 Plus', 0, 'push', ARRAY['bluetooth','sonda','residencial'], '{}'),

('Advantech WISE-4012E', 'Temperatura e Umidade', 'Wi-Fi/MQTT', ARRAY['temperature','humidity','analog_in'], 'Módulo I/O industrial Wi-Fi 4 entradas analógicas', 'Advantech', 'WISE-4012E', 1883, 'poll', ARRAY['wifi','industrial','analog','advantech'], '{"ip": "", "port": 9900}');

-- ============================================================
-- CATEGORIA 2: RASTREADORES GPS
-- ============================================================
INSERT INTO device_models (name, category, protocol, data_types, description, brand, model_number, default_port, communication_type, tags, config_template) VALUES

('Teltonika FMB920 Rastreador', 'Rastreadores GPS', 'TCP/MQTT', ARRAY['gps_location','speed','ignition','fuel'], 'Rastreador veicular compacto 2G, I/O digital e analógico', 'Teltonika', 'FMB920', 5027, 'push', ARRAY['gps','veicular','2g','teltonika'], '{"server_ip": "", "server_port": 5027, "protocol": "teltonika"}'),

('Teltonika FMB140 Rastreador', 'Rastreadores GPS', 'TCP', ARRAY['gps_location','speed','ignition','fuel','can_bus'], 'Rastreador 4G com leitura CAN Bus, RS232/RS485', 'Teltonika', 'FMB140', 5027, 'push', ARRAY['gps','veicular','4g','canbus'], '{"server_ip": "", "server_port": 5027}'),

('Teltonika FMC130 4G', 'Rastreadores GPS', 'TCP', ARRAY['gps_location','speed','ignition','temperature'], 'Rastreador 4G com Bluetooth, sensor de temperatura externo', 'Teltonika', 'FMC130', 5027, 'push', ARRAY['gps','4g','bluetooth','temperatura'], '{"server_ip": "", "server_port": 5027}'),

('Queclink GV300W', 'Rastreadores GPS', 'TCP/UDP', ARRAY['gps_location','speed','ignition','fuel'], 'Rastreador veicular 4G LTE com Wi-Fi, CAN Bus', 'Queclink', 'GV300W', 5093, 'push', ARRAY['gps','4g','wifi','canbus'], '{"server_ip": "", "server_port": 5093}'),

('Coban GPS303G', 'Rastreadores GPS', 'TCP/SMS', ARRAY['gps_location','speed','ignition'], 'Rastreador compacto 3G com corte de motor', 'Coban', 'GPS303G', 5013, 'push', ARRAY['gps','3g','corte-motor','economico'], '{"server_ip": "", "server_port": 5013}'),

('Suntech ST4340', 'Rastreadores GPS', 'TCP', ARRAY['gps_location','speed','ignition','fuel','temperature'], 'Rastreador 4G com múltiplas entradas, certificado ANATEL', 'Suntech', 'ST4340', 5100, 'push', ARRAY['gps','4g','anatel','brasil'], '{"server_ip": "", "server_port": 5100}'),

('Meitrack T366G', 'Rastreadores GPS', 'TCP/UDP', ARRAY['gps_location','speed','ignition','fuel'], 'Rastreador 4G com câmera integrada opcional', 'Meitrack', 'T366G', 8800, 'push', ARRAY['gps','4g','camera'], '{"server_ip": "", "server_port": 8800}'),

('Ruptela FM-Eco4+', 'Rastreadores GPS', 'TCP', ARRAY['gps_location','speed','ignition','fuel','can_bus'], 'Rastreador 4G com leitura CAN Bus avançada', 'Ruptela', 'FM-Eco4+', 7700, 'push', ARRAY['gps','4g','canbus','ruptela'], '{"server_ip": "", "server_port": 7700}'),

('Concox GT06N', 'Rastreadores GPS', 'TCP', ARRAY['gps_location','speed','ignition'], 'Rastreador veicular econômico 2G, corte de motor', 'Concox', 'GT06N', 5023, 'push', ARRAY['gps','2g','economico','corte-motor'], '{"server_ip": "", "server_port": 5023}'),

('Jointech JT701', 'Rastreadores GPS', 'TCP', ARRAY['gps_location','temperature','humidity','door'], 'Rastreador para contêineres refrigerados com T/H', 'Jointech', 'JT701', 8888, 'push', ARRAY['gps','container','temperatura','logistica'], '{"server_ip": "", "server_port": 8888}'),

('Tramigo T22', 'Rastreadores GPS', 'TCP/SMS', ARRAY['gps_location','speed','ignition'], 'Rastreador pessoal/veicular 2G com SMS', 'Tramigo', 'T22', 5000, 'push', ARRAY['gps','pessoal','2g','sms'], '{}'),

('CalAmp LMU-3030', 'Rastreadores GPS', 'TCP', ARRAY['gps_location','speed','ignition','fuel'], 'Rastreador 4G para frotas, certificado FCC', 'CalAmp', 'LMU-3030', 5000, 'push', ARRAY['gps','4g','frotas','calamp'], '{}'),

('Enfora MT-GL6110', 'Rastreadores GPS', 'TCP', ARRAY['gps_location','speed','ignition'], 'Rastreador 4G LTE Cat-M1/NB-IoT', 'Enfora', 'MT-GL6110', 5000, 'push', ARRAY['gps','lte','nb-iot','cat-m1'], '{}');

-- ============================================================
-- CATEGORIA 3: BOTÕES DE PÂNICO E EMERGÊNCIA
-- ============================================================
INSERT INTO device_models (name, category, protocol, data_types, description, brand, model_number, default_port, communication_type, tags, config_template) VALUES

('Teltonika TMT250 Pessoal', 'Botões de Pânico', 'TCP/MQTT', ARRAY['gps_location','panic_button','fall_detection'], 'Rastreador pessoal 4G com botão SOS e detecção de queda', 'Teltonika', 'TMT250', 5027, 'push', ARRAY['panico','pessoal','sos','queda','4g'], '{"server_ip": "", "server_port": 5027}'),

('Milesight UC300 Botão SOS', 'Botões de Pânico', 'LoRaWAN', ARRAY['panic_button','gps_location'], 'Botão de pânico LoRaWAN com GPS, IP67, bateria 3 anos', 'Milesight', 'UC300', 1700, 'push', ARRAY['panico','lorawan','gps','ip67'], '{"app_eui": "", "dev_eui": ""}'),

('RAK7201 Botão WisNode', 'Botões de Pânico', 'LoRaWAN', ARRAY['panic_button'], 'Botão LoRaWAN de 4 teclas programáveis', 'RAK Wireless', 'RAK7201', 1700, 'push', ARRAY['panico','lorawan','multiplo'], '{}'),

('Dragino LGT-92 Rastreador Pessoal', 'Botões de Pânico', 'LoRaWAN', ARRAY['gps_location','panic_button','battery'], 'Rastreador pessoal LoRaWAN com botão SOS', 'Dragino', 'LGT-92', 1700, 'push', ARRAY['panico','lorawan','pessoal','gps'], '{}'),

('Shelly Button1', 'Botões de Pânico', 'Wi-Fi/MQTT', ARRAY['button_press'], 'Botão Wi-Fi programável, 4 tipos de ação', 'Shelly', 'SHBTN-1', 1883, 'push', ARRAY['botao','wifi','mqtt','residencial'], '{"topic": "shellies/{device_id}/input"}'),

('Sonoff SNZB-01 Zigbee', 'Botões de Pânico', 'Zigbee', ARRAY['button_press'], 'Botão sem fio Zigbee, compatível com Zigbee2MQTT', 'Sonoff', 'SNZB-01', 1883, 'push', ARRAY['botao','zigbee','residencial'], '{"topic": "zigbee2mqtt/{device_id}"}'),

('Aqara Wireless Mini Switch', 'Botões de Pânico', 'Zigbee', ARRAY['button_press'], 'Botão Zigbee compacto, simples/duplo/longo clique', 'Aqara', 'WXKG11LM', 1883, 'push', ARRAY['botao','zigbee','aqara','residencial'], '{}'),

('TEKTELIC KONA Micro', 'Botões de Pânico', 'LoRaWAN', ARRAY['panic_button','temperature'], 'Botão de emergência LoRaWAN industrial', 'TEKTELIC', 'T0006066', 1700, 'push', ARRAY['panico','lorawan','industrial'], '{}');

-- ============================================================
-- CATEGORIA 4: SENSORES DE MOVIMENTO E PRESENÇA
-- ============================================================
INSERT INTO device_models (name, category, protocol, data_types, description, brand, model_number, default_port, communication_type, tags, config_template) VALUES

('Milesight VS121 Sensor Visão', 'Sensores de Movimento', 'MQTT/HTTP', ARRAY['occupancy','people_count','zone_activity'], 'Sensor de presença por visão computacional, contagem de pessoas', 'Milesight', 'VS121', 1883, 'push', ARRAY['presenca','visao','contagem','ia'], '{"topic": "vs121/{device_id}/data"}'),

('Milesight EM500-PIR', 'Sensores de Movimento', 'LoRaWAN', ARRAY['motion','temperature'], 'Sensor PIR LoRaWAN industrial IP67, alcance 12m', 'Milesight', 'EM500-PIR', 1700, 'push', ARRAY['pir','lorawan','industrial','ip67'], '{}'),

('Dragino LDDS75 Sensor Distância', 'Sensores de Movimento', 'LoRaWAN', ARRAY['distance','motion'], 'Sensor de distância ultrassônico LoRaWAN, 0.2-7.5m', 'Dragino', 'LDDS75', 1700, 'push', ARRAY['distancia','lorawan','ultrasonico'], '{}'),

('SICK TiM571 LiDAR', 'Sensores de Movimento', 'Ethernet/TCP', ARRAY['distance','object_detection','area_scan'], 'Scanner LiDAR 2D industrial, 270° cobertura, 25m', 'SICK', 'TiM571', 2111, 'push', ARRAY['lidar','industrial','seguranca','sick'], '{"ip": "", "port": 2111}'),

('Pepperl+Fuchs R2000 LiDAR', 'Sensores de Movimento', 'Ethernet', ARRAY['distance','object_detection'], 'Sensor LiDAR 360° para AGV e robótica', 'Pepperl+Fuchs', 'R2000', 3000, 'poll', ARRAY['lidar','agv','robotica','industrial'], '{}'),

('Bosch BMI270 IMU', 'Sensores de Movimento', 'MQTT', ARRAY['acceleration','gyroscope','orientation'], 'IMU 6 eixos para wearables e IoT industrial', 'Bosch Sensortec', 'BMI270', 1883, 'push', ARRAY['imu','acelerometro','giroscopio','wearable'], '{}'),

('Honeywell IS3035 PIR', 'Sensores de Movimento', 'TCP/IP', ARRAY['motion','tamper'], 'Detector PIR de longo alcance 35m para segurança', 'Honeywell', 'IS3035', 80, 'push', ARRAY['pir','seguranca','alarme','honeywell'], '{}'),

('Aqara Motion Sensor P1', 'Sensores de Movimento', 'Zigbee', ARRAY['motion','illuminance'], 'Sensor de movimento Zigbee com sensor de luz', 'Aqara', 'MS-S02', 1883, 'push', ARRAY['pir','zigbee','luz','residencial'], '{"topic": "zigbee2mqtt/{device_id}"}'),

('Philips Hue Motion Sensor', 'Sensores de Movimento', 'Zigbee', ARRAY['motion','temperature','illuminance'], 'Sensor de movimento para automação residencial', 'Philips', 'SML001', 80, 'push', ARRAY['pir','zigbee','residencial','hue'], '{"bridge_ip": "", "api_key": ""}'),

('Omron D6T Sensor Térmico', 'Sensores de Movimento', 'I2C/UART', ARRAY['thermal_array','occupancy'], 'Sensor de presença por infravermelho MEMS 8x8 pixels', 'Omron', 'D6T-8L-09', 1883, 'push', ARRAY['termico','presenca','mems','industrial'], '{}');

-- ============================================================
-- CATEGORIA 5: GATEWAYS IoT
-- ============================================================
INSERT INTO device_models (name, category, protocol, data_types, description, brand, model_number, default_port, communication_type, tags, config_template) VALUES

('Dragino LPS8N Gateway LoRa', 'Gateways IoT', 'LoRaWAN/MQTT', ARRAY['gateway_status','connected_devices'], 'Gateway LoRaWAN 8 canais, Ethernet+Wi-Fi, indoor', 'Dragino', 'LPS8N', 1700, 'push', ARRAY['gateway','lorawan','8-canais','indoor'], '{"server": "router.eu.thethings.network", "port": 1700}'),

('RAK7268 WisGate Edge Lite 2', 'Gateways IoT', 'LoRaWAN/MQTT', ARRAY['gateway_status','connected_devices'], 'Gateway LoRaWAN 8 canais, LTE opcional, IP30', 'RAK Wireless', 'RAK7268', 1700, 'push', ARRAY['gateway','lorawan','lte','ip30'], '{}'),

('Milesight UG65 Gateway', 'Gateways IoT', 'LoRaWAN/MQTT', ARRAY['gateway_status','connected_devices'], 'Gateway LoRaWAN industrial IP67, 8 canais, LTE', 'Milesight', 'UG65', 1700, 'push', ARRAY['gateway','lorawan','industrial','ip67','lte'], '{}'),

('Teltonika TRB140 Gateway LTE', 'Gateways IoT', 'LTE/MQTT', ARRAY['gateway_status','signal_strength'], 'Gateway industrial LTE Cat 4 com RS232/RS485', 'Teltonika', 'TRB140', 1883, 'push', ARRAY['gateway','lte','rs485','industrial'], '{}'),

('Advantech WISE-3610 LoRa', 'Gateways IoT', 'LoRaWAN/MQTT', ARRAY['gateway_status','connected_devices'], 'Gateway LoRaWAN industrial com Wi-Fi e Ethernet', 'Advantech', 'WISE-3610', 1700, 'push', ARRAY['gateway','lorawan','industrial','advantech'], '{}'),

('Kerlink iStation Gateway', 'Gateways IoT', 'LoRaWAN', ARRAY['gateway_status','connected_devices'], 'Gateway LoRaWAN outdoor IP67, 16 canais, LTE', 'Kerlink', 'WMC-0100AA', 1700, 'push', ARRAY['gateway','lorawan','outdoor','ip67','16-canais'], '{}'),

('Multitech Conduit AP', 'Gateways IoT', 'LoRaWAN/MQTT', ARRAY['gateway_status','connected_devices'], 'Gateway LoRaWAN configurável, múltiplos módulos', 'MultiTech', 'MTCAP-868', 1700, 'push', ARRAY['gateway','lorawan','modular'], '{}'),

('Cisco IR1101 Router IoT', 'Gateways IoT', 'LTE/Ethernet', ARRAY['gateway_status','network_stats'], 'Roteador industrial IoT 4G LTE, IOS-XE', 'Cisco', 'IR1101', 443, 'poll', ARRAY['gateway','lte','industrial','cisco'], '{}'),

('Siemens SCALANCE W788', 'Gateways IoT', 'Wi-Fi/Ethernet', ARRAY['gateway_status','network_stats'], 'Access point industrial Wi-Fi 6, IP65', 'Siemens', 'W788-2', 443, 'poll', ARRAY['gateway','wifi','industrial','siemens'], '{}');

-- ============================================================
-- CATEGORIA 6: SENSORES DE GÁS E QUALIDADE DO AR
-- ============================================================
INSERT INTO device_models (name, category, protocol, data_types, description, brand, model_number, default_port, communication_type, tags, config_template) VALUES

('Milesight AM100 Qualidade Ar', 'Sensores de Gás', 'LoRaWAN', ARRAY['co2','tvoc','temperature','humidity','pm2_5'], 'Sensor indoor LoRaWAN: CO2, TVOC, T/H, PM2.5', 'Milesight', 'AM100', 1700, 'push', ARRAY['co2','qualidade-ar','lorawan','indoor'], '{}'),

('Sensirion SCD41 CO2', 'Sensores de Gás', 'MQTT', ARRAY['co2','temperature','humidity'], 'Sensor CO2 fotoacústico miniaturizado, I2C', 'Sensirion', 'SCD41', 1883, 'push', ARRAY['co2','fotoacustico','i2c','indoor'], '{"topic": "air/{device_id}/co2"}'),

('Bosch BME688 Qualidade Ar', 'Sensores de Gás', 'MQTT', ARRAY['gas_resistance','temperature','humidity','pressure'], 'Sensor 4 em 1 com IA para qualidade do ar', 'Bosch Sensortec', 'BME688', 1883, 'push', ARRAY['gas','ia','qualidade-ar','i2c'], '{}'),

('Honeywell MIDAS Detector Gás', 'Sensores de Gás', 'Modbus/TCP', ARRAY['gas_concentration','alarm'], 'Detector de gás industrial multigas, display LCD', 'Honeywell', 'MIDAS-E-HCL', 502, 'poll', ARRAY['gas','industrial','modbus','alarme'], '{"register": 1, "slave_id": 1}'),

('Draeger X-am 8000', 'Sensores de Gás', 'Bluetooth/TCP', ARRAY['gas_concentration','alarm','battery'], 'Detector portátil multigas até 6 gases simultâneos', 'Dräger', 'X-am 8000', 8080, 'push', ARRAY['gas','portatil','multigas','seguranca'], '{}'),

('Figaro TGS2600 Gás Doméstico', 'Sensores de Gás', 'MQTT', ARRAY['gas_concentration'], 'Sensor de gás doméstico (GLP, GN), saída analógica', 'Figaro', 'TGS2600', 1883, 'push', ARRAY['gas','glp','residencial','analogico'], '{}'),

('Alphasense OPC-N3 PM', 'Sensores de Gás', 'MQTT/SPI', ARRAY['pm1','pm2_5','pm10','particle_count'], 'Contador de partículas óptico PM1/PM2.5/PM10', 'Alphasense', 'OPC-N3', 1883, 'push', ARRAY['pm25','pm10','particulas','qualidade-ar'], '{}'),

('Amphenol Telaire T6713 CO2', 'Sensores de Gás', 'MQTT/I2C', ARRAY['co2'], 'Sensor CO2 NDIR 0-5000ppm, I2C/UART', 'Amphenol', 'T6713', 1883, 'push', ARRAY['co2','ndir','indoor','i2c'], '{}');

-- ============================================================
-- CATEGORIA 7: MEDIDORES DE ENERGIA
-- ============================================================
INSERT INTO device_models (name, category, protocol, data_types, description, brand, model_number, default_port, communication_type, tags, config_template) VALUES

('Schneider PowerLogic PM5000', 'Medidores de Energia', 'Modbus TCP/MQTT', ARRAY['voltage','current','power','energy','power_factor'], 'Medidor de energia trifásico classe 0.2S, IEC 62053', 'Schneider Electric', 'PM5000', 502, 'poll', ARRAY['energia','trifasico','modbus','schneider'], '{"ip": "", "port": 502, "slave_id": 1}'),

('ABB B24 Smart Meter', 'Medidores de Energia', 'Modbus/M-Bus', ARRAY['voltage','current','power','energy'], 'Medidor de energia bidirecional para solar/grid', 'ABB', 'B24', 502, 'poll', ARRAY['energia','solar','bidirecional','abb'], '{"slave_id": 1}'),

('Eastron SDM630 Modbus', 'Medidores de Energia', 'Modbus RTU', ARRAY['voltage','current','power','energy','frequency'], 'Medidor trifásico Modbus RS485, 100A direto', 'Eastron', 'SDM630', 502, 'poll', ARRAY['energia','trifasico','modbus','rs485'], '{"slave_id": 1, "baudrate": 9600}'),

('Shelly 3EM Medidor Energia', 'Medidores de Energia', 'Wi-Fi/MQTT', ARRAY['voltage','current','power','energy'], 'Medidor trifásico Wi-Fi com API REST, 120A', 'Shelly', '3EM', 1883, 'push', ARRAY['energia','trifasico','wifi','mqtt'], '{"topic": "shellies/{device_id}/emeter"}'),

('Victron Energy BMV-712', 'Medidores de Energia', 'Bluetooth/MQTT', ARRAY['voltage','current','power','soc','battery'], 'Monitor de bateria com Bluetooth e VE.Direct', 'Victron Energy', 'BMV-712', 1883, 'push', ARRAY['energia','bateria','solar','bluetooth'], '{}'),

('Carlo Gavazzi EM24', 'Medidores de Energia', 'Modbus TCP', ARRAY['voltage','current','power','energy'], 'Medidor de energia trifásico DIN rail, RS485/Ethernet', 'Carlo Gavazzi', 'EM24', 502, 'poll', ARRAY['energia','trifasico','modbus','din'], '{"slave_id": 1}'),

('Janitza UMG 96RM-E', 'Medidores de Energia', 'Modbus TCP/MQTT', ARRAY['voltage','current','power','energy','harmonics'], 'Analisador de qualidade de energia com harmônicos', 'Janitza', 'UMG 96RM-E', 502, 'poll', ARRAY['energia','qualidade','harmonicos','industrial'], '{}'),

('Siemens SENTRON PAC3220', 'Medidores de Energia', 'Modbus TCP', ARRAY['voltage','current','power','energy'], 'Medidor de energia trifásico, display integrado', 'Siemens', 'PAC3220', 502, 'poll', ARRAY['energia','trifasico','modbus','siemens'], '{}');

-- ============================================================
-- CATEGORIA 8: CÂMERAS IP E VIGILÂNCIA
-- ============================================================
INSERT INTO device_models (name, category, protocol, data_types, description, brand, model_number, default_port, communication_type, tags, config_template) VALUES

('Hikvision DS-2CD2143G2-I', 'Câmeras IP', 'ONVIF/RTSP', ARRAY['video','motion_detection','face_detection'], 'Câmera IP 4MP AcuSense, IR 40m, IP67, IK10', 'Hikvision', 'DS-2CD2143G2-I', 554, 'push', ARRAY['camera','ip','onvif','rtsp','ir'], '{"rtsp_url": "rtsp://{ip}:554/stream", "onvif_port": 80}'),

('Dahua IPC-HDW2849H-S-IL', 'Câmeras IP', 'ONVIF/RTSP', ARRAY['video','motion_detection','smart_detection'], 'Câmera IP 8MP Full-color, Smart Dual Light', 'Dahua', 'IPC-HDW2849H', 554, 'push', ARRAY['camera','ip','8mp','full-color','onvif'], '{"rtsp_url": "rtsp://{ip}:554/cam/realmonitor"}'),

('Axis P3245-V', 'Câmeras IP', 'ONVIF/RTSP/MQTT', ARRAY['video','motion_detection','analytics'], 'Câmera dome IP 2MP com analytics ARTPEC-7', 'Axis', 'P3245-V', 554, 'push', ARRAY['camera','ip','analytics','axis','onvif'], '{"rtsp_url": "rtsp://{ip}/axis-media/media.amp"}'),

('Bosch FLEXIDOME 5100i', 'Câmeras IP', 'ONVIF/RTSP', ARRAY['video','motion_detection','ivmd'], 'Câmera dome IP 2MP com análise de vídeo inteligente', 'Bosch Security', 'NDE-5502-AL', 554, 'push', ARRAY['camera','ip','analytics','bosch','onvif'], '{}'),

('Hanwha XNV-8080R', 'Câmeras IP', 'ONVIF/RTSP', ARRAY['video','motion_detection','wdr'], 'Câmera IP 5MP WDR 120dB, IR 50m, IP66/IK10', 'Hanwha Vision', 'XNV-8080R', 554, 'push', ARRAY['camera','ip','5mp','wdr','ir'], '{}'),

('Reolink RLC-810A', 'Câmeras IP', 'RTSP/HTTP', ARRAY['video','motion_detection','person_detection'], 'Câmera IP 4K PoE com detecção de pessoa/veículo', 'Reolink', 'RLC-810A', 554, 'push', ARRAY['camera','ip','4k','poe','deteccao'], '{"rtsp_url": "rtsp://{ip}:554/h264Preview_01_main"}'),

('Amcrest IP8M-2496EW', 'Câmeras IP', 'ONVIF/RTSP', ARRAY['video','motion_detection'], 'Câmera IP 4K outdoor PoE, visão noturna colorida', 'Amcrest', 'IP8M-2496EW', 554, 'push', ARRAY['camera','ip','4k','outdoor','poe'], '{}');

-- ============================================================
-- CATEGORIA 9: CONTROLADORES E PLCs
-- ============================================================
INSERT INTO device_models (name, category, protocol, data_types, description, brand, model_number, default_port, communication_type, tags, config_template) VALUES

('Siemens SIMATIC S7-1200', 'Controladores PLC', 'S7/Modbus TCP/MQTT', ARRAY['digital_io','analog_io','process_data'], 'PLC compacto com Profinet, até 14 DI/10 DO', 'Siemens', 'CPU 1214C', 102, 'poll', ARRAY['plc','s7','profinet','modbus','siemens'], '{"ip": "", "rack": 0, "slot": 1}'),

('Allen-Bradley MicroLogix 1400', 'Controladores PLC', 'EtherNet/IP/Modbus', ARRAY['digital_io','analog_io','process_data'], 'PLC Allen-Bradley com Ethernet/IP e Modbus TCP', 'Rockwell Automation', '1766-L32BXBA', 44818, 'poll', ARRAY['plc','ethernet-ip','modbus','rockwell'], '{"ip": "", "slot": 0}'),

('Schneider Modicon M221', 'Controladores PLC', 'Modbus TCP/MQTT', ARRAY['digital_io','analog_io'], 'PLC compacto com Ethernet, até 40 I/O', 'Schneider Electric', 'TM221CE40R', 502, 'poll', ARRAY['plc','modbus','ethernet','schneider'], '{"ip": "", "slave_id": 255}'),

('Wago 750-8212 PFC200', 'Controladores PLC', 'Modbus TCP/MQTT/OPC-UA', ARRAY['digital_io','analog_io','process_data'], 'Controlador modular com Linux, múltiplos protocolos', 'Wago', '750-8212', 502, 'poll', ARRAY['plc','modbus','opc-ua','linux','wago'], '{"ip": "", "port": 502}'),

('Phoenix Contact RFC 470 PN 3TX', 'Controladores PLC', 'Profinet/Modbus', ARRAY['digital_io','analog_io'], 'Controlador Profinet com múltiplos módulos I/O', 'Phoenix Contact', 'RFC 470 PN 3TX', 102, 'poll', ARRAY['plc','profinet','modbus','phoenix'], '{}'),

('Arduino Opta PLC', 'Controladores PLC', 'Modbus TCP/MQTT', ARRAY['digital_io','analog_io'], 'Micro PLC industrial baseado em Arduino, Wi-Fi/Ethernet', 'Arduino', 'AFX00001', 502, 'poll', ARRAY['plc','arduino','modbus','wifi','industrial'], '{"ip": "", "port": 502}'),

('Raspberry Pi Compute Module 4', 'Controladores PLC', 'MQTT/HTTP', ARRAY['digital_io','analog_io','custom'], 'Computador embarcado industrial com GPIO, CM4', 'Raspberry Pi', 'CM4', 1883, 'push', ARRAY['raspberry','linux','gpio','embarcado'], '{}');

-- ============================================================
-- CATEGORIA 10: SENSORES DE NÍVEL E PRESSÃO
-- ============================================================
INSERT INTO device_models (name, category, protocol, data_types, description, brand, model_number, default_port, communication_type, tags, config_template) VALUES

('Milesight EM500-UDL Nível', 'Sensores de Nível', 'LoRaWAN', ARRAY['distance','level'], 'Sensor de nível ultrassônico LoRaWAN, 0-5m, IP67', 'Milesight', 'EM500-UDL', 1700, 'push', ARRAY['nivel','lorawan','ultrasonico','ip67'], '{}'),

('Dragino LDDS45 Nível Água', 'Sensores de Nível', 'LoRaWAN', ARRAY['distance','level'], 'Sensor de nível LoRaWAN para caixas d''água e rios', 'Dragino', 'LDDS45', 1700, 'push', ARRAY['nivel','lorawan','agua','caixa'], '{}'),

('Endress+Hauser Levelflex M', 'Sensores de Nível', 'Modbus/HART', ARRAY['level','temperature'], 'Medidor de nível por guia de onda, líquidos e sólidos', 'Endress+Hauser', 'FMP51', 502, 'poll', ARRAY['nivel','modbus','hart','industrial'], '{"slave_id": 1}'),

('Vega VEGAPULS 64', 'Sensores de Nível', 'Modbus/HART', ARRAY['level'], 'Radar de nível 80GHz para líquidos, IP68', 'Vega', 'VEGAPULS 64', 502, 'poll', ARRAY['nivel','radar','modbus','ip68'], '{}'),

('Honeywell SmartLine ST800', 'Sensores de Nível', 'HART/Modbus', ARRAY['pressure','level'], 'Transmissor de pressão diferencial para nível', 'Honeywell', 'STD800', 502, 'poll', ARRAY['pressao','nivel','hart','modbus'], '{}'),

('Siemens SITRANS P320', 'Sensores de Nível', 'HART/Modbus', ARRAY['pressure'], 'Transmissor de pressão industrial 4-20mA/HART', 'Siemens', 'P320', 502, 'poll', ARRAY['pressao','hart','modbus','industrial'], '{}'),

('Keller PR-46X Pressão', 'Sensores de Nível', 'Modbus RTU', ARRAY['pressure','temperature'], 'Transmissor de pressão submersível, RS485 Modbus', 'Keller', 'PR-46X', 502, 'poll', ARRAY['pressao','submersivel','modbus','rs485'], '{}'),

('Yokogawa EJX110A', 'Sensores de Nível', 'HART/Fieldbus', ARRAY['pressure','differential_pressure'], 'Transmissor de pressão diferencial HART 5/7', 'Yokogawa', 'EJX110A', 502, 'poll', ARRAY['pressao','hart','fieldbus','yokogawa'], '{}');

-- ============================================================
-- CATEGORIA 11: CONTROLE DE ACESSO
-- ============================================================
INSERT INTO device_models (name, category, protocol, data_types, description, brand, model_number, default_port, communication_type, tags, config_template) VALUES

('ZKTeco SpeedFace-V5L', 'Controle de Acesso', 'TCP/IP/MQTT', ARRAY['face_recognition','access_event','temperature'], 'Terminal biométrico facial com medição de temperatura', 'ZKTeco', 'SpeedFace-V5L', 4370, 'push', ARRAY['biometria','facial','temperatura','acesso'], '{"ip": "", "port": 4370, "protocol": "zkp"}'),

('Hikvision DS-K1T342EFWX', 'Controle de Acesso', 'TCP/IP/MQTT', ARRAY['face_recognition','fingerprint','access_event'], 'Terminal biométrico facial + digital, outdoor IP65', 'Hikvision', 'DS-K1T342EFWX', 8000, 'push', ARRAY['biometria','facial','digital','outdoor'], '{"ip": "", "port": 8000}'),

('HID Global Signo 20', 'Controle de Acesso', 'OSDP/Wiegand', ARRAY['card_read','access_event'], 'Leitor RFID multitecnologia iCLASS/MIFARE/DESFire', 'HID Global', 'RK40', 4050, 'push', ARRAY['rfid','osdp','wiegand','acesso'], '{}'),

('Suprema BioEntry W3', 'Controle de Acesso', 'TCP/IP/OSDP', ARRAY['fingerprint','face_recognition','access_event'], 'Leitor biométrico IP65 com facial e digital', 'Suprema', 'BEW3-ODB', 51211, 'push', ARRAY['biometria','facial','digital','ip65'], '{}'),

('Paxton Net2 Plus', 'Controle de Acesso', 'TCP/IP', ARRAY['card_read','access_event','door_status'], 'Controlador de acesso em rede, 2 portas', 'Paxton', 'Net2 Plus', 8080, 'push', ARRAY['acesso','rfid','rede','paxton'], '{}'),

('Lenel S2 NetBox', 'Controle de Acesso', 'TCP/IP', ARRAY['card_read','access_event','alarm'], 'Controlador de acesso baseado em web, 4 portas', 'LenelS2', 'NetBox', 443, 'push', ARRAY['acesso','web','4-portas','enterprise'], '{}'),

('Intelbras SS 5530 MF', 'Controle de Acesso', 'TCP/IP', ARRAY['fingerprint','card_read','access_event'], 'Controlador biométrico com RFID Mifare, 30.000 usuários', 'Intelbras', 'SS 5530 MF', 80, 'push', ARRAY['biometria','rfid','mifare','brasil'], '{"ip": "", "port": 80}');

-- ============================================================
-- CATEGORIA 12: SENSORES AGRÍCOLAS
-- ============================================================
INSERT INTO device_models (name, category, protocol, data_types, description, brand, model_number, default_port, communication_type, tags, config_template) VALUES

('Milesight EM500-SMTC Solo', 'Sensores Agrícolas', 'LoRaWAN', ARRAY['soil_moisture','soil_temperature','conductivity'], 'Sensor de solo LoRaWAN: umidade, temperatura, condutividade', 'Milesight', 'EM500-SMTC', 1700, 'push', ARRAY['solo','umidade','temperatura','lorawan','agricultura'], '{}'),

('Dragino LSE01 Solo LoRa', 'Sensores Agrícolas', 'LoRaWAN', ARRAY['soil_moisture','soil_temperature','conductivity'], 'Sensor de solo LoRaWAN com 3 profundidades', 'Dragino', 'LSE01', 1700, 'push', ARRAY['solo','lorawan','agricultura','3-profundidades'], '{}'),

('Decagon 5TM Solo', 'Sensores Agrícolas', 'SDI-12/MQTT', ARRAY['soil_moisture','soil_temperature'], 'Sensor de umidade do solo por capacitância, SDI-12', 'METER Group', '5TM', 1883, 'push', ARRAY['solo','umidade','sdi-12','agricultura'], '{}'),

('Davis Vantage Pro2 Estação', 'Sensores Agrícolas', 'TCP/IP/MQTT', ARRAY['temperature','humidity','wind_speed','wind_direction','rainfall','solar_radiation'], 'Estação meteorológica completa com datalogger', 'Davis Instruments', 'Vantage Pro2', 22222, 'push', ARRAY['meteorologia','vento','chuva','solar','agricultura'], '{"ip": "", "port": 22222}'),

('Campbell Scientific CR300', 'Sensores Agrícolas', 'TCP/IP/MQTT', ARRAY['temperature','humidity','wind','rain','soil','custom'], 'Datalogger científico para monitoramento ambiental', 'Campbell Scientific', 'CR300', 6785, 'poll', ARRAY['datalogger','meteorologia','cientifico','agricultura'], '{}'),

('Onset HOBO RX3000', 'Sensores Agrícolas', 'HTTP/MQTT', ARRAY['temperature','humidity','soil_moisture','wind','rain'], 'Estação de monitoramento remoto com 4G e solar', 'Onset', 'RX3000', 443, 'push', ARRAY['estacao','4g','solar','agricultura','hobo'], '{}'),

('Libelium Smart Agriculture', 'Sensores Agrícolas', 'LoRaWAN/4G', ARRAY['soil_moisture','soil_temperature','leaf_wetness','solar_radiation'], 'Kit agrícola completo com múltiplos sensores de solo', 'Libelium', 'Smart Agriculture Pro', 1700, 'push', ARRAY['agricultura','lorawan','4g','kit-completo'], '{}'),

('Sentek Drill & Drop', 'Sensores Agrícolas', 'SDI-12/Modbus', ARRAY['soil_moisture','soil_temperature','salinity'], 'Sonda de solo multi-profundidade até 120cm', 'Sentek', 'Drill & Drop', 502, 'poll', ARRAY['solo','multi-profundidade','sdi-12','agricultura'], '{}');

-- ============================================================
-- CATEGORIA 13: WEARABLES E RASTREADORES PESSOAIS
-- ============================================================
INSERT INTO device_models (name, category, protocol, data_types, description, brand, model_number, default_port, communication_type, tags, config_template) VALUES

('Teltonika GH5200 Wearable', 'Wearables', 'TCP/BLE', ARRAY['gps_location','panic_button','heart_rate','fall_detection'], 'Rastreador pessoal 4G com monitor cardíaco e SOS', 'Teltonika', 'GH5200', 5027, 'push', ARRAY['wearable','gps','cardiaco','sos','4g'], '{"server_ip": "", "server_port": 5027}'),

('Queclink GL300MA Pessoal', 'Wearables', 'TCP', ARRAY['gps_location','panic_button','battery'], 'Rastreador pessoal 4G ultra-compacto com SOS', 'Queclink', 'GL300MA', 5093, 'push', ARRAY['pessoal','gps','sos','4g','compacto'], '{}'),

('Garmin inReach Mini 2', 'Wearables', 'Satellite/MQTT', ARRAY['gps_location','panic_button','messages'], 'Comunicador satelital com SOS e rastreamento global', 'Garmin', 'inReach Mini 2', 443, 'push', ARRAY['satelite','sos','global','outdoor'], '{}'),

('Apple AirTag', 'Wearables', 'Bluetooth/UWB', ARRAY['location'], 'Rastreador Bluetooth com rede Find My da Apple', 'Apple', 'AirTag', 0, 'push', ARRAY['bluetooth','uwb','apple','rastreador'], '{}'),

('Samsung SmartTag2', 'Wearables', 'Bluetooth/UWB', ARRAY['location'], 'Rastreador Bluetooth Samsung com UWB, IP67', 'Samsung', 'EI-T5600', 0, 'push', ARRAY['bluetooth','uwb','samsung','ip67'], '{}'),

('Tile Pro', 'Wearables', 'Bluetooth', ARRAY['location'], 'Rastreador Bluetooth com rede comunitária global', 'Tile', 'RE-44001', 0, 'push', ARRAY['bluetooth','rastreador','comunidade'], '{}');

-- ============================================================
-- CATEGORIA 14: SMART HOME / AUTOMAÇÃO RESIDENCIAL
-- ============================================================
INSERT INTO device_models (name, category, protocol, data_types, description, brand, model_number, default_port, communication_type, tags, config_template) VALUES

('Shelly Plus 1PM', 'Smart Home', 'Wi-Fi/MQTT', ARRAY['switch_state','power','energy'], 'Relé Wi-Fi 1 canal com medição de energia, 16A', 'Shelly', 'SNSW-001P16EU', 1883, 'push', ARRAY['rele','wifi','energia','residencial'], '{"topic": "shellies/{device_id}/relay/0"}'),

('Sonoff ZBMINI Zigbee', 'Smart Home', 'Zigbee', ARRAY['switch_state'], 'Mini relé Zigbee para embutir em caixas elétricas', 'Sonoff', 'ZBMINIL2', 1883, 'push', ARRAY['rele','zigbee','embutido','residencial'], '{"topic": "zigbee2mqtt/{device_id}"}'),

('Philips Hue Bridge', 'Smart Home', 'Zigbee/HTTP', ARRAY['light_state','brightness','color'], 'Hub central Zigbee para lâmpadas Hue, API REST', 'Philips', 'BSB002', 80, 'poll', ARRAY['zigbee','iluminacao','hub','residencial'], '{"ip": "", "api_key": ""}'),

('Aqara Hub M2', 'Smart Home', 'Zigbee/MQTT', ARRAY['hub_status','connected_devices'], 'Hub Zigbee 3.0 com IR blaster e HomeKit', 'Aqara', 'HM2-G01', 1883, 'push', ARRAY['zigbee','hub','homekit','residencial'], '{}'),

('Tuya Smart Plug 16A', 'Smart Home', 'Wi-Fi/MQTT', ARRAY['switch_state','power','energy','voltage'], 'Tomada inteligente Wi-Fi com medição de energia', 'Tuya', 'TS011F', 1883, 'push', ARRAY['tomada','wifi','energia','residencial'], '{"topic": "tuya/{device_id}/state"}'),

('Zigbee2MQTT Coordinator', 'Smart Home', 'Zigbee/MQTT', ARRAY['hub_status','connected_devices'], 'Coordenador Zigbee USB com suporte a 1000+ dispositivos', 'Various', 'CC2652P', 1883, 'push', ARRAY['zigbee','coordenador','mqtt','universal'], '{"topic": "zigbee2mqtt/bridge/state"}'),

('Home Assistant Yellow', 'Smart Home', 'MQTT/HTTP', ARRAY['hub_status','custom'], 'Hub de automação residencial open-source com Zigbee/Z-Wave', 'Nabu Casa', 'HA Yellow', 8123, 'push', ARRAY['hub','open-source','zigbee','z-wave','homeassistant'], '{"ip": "", "port": 8123, "token": ""}'),

('ESPHome ESP32 Custom', 'Smart Home', 'Wi-Fi/MQTT', ARRAY['custom'], 'Firmware open-source para ESP32/ESP8266 com MQTT', 'Espressif', 'ESP32', 1883, 'push', ARRAY['esp32','wifi','mqtt','custom','open-source'], '{"topic": "{device_id}/state"}');

-- ============================================================
-- CATEGORIA 15: VEÍCULOS E FROTAS ESPECIAIS
-- ============================================================
INSERT INTO device_models (name, category, protocol, data_types, description, brand, model_number, default_port, communication_type, tags, config_template) VALUES

('Teltonika FMB003 OBD', 'Frotas Especiais', 'TCP', ARRAY['gps_location','obd_data','speed','fuel','engine'], 'Rastreador OBD-II plug & play com leitura de diagnóstico', 'Teltonika', 'FMB003', 5027, 'push', ARRAY['obd','frotas','diagnostico','plug-play'], '{"server_ip": "", "server_port": 5027}'),

('Teltonika FMC650 Câmera', 'Frotas Especiais', 'TCP', ARRAY['gps_location','video','driver_behavior','fuel'], 'Rastreador 4G com câmera dual, DMS e ADAS', 'Teltonika', 'FMC650', 5027, 'push', ARRAY['camera','dms','adas','frotas','4g'], '{}'),

('Samsara VG34 Gateway', 'Frotas Especiais', 'LTE/MQTT', ARRAY['gps_location','obd_data','fuel','temperature','camera'], 'Gateway IoT para frotas com câmera e sensores', 'Samsara', 'VG34', 443, 'push', ARRAY['frotas','gateway','camera','lte','samsara'], '{}'),

('Geotab GO9 Rastreador', 'Frotas Especiais', 'LTE', ARRAY['gps_location','obd_data','driver_behavior','fuel'], 'Rastreador OBD-II 4G com análise de comportamento', 'Geotab', 'GO9', 443, 'push', ARRAY['obd','frotas','comportamento','4g'], '{}'),

('Lytx DriveCam SF300', 'Frotas Especiais', 'LTE', ARRAY['video','driver_behavior','gps_location'], 'Câmera de segurança para frotas com IA', 'Lytx', 'SF300', 443, 'push', ARRAY['camera','ia','seguranca','frotas'], '{}');

-- Criar índice para busca rápida na biblioteca
CREATE INDEX IF NOT EXISTS idx_device_models_brand ON device_models(brand);
CREATE INDEX IF NOT EXISTS idx_device_models_category ON device_models(category);
CREATE INDEX IF NOT EXISTS idx_device_models_protocol ON device_models(protocol);

-- Criar índice para conexão nos dispositivos
CREATE INDEX IF NOT EXISTS idx_devices_connection_status ON devices(connection_status);
