-- Migração 005: Biblioteca de Dispositivos IoT - Seed Completo
-- Usa o schema real: manufacturer, data_schema (JSONB), brand, model_number, default_port, communication_type, config_template

-- Limpar dados antigos
TRUNCATE device_models CASCADE;

-- ══════════════════════════════════════════════════════════════
-- TEMPERATURA E UMIDADE
-- ══════════════════════════════════════════════════════════════
INSERT INTO device_models (name, manufacturer, brand, model_number, category, protocol, description, data_schema, default_port, communication_type, tags, config_template) VALUES

('Dragino LHT65N', 'Dragino', 'Dragino', 'LHT65N', 'Temperatura e Umidade', 'LoRaWAN', 'Sensor LoRaWAN de temperatura e umidade com sonda externa. Bateria de 3 anos. Ideal para ambientes industriais e câmaras frias.', '{"temperature": "float (°C)", "humidity": "float (%RH)", "battery": "float (V)", "ext_temperature": "float (°C)"}', 1700, 'push', ARRAY['lorawan','temperatura','umidade','bateria','industrial'], '{"server": "0.0.0.0", "port": 1700, "protocol": "udp"}'),

('Milesight EM300-TH', 'Milesight', 'Milesight', 'EM300-TH', 'Temperatura e Umidade', 'LoRaWAN', 'Sensor LoRaWAN compacto para temperatura e umidade. IP67, bateria de 5 anos. Certificado CE/FCC.', '{"temperature": "float (°C)", "humidity": "float (%RH)", "battery_level": "int (%)"}', 1700, 'push', ARRAY['lorawan','temperatura','umidade','ip67','5anos'], '{"server": "0.0.0.0", "port": 1700}'),

('Shelly H&T Gen3', 'Shelly', 'Shelly', 'SNSN-0013A', 'Temperatura e Umidade', 'Wi-Fi/MQTT', 'Sensor Wi-Fi de temperatura e umidade com display. Integração nativa com MQTT, Home Assistant e Alexa.', '{"temperature": "float (°C)", "humidity": "float (%RH)", "battery": "int (%)"}', 1883, 'push', ARRAY['wifi','mqtt','temperatura','umidade','smarthome'], '{"broker": "mqtt://broker:1883", "topic": "shellies/{id}/sensor/temperature", "qos": 0}'),

('Sonoff SNZB-02D', 'ITEAD', 'Sonoff', 'SNZB-02D', 'Temperatura e Umidade', 'Zigbee', 'Sensor Zigbee de temperatura e umidade com display LCD. Precisão ±0.2°C. Requer gateway Zigbee.', '{"temperature": "float (°C)", "humidity": "float (%RH)", "linkquality": "int"}', 0, 'push', ARRAY['zigbee','temperatura','umidade','display','smarthome'], '{}'),

('Bosch BME680', 'Bosch', 'Bosch', 'BME680', 'Temperatura e Umidade', 'I2C/SPI', 'Sensor ambiental 4-em-1: temperatura, umidade, pressão e qualidade do ar (VOC). Alta precisão para aplicações industriais.', '{"temperature": "float (°C)", "humidity": "float (%RH)", "pressure": "float (hPa)", "gas_resistance": "float (Ohm)", "iaq": "float"}', 0, 'push', ARRAY['i2c','temperatura','umidade','pressao','qualidade-ar','industrial'], '{}'),

('RAK Wireless RAK1901', 'RAK Wireless', 'RAK Wireless', 'RAK1901', 'Temperatura e Umidade', 'LoRaWAN', 'Módulo sensor SHTC3 para WisBlock. Temperatura ±0.2°C, umidade ±2%RH. Consumo ultra-baixo.', '{"temperature": "float (°C)", "humidity": "float (%RH)"}', 1700, 'push', ARRAY['lorawan','wisblock','temperatura','umidade','modular'], '{}'),

('Advantech WISE-2410', 'Advantech', 'Advantech', 'WISE-2410', 'Temperatura e Umidade', 'LoRaWAN', 'Sensor industrial LoRaWAN com certificação ATEX para ambientes explosivos. Temperatura -40°C a +85°C.', '{"temperature": "float (°C)", "humidity": "float (%RH)", "battery": "float (V)"}', 1700, 'push', ARRAY['lorawan','industrial','atex','temperatura','umidade'], '{}'),

('Elsys ERS2', 'Elsys', 'Elsys', 'ERS2', 'Temperatura e Umidade', 'LoRaWAN', 'Sensor LoRaWAN multifunção: temperatura, umidade, luz, movimento e CO2 opcional. Bateria 10 anos.', '{"temperature": "float (°C)", "humidity": "float (%RH)", "light": "int (lux)", "motion": "bool", "battery": "float (V)"}', 1700, 'push', ARRAY['lorawan','temperatura','umidade','luz','movimento'], '{}'),

-- ══════════════════════════════════════════════════════════════
-- RASTREADORES GPS
-- ══════════════════════════════════════════════════════════════

('Teltonika FMB920', 'Teltonika', 'Teltonika', 'FMB920', 'Rastreadores GPS', 'TCP/MQTT', 'Rastreador GPS compacto com Bluetooth. Suporte a OBD-II, acelerômetro, geofence. Protocolo Codec 8/8E.', '{"latitude": "float", "longitude": "float", "speed": "float (km/h)", "altitude": "float (m)", "ignition": "bool", "battery": "float (V)", "satellites": "int"}', 5027, 'push', ARRAY['gps','teltonika','obd','bluetooth','veiculo'], '{"server": "0.0.0.0", "port": 5027, "protocol": "teltonika"}'),

('Teltonika FMC130', 'Teltonika', 'Teltonika', 'FMC130', 'Rastreadores GPS', 'TCP/MQTT', 'Rastreador GPS 4G LTE com câmera integrada. Suporte a CAN-Bus, RS232, RS485. Ideal para frotas pesadas.', '{"latitude": "float", "longitude": "float", "speed": "float (km/h)", "fuel_level": "float (%)", "rpm": "int", "odometer": "float (km)", "can_data": "object"}', 5027, 'push', ARRAY['gps','4g','canbus','camera','frota-pesada'], '{"server": "0.0.0.0", "port": 5027}'),

('Queclink GV300W', 'Queclink', 'Queclink', 'GV300W', 'Rastreadores GPS', 'TCP/UDP', 'Rastreador GPS 4G com Wi-Fi. Acelerômetro 3-eixos, geofence, relatório de eventos. Protocolo GPRMC.', '{"latitude": "float", "longitude": "float", "speed": "float (km/h)", "heading": "float (°)", "mileage": "float (km)", "battery": "float (V)"}', 5093, 'push', ARRAY['gps','4g','wifi','queclink','veiculo'], '{"server": "0.0.0.0", "port": 5093, "protocol": "gl200"}'),

('Coban GPS103-B', 'Coban', 'Coban', 'GPS103-B', 'Rastreadores GPS', 'TCP/UDP', 'Rastreador GPS básico com corte de combustível remoto. Suporte a SMS e GPRS. Protocolo H02.', '{"latitude": "float", "longitude": "float", "speed": "float (km/h)", "ignition": "bool", "alarm": "string"}', 5013, 'push', ARRAY['gps','gprs','sms','corte-combustivel','basico'], '{"server": "0.0.0.0", "port": 5013, "protocol": "h02"}'),

('Suntech ST4315U', 'Suntech', 'Suntech', 'ST4315U', 'Rastreadores GPS', 'TCP/UDP', 'Rastreador GPS 4G com backup de bateria 24h. Sensor de temperatura, RS232, RS485. Fabricação nacional.', '{"latitude": "float", "longitude": "float", "speed": "float (km/h)", "temperature": "float (°C)", "battery": "float (V)", "input1": "bool", "input2": "bool"}', 2013, 'push', ARRAY['gps','4g','temperatura','nacional','suntech'], '{"server": "0.0.0.0", "port": 2013, "protocol": "suntech"}'),

('Meitrack T366G', 'Meitrack', 'Meitrack', 'T366G', 'Rastreadores GPS', 'TCP/UDP', 'Rastreador GPS 4G com câmera MDVR. Monitoramento de motorista por RFID. Suporte a até 4 câmeras.', '{"latitude": "float", "longitude": "float", "speed": "float (km/h)", "rfid": "string", "camera_trigger": "bool"}', 8800, 'push', ARRAY['gps','4g','camera','rfid','mdvr'], '{"server": "0.0.0.0", "port": 8800, "protocol": "meitrack"}'),

('Calamp LMU-4230', 'CalAmp', 'CalAmp', 'LMU-4230', 'Rastreadores GPS', 'TCP/UDP', 'Rastreador GPS robusto para ativos e equipamentos pesados. Bateria interna 5 anos, IP67.', '{"latitude": "float", "longitude": "float", "speed": "float (km/h)", "battery": "float (V)", "temperature": "float (°C)"}', 20500, 'push', ARRAY['gps','ativo','ip67','bateria-longa','industrial'], '{}'),

-- ══════════════════════════════════════════════════════════════
-- BOTÕES DE PÂNICO
-- ══════════════════════════════════════════════════════════════

('Milesight VS121', 'Milesight', 'Milesight', 'VS121', 'Botões de Pânico', 'LoRaWAN', 'Botão de pânico LoRaWAN com GPS integrado. Envio de localização no acionamento. Bateria 2 anos.', '{"panic": "bool", "latitude": "float", "longitude": "float", "battery": "float (V)"}', 1700, 'push', ARRAY['lorawan','panico','gps','pessoal','seguranca'], '{}'),

('Dragino LGT-92', 'Dragino', 'Dragino', 'LGT-92', 'Botões de Pânico', 'LoRaWAN', 'Rastreador pessoal LoRaWAN com botão SOS. GPS + acelerômetro. Ideal para trabalhadores isolados.', '{"latitude": "float", "longitude": "float", "sos": "bool", "battery": "float (V)", "moving": "bool"}', 1700, 'push', ARRAY['lorawan','sos','gps','pessoal','trabalhador'], '{}'),

('Kerlink Wanesy Panic Button', 'Kerlink', 'Kerlink', 'WAN-PB-01', 'Botões de Pânico', 'LoRaWAN', 'Botão de pânico industrial LoRaWAN. IP67, resistente a impactos. Confirmação de recebimento.', '{"panic": "bool", "battery": "float (V)", "temperature": "float (°C)"}', 1700, 'push', ARRAY['lorawan','panico','industrial','ip67'], '{}'),

('Laird Sentrius BT510', 'Laird', 'Laird', 'BT510', 'Botões de Pânico', 'Bluetooth', 'Sensor Bluetooth 5 com botão de pânico, temperatura e acelerômetro. Alcance 100m. Bateria 5 anos.', '{"panic": "bool", "temperature": "float (°C)", "movement": "bool", "battery": "float (V)"}', 0, 'push', ARRAY['bluetooth','panico','temperatura','movimento','pessoal'], '{}'),

-- ══════════════════════════════════════════════════════════════
-- SENSORES DE MOVIMENTO E PRESENÇA
-- ══════════════════════════════════════════════════════════════

('Milesight VS133', 'Milesight', 'Milesight', 'VS133', 'Sensores de Movimento', 'LoRaWAN', 'Sensor de presença ToF (Time-of-Flight) LoRaWAN. Contagem bidirecional de pessoas. Precisão >95%.', '{"people_count": "int", "entering": "int", "leaving": "int", "occupancy": "int"}', 1700, 'push', ARRAY['lorawan','presenca','contagem','pessoas','tof'], '{}'),

('Dragino LBT1', 'Dragino', 'Dragino', 'LBT1', 'Sensores de Movimento', 'LoRaWAN', 'Sensor de movimento PIR LoRaWAN com temperatura. Detecção de 8m, ângulo 120°. Bateria 3 anos.', '{"motion": "bool", "temperature": "float (°C)", "battery": "float (V)"}', 1700, 'push', ARRAY['lorawan','pir','movimento','temperatura'], '{}'),

('Sonoff SNZB-03', 'ITEAD', 'Sonoff', 'SNZB-03', 'Sensores de Movimento', 'Zigbee', 'Sensor de movimento PIR Zigbee. Detecção de 6m, ângulo 110°. Integração com Alexa e Google Home.', '{"occupancy": "bool", "battery": "int (%)", "linkquality": "int"}', 0, 'push', ARRAY['zigbee','pir','movimento','smarthome'], '{}'),

('Bosch BSD-250', 'Bosch', 'Bosch', 'BSD-250', 'Sensores de Movimento', 'Wi-Fi/MQTT', 'Detector de movimento dual-tech (PIR + microondas) para segurança. Imune a falsos alarmes. IP65.', '{"alarm": "bool", "tamper": "bool", "battery": "float (V)"}', 1883, 'push', ARRAY['wifi','pir','microondas','seguranca','ip65'], '{}'),

-- ══════════════════════════════════════════════════════════════
-- GATEWAYS IOT
-- ══════════════════════════════════════════════════════════════

('RAK Wireless RAK7268', 'RAK Wireless', 'RAK Wireless', 'RAK7268', 'Gateways IoT', 'LoRaWAN', 'Gateway LoRaWAN indoor 8 canais. Suporte a Chirpstack, TTN, AWS IoT. Wi-Fi + Ethernet + LTE opcional.', '{"connected_devices": "int", "uptime": "int (s)", "cpu_usage": "float (%)", "memory_usage": "float (%)"}', 1700, 'push', ARRAY['lorawan','gateway','indoor','chirpstack','ttn'], '{"server": "0.0.0.0", "port": 1700, "channels": 8}'),

('Kerlink iStation', 'Kerlink', 'Kerlink', 'WMC-0101AA', 'Gateways IoT', 'LoRaWAN', 'Gateway LoRaWAN outdoor industrial. 16 canais, IP67, -40°C a +70°C. Antena integrada 3dBi.', '{"connected_devices": "int", "rssi": "float (dBm)", "snr": "float (dB)"}', 1700, 'push', ARRAY['lorawan','gateway','outdoor','industrial','ip67'], '{}'),

('MultiTech Conduit AP', 'MultiTech', 'MultiTech', 'MTCAP-L4E1', 'Gateways IoT', 'LoRaWAN', 'Gateway LoRaWAN access point. Suporte a 8 canais simultâneos. Configuração via web interface.', '{"connected_devices": "int", "uptime": "int (s)"}', 1700, 'push', ARRAY['lorawan','gateway','multitech','8canais'], '{}'),

('Advantech WISE-3310', 'Advantech', 'Advantech', 'WISE-3310', 'Gateways IoT', 'MQTT', 'Gateway IoT industrial com suporte a Modbus, RS232, RS485, DI/DO. Node-RED integrado.', '{"connected_devices": "int", "cpu_temp": "float (°C)", "uptime": "int (s)"}', 1883, 'push', ARRAY['mqtt','gateway','industrial','modbus','node-red'], '{"broker": "mqtt://broker:1883", "topic": "gateway/{id}/status"}'),

('Particle Boron', 'Particle', 'Particle', 'BRN404X', 'Gateways IoT', 'LTE', 'Gateway IoT LTE-M/NB-IoT com processador ARM Cortex-M4. SDK nativo, OTA updates. Ideal para edge computing.', '{"signal_strength": "int (dBm)", "battery": "float (V)", "temperature": "float (°C)"}', 443, 'push', ARRAY['lte','nbiot','gateway','edge','ota'], '{}'),

-- ══════════════════════════════════════════════════════════════
-- SENSORES DE GÁS
-- ══════════════════════════════════════════════════════════════

('Dragino LSN50v2-D23', 'Dragino', 'Dragino', 'LSN50v2-D23', 'Sensores de Gás', 'LoRaWAN', 'Sensor LoRaWAN para CO2, temperatura e umidade. Sensor NDIR de alta precisão. Bateria 5 anos.', '{"co2": "int (ppm)", "temperature": "float (°C)", "humidity": "float (%RH)", "battery": "float (V)"}', 1700, 'push', ARRAY['lorawan','co2','temperatura','umidade','ndir'], '{}'),

('Milesight AM319', 'Milesight', 'Milesight', 'AM319', 'Sensores de Gás', 'LoRaWAN', 'Sensor de qualidade do ar LoRaWAN 9-em-1: CO2, TVOC, PM2.5, PM10, temperatura, umidade, pressão, luz, ruído.', '{"co2": "int (ppm)", "tvoc": "int (ppb)", "pm25": "float (µg/m³)", "pm10": "float (µg/m³)", "temperature": "float (°C)", "humidity": "float (%RH)", "pressure": "float (hPa)", "light": "int (lux)", "noise": "float (dB)"}', 1700, 'push', ARRAY['lorawan','co2','tvoc','pm25','qualidade-ar','9em1'], '{}'),

('Bosch BME688', 'Bosch', 'Bosch', 'BME688', 'Sensores de Gás', 'I2C/SPI', 'Sensor de gás com IA integrada. Detecta VOCs, CO2 equivalente, qualidade do ar. Treinamento de modelos on-device.', '{"gas_resistance": "float (Ohm)", "temperature": "float (°C)", "humidity": "float (%RH)", "pressure": "float (hPa)", "iaq": "float", "co2_eq": "float (ppm)"}', 0, 'push', ARRAY['i2c','gas','ia','voc','co2','qualidade-ar'], '{}'),

('Elsys ERS CO2', 'Elsys', 'Elsys', 'ERS-CO2-5', 'Sensores de Gás', 'LoRaWAN', 'Sensor LoRaWAN de CO2 com temperatura e umidade. Sensor NDIR. Indicador LED de qualidade do ar. Bateria 10 anos.', '{"co2": "int (ppm)", "temperature": "float (°C)", "humidity": "float (%RH)", "battery": "float (V)"}', 1700, 'push', ARRAY['lorawan','co2','temperatura','umidade','led','10anos'], '{}'),

-- ══════════════════════════════════════════════════════════════
-- MEDIDORES DE ENERGIA
-- ══════════════════════════════════════════════════════════════

('Schneider Electric PM5100', 'Schneider Electric', 'Schneider Electric', 'PM5100', 'Medidores de Energia', 'Modbus TCP', 'Medidor de energia trifásico com comunicação Modbus TCP. Mede kWh, kVAR, kVA, fator de potência, harmônicos.', '{"active_power": "float (kW)", "reactive_power": "float (kVAR)", "apparent_power": "float (kVA)", "power_factor": "float", "frequency": "float (Hz)", "voltage_l1": "float (V)", "current_l1": "float (A)", "energy": "float (kWh)"}', 502, 'poll', ARRAY['modbus','energia','trifasico','harmonicos','industrial'], '{"host": "0.0.0.0", "port": 502, "unit_id": 1, "registers": "energy"}'),

('ABB B24 112-100', 'ABB', 'ABB', 'B24 112-100', 'Medidores de Energia', 'Modbus RTU', 'Medidor de energia monofásico/bifásico ABB. Comunicação RS485 Modbus RTU. Precisão classe 1.', '{"active_energy": "float (kWh)", "reactive_energy": "float (kVARh)", "active_power": "float (W)", "voltage": "float (V)", "current": "float (A)"}', 502, 'poll', ARRAY['modbus','energia','monofasico','rs485','abb'], '{"port": "/dev/ttyRS485", "baudrate": 9600, "unit_id": 1}'),

('Shelly Pro 3EM', 'Shelly', 'Shelly', 'SHEM-3', 'Medidores de Energia', 'Wi-Fi/MQTT', 'Medidor de energia trifásico Wi-Fi/MQTT. Monitoramento em tempo real, histórico na nuvem. DIN Rail.', '{"total_power": "float (W)", "phase_a_power": "float (W)", "phase_b_power": "float (W)", "phase_c_power": "float (W)", "total_energy": "float (kWh)"}', 1883, 'push', ARRAY['wifi','mqtt','energia','trifasico','din-rail','shelly'], '{"broker": "mqtt://broker:1883", "topic": "shellies/{id}/emeter/0/power"}'),

('Eastron SDM630', 'Eastron', 'Eastron', 'SDM630', 'Medidores de Energia', 'Modbus TCP/MQTT', 'Medidor de energia trifásico com Modbus TCP e saída de pulso. Mede 60+ parâmetros elétricos.', '{"active_power": "float (kW)", "reactive_power": "float (kVAR)", "power_factor": "float", "frequency": "float (Hz)", "import_energy": "float (kWh)", "export_energy": "float (kWh)"}', 502, 'poll', ARRAY['modbus','energia','trifasico','60parametros'], '{"host": "0.0.0.0", "port": 502, "unit_id": 1}'),

-- ══════════════════════════════════════════════════════════════
-- CÂMERAS IP
-- ══════════════════════════════════════════════════════════════

('Hikvision DS-2CD2143G2-I', 'Hikvision', 'Hikvision', 'DS-2CD2143G2-I', 'Câmeras IP', 'ONVIF/RTSP', 'Câmera IP dome 4MP com IR 40m. ONVIF, RTSP, detecção de movimento, análise de vídeo IA. IP67.', '{"motion_detected": "bool", "person_detected": "bool", "vehicle_detected": "bool", "stream_url": "string"}', 554, 'push', ARRAY['onvif','rtsp','4mp','ir','ia','ip67'], '{"rtsp_url": "rtsp://{user}:{pass}@{host}:554/Streaming/Channels/101"}'),

('Dahua IPC-HDW2849H', 'Dahua', 'Dahua', 'IPC-HDW2849H', 'Câmeras IP', 'ONVIF/RTSP', 'Câmera IP eyeball 8MP 4K com IR 30m. Smart Motion Detection, ONVIF, H.265+. IP67.', '{"motion_detected": "bool", "intrusion_detected": "bool", "line_crossing": "bool"}', 554, 'push', ARRAY['onvif','rtsp','8mp','4k','ir','smarthome'], '{"rtsp_url": "rtsp://{user}:{pass}@{host}:554/cam/realmonitor?channel=1&subtype=0"}'),

('Axis P3245-V', 'Axis', 'Axis', 'P3245-V', 'Câmeras IP', 'ONVIF/RTSP', 'Câmera IP dome fixa 2MP HDTV 1080p. ONVIF, VAPIX API, análise de vídeo avançada. Certificada para uso em ambientes críticos.', '{"motion_detected": "bool", "analytics_data": "object", "ptz_position": "object"}', 554, 'push', ARRAY['onvif','rtsp','1080p','vapix','analytics','axis'], '{"rtsp_url": "rtsp://{user}:{pass}@{host}:554/axis-media/media.amp"}'),

-- ══════════════════════════════════════════════════════════════
-- CONTROLADORES PLC
-- ══════════════════════════════════════════════════════════════

('Siemens S7-1200', 'Siemens', 'Siemens', '6ES7 214-1AG40-0XB0', 'Controladores PLC', 'S7/Modbus TCP/MQTT', 'PLC compacto Siemens S7-1200 com CPU 1214C. Ethernet integrada, suporte a Modbus TCP e OPC-UA. 14 DI/10 DO.', '{"di_status": "array[bool]", "do_status": "array[bool]", "ai_values": "array[float]", "ao_values": "array[float]", "cpu_status": "string"}', 102, 'poll', ARRAY['plc','siemens','s7','modbus','opc-ua','industrial'], '{"host": "0.0.0.0", "port": 102, "rack": 0, "slot": 1}'),

('Schneider Modicon M221', 'Schneider Electric', 'Schneider Electric', 'TM221CE24R', 'Controladores PLC', 'Modbus TCP/MQTT', 'PLC Modicon M221 com 24 I/O. Modbus TCP, Ethernet, suporte a EcoStruxure Machine. Programação em Ladder/ST.', '{"digital_inputs": "array[bool]", "digital_outputs": "array[bool]", "analog_inputs": "array[float]"}', 502, 'poll', ARRAY['plc','schneider','modicon','modbus','ethernet'], '{"host": "0.0.0.0", "port": 502, "unit_id": 255}'),

('ABB AC500-eCo', 'ABB', 'ABB', 'PM5072-ETH', 'Controladores PLC', 'Modbus TCP/MQTT', 'PLC econômico ABB AC500-eCo com Ethernet. Suporte a Modbus TCP, PROFINET, EtherNet/IP. 16 DI/16 DO.', '{"inputs": "array[bool]", "outputs": "array[bool]", "counters": "array[int]"}', 502, 'poll', ARRAY['plc','abb','modbus','profinet','ethernet'], '{"host": "0.0.0.0", "port": 502}'),

('Advantech ADAM-6050', 'Advantech', 'Advantech', 'ADAM-6050', 'Controladores PLC', 'Modbus TCP/MQTT', 'Módulo I/O remoto Ethernet com 18 DI e 8 DO. Modbus TCP, suporte a Node-RED e MQTT. DIN Rail.', '{"digital_inputs": "array[bool]", "digital_outputs": "array[bool]", "counter_values": "array[int]"}', 502, 'poll', ARRAY['modbus','io-remoto','ethernet','din-rail','advantech'], '{"host": "0.0.0.0", "port": 502, "unit_id": 1}'),

-- ══════════════════════════════════════════════════════════════
-- SENSORES DE NÍVEL
-- ══════════════════════════════════════════════════════════════

('Dragino LDDS75', 'Dragino', 'Dragino', 'LDDS75', 'Sensores de Nível', 'LoRaWAN', 'Sensor de nível ultrassônico LoRaWAN. Alcance 0.2m a 7.5m. Ideal para tanques, rios e reservatórios.', '{"distance": "float (mm)", "level_percent": "float (%)", "battery": "float (V)"}', 1700, 'push', ARRAY['lorawan','nivel','ultrassonico','tanque','reservatorio'], '{}'),

('Milesight EM500-UDL', 'Milesight', 'Milesight', 'EM500-UDL', 'Sensores de Nível', 'LoRaWAN', 'Sensor de distância/nível ultrassônico LoRaWAN. Alcance 0.3m a 5m. IP67. Temperatura -40°C a +85°C.', '{"distance": "float (mm)", "battery": "int (%)", "temperature": "float (°C)"}', 1700, 'push', ARRAY['lorawan','nivel','ultrassonico','ip67','industrial'], '{}'),

('Elsys ELT-2 HP', 'Elsys', 'Elsys', 'ELT-2-HP', 'Sensores de Nível', 'LoRaWAN', 'Sensor de pressão hidrostática LoRaWAN para medição de nível em tanques e poços. Precisão ±0.1%.', '{"pressure": "float (bar)", "level": "float (m)", "temperature": "float (°C)", "battery": "float (V)"}', 1700, 'push', ARRAY['lorawan','nivel','pressao','hidrostatico','poco'], '{}'),

-- ══════════════════════════════════════════════════════════════
-- CONTROLE DE ACESSO
-- ══════════════════════════════════════════════════════════════

('HID Global OMNIKEY 5427', 'HID Global', 'HID Global', 'R54270001', 'Controle de Acesso', 'TCP/MQTT', 'Leitor RFID/NFC desktop USB. Suporte a cartões iCLASS, MIFARE, DESFire. SDK disponível.', '{"card_id": "string", "card_type": "string", "access_granted": "bool", "timestamp": "string"}', 0, 'push', ARRAY['rfid','nfc','usb','controle-acesso','hid'], '{}'),

('ZKTeco F22', 'ZKTeco', 'ZKTeco', 'F22', 'Controle de Acesso', 'TCP/MQTT', 'Controle de acesso biométrico com leitor de impressão digital e RFID. Capacidade 3000 usuários. TCP/IP.', '{"user_id": "string", "access_type": "string", "access_granted": "bool", "door_status": "bool", "temperature": "float (°C)"}', 4370, 'push', ARRAY['biometrico','rfid','controle-acesso','tcp','zkteco'], '{"host": "0.0.0.0", "port": 4370}'),

('Paxton Net2 Plus', 'Paxton', 'Paxton', 'Net2-Plus', 'Controle de Acesso', 'TCP/MQTT', 'Controlador de acesso em rede. Suporte a 50.000 usuários, 2 portas, integração com CCTV e alarmes.', '{"door_id": "int", "user_id": "string", "access_granted": "bool", "door_status": "bool", "alarm": "bool"}', 8025, 'push', ARRAY['controle-acesso','rede','cctv','alarme','paxton'], '{}'),

-- ══════════════════════════════════════════════════════════════
-- SENSORES AGRÍCOLAS
-- ══════════════════════════════════════════════════════════════

('Dragino LSE01', 'Dragino', 'Dragino', 'LSE01', 'Sensores Agrícolas', 'LoRaWAN', 'Sensor de solo LoRaWAN: umidade, temperatura e condutividade elétrica. Profundidade até 30cm. Bateria 3 anos.', '{"soil_moisture": "float (%VWC)", "soil_temperature": "float (°C)", "soil_conductivity": "float (µS/cm)", "battery": "float (V)"}', 1700, 'push', ARRAY['lorawan','solo','umidade','temperatura','agricultura'], '{}'),

('Milesight EM500-SMTC', 'Milesight', 'Milesight', 'EM500-SMTC', 'Sensores Agrícolas', 'LoRaWAN', 'Sensor de solo LoRaWAN 3-em-1: umidade, temperatura e condutividade. IP68. Suporte a 3 sondas.', '{"soil_moisture": "float (%)", "soil_temperature": "float (°C)", "soil_ec": "float (µS/cm)"}', 1700, 'push', ARRAY['lorawan','solo','umidade','temperatura','ip68','3sondas'], '{}'),

('Davis Instruments Envoy8X', 'Davis Instruments', 'Davis Instruments', 'Envoy8X', 'Sensores Agrícolas', 'TCP/MQTT', 'Estação meteorológica profissional. Temperatura, umidade, pressão, vento, chuva, radiação solar, UV.', '{"temperature": "float (°C)", "humidity": "float (%RH)", "pressure": "float (hPa)", "wind_speed": "float (km/h)", "wind_direction": "float (°)", "rainfall": "float (mm)", "solar_radiation": "float (W/m²)", "uv_index": "float"}', 22222, 'push', ARRAY['meteorologia','temperatura','umidade','vento','chuva','solar'], '{"host": "0.0.0.0", "port": 22222}'),

-- ══════════════════════════════════════════════════════════════
-- WEARABLES E RASTREAMENTO PESSOAL
-- ══════════════════════════════════════════════════════════════

('Milesight WT101', 'Milesight', 'Milesight', 'WT101', 'Wearables', 'LoRaWAN', 'Wearable LoRaWAN para monitoramento de trabalhadores. Queda, SOS, temperatura corporal, localização indoor.', '{"sos": "bool", "fall_detected": "bool", "body_temperature": "float (°C)", "steps": "int", "battery": "int (%)"}', 1700, 'push', ARRAY['lorawan','wearable','trabalhador','sos','queda','temperatura'], '{}'),

('Garmin inReach Mini 2', 'Garmin', 'Garmin', 'inReach Mini 2', 'Wearables', 'Satellite/MQTT', 'Comunicador satelital bidirecional com GPS. Envio de mensagens e localização via satélite Iridium. SOS global.', '{"latitude": "float", "longitude": "float", "sos": "bool", "battery": "int (%)", "message": "string"}', 0, 'push', ARRAY['satelite','gps','sos','global','garmin'], '{}'),

-- ══════════════════════════════════════════════════════════════
-- SMART HOME / AUTOMAÇÃO RESIDENCIAL
-- ══════════════════════════════════════════════════════════════

('Shelly Plus 2PM', 'Shelly', 'Shelly', 'SNSW-002P16EU', 'Smart Home', 'Wi-Fi/MQTT', 'Relé duplo Wi-Fi com medição de potência. Controle de 2 cargas independentes. Suporte a persianas/cortinas.', '{"output_1": "bool", "output_2": "bool", "power_1": "float (W)", "power_2": "float (W)", "energy_1": "float (kWh)", "energy_2": "float (kWh)"}', 1883, 'push', ARRAY['wifi','mqtt','rele','potencia','persiana','smarthome'], '{"broker": "mqtt://broker:1883", "topic": "shellies/{id}/relay/0"}'),

('Sonoff NSPanel Pro', 'ITEAD', 'Sonoff', 'NSPanel Pro', 'Smart Home', 'Wi-Fi/MQTT', 'Painel de controle inteligente com display 3.95" touchscreen. Controle de cenas, temperatura, câmeras.', '{"temperature": "float (°C)", "humidity": "float (%RH)", "scene_triggered": "string", "relay_status": "array[bool]"}', 1883, 'push', ARRAY['wifi','mqtt','painel','touchscreen','cenas','smarthome'], '{}'),

('Philips Hue Bridge', 'Philips', 'Philips', 'BSB002', 'Smart Home', 'HTTP', 'Hub central Philips Hue. Controla até 50 lâmpadas via API REST local. Integração com Alexa, Google, Apple HomeKit.', '{"lights_on": "int", "total_lights": "int", "scenes_active": "string", "energy_usage": "float (W)"}', 80, 'poll', ARRAY['http','zigbee','iluminacao','api','smarthome','philips'], '{"host": "0.0.0.0", "port": 80, "path": "/api/{username}/lights"}'),

-- ══════════════════════════════════════════════════════════════
-- FROTAS ESPECIAIS
-- ══════════════════════════════════════════════════════════════

('Teltonika TFT100', 'Teltonika', 'Teltonika', 'TFT100', 'Frotas Especiais', 'TCP/MQTT', 'Rastreador para motocicletas. Impermeável IP67, anti-roubo, detecção de queda. LTE Cat-M1.', '{"latitude": "float", "longitude": "float", "speed": "float (km/h)", "fall_detected": "bool", "ignition": "bool", "battery": "float (V)"}', 5027, 'push', ARRAY['gps','moto','ip67','queda','lte','teltonika'], '{"server": "0.0.0.0", "port": 5027}'),

('Teltonika TMT250', 'Teltonika', 'Teltonika', 'TMT250', 'Frotas Especiais', 'TCP/MQTT', 'Rastreador pessoal 4G com botão SOS, sensor de queda e monitoramento de temperatura. Bateria 7 dias.', '{"latitude": "float", "longitude": "float", "sos": "bool", "fall_detected": "bool", "temperature": "float (°C)", "battery": "int (%)"}', 5027, 'push', ARRAY['gps','pessoal','sos','queda','temperatura','4g'], '{"server": "0.0.0.0", "port": 5027}'),

('Queclink GL520MG', 'Queclink', 'Queclink', 'GL520MG', 'Frotas Especiais', 'TCP/UDP', 'Rastreador de ativos com bateria de 3 anos. Modo sleep inteligente. Ideal para containers e equipamentos.', '{"latitude": "float", "longitude": "float", "battery": "float (V)", "temperature": "float (°C)", "shock": "bool"}', 5093, 'push', ARRAY['gps','ativo','container','bateria-longa','queclink'], '{"server": "0.0.0.0", "port": 5093}');

-- Verificar resultado
SELECT category, COUNT(*) as total FROM device_models GROUP BY category ORDER BY category;
