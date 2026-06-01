#!/usr/bin/env python3
"""
Microserviço DeepFace para reconhecimento facial
Porta: 5001
Endpoint: POST /compare { face_url: string, top_n: int }
"""
from flask import Flask, request, jsonify
import os, requests, tempfile, traceback, json
from io import BytesIO

app = Flask(__name__)

# Lazy import para não travar na inicialização
deepface = None
np = None

def get_deepface():
    global deepface, np
    if deepface is None:
        from deepface import DeepFace
        import numpy as np_module
        deepface = DeepFace
        np = np_module
    return deepface

FACES_DIR = os.environ.get('FACES_DIR', '/app/data/faces')
DB_PATH = os.environ.get('DB_PATH', '/app/data/face_db')

def download_image(url: str) -> str:
    """Baixa imagem de uma URL e salva em arquivo temporário. Retorna o caminho."""
    if url.startswith('/'):
        # URL relativa — montar caminho absoluto
        base = os.environ.get('SNAPSHOT_BASE', '/app/data')
        url = base + url
        if os.path.exists(url):
            return url
        raise FileNotFoundError(f"Arquivo não encontrado: {url}")
    
    resp = requests.get(url, timeout=15, verify=False)
    resp.raise_for_status()
    
    suffix = '.jpg'
    if 'png' in resp.headers.get('content-type', ''):
        suffix = '.png'
    
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(resp.content)
    tmp.close()
    return tmp.name

def get_all_persons():
    """Busca todas as pessoas com foto cadastrada no banco."""
    import psycopg2
    db_url = os.environ.get('DATABASE_URL', '')
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("""
        SELECT id, name, photo_url, access_level, department, role
        FROM facial_persons
        WHERE photo_url IS NOT NULL AND photo_url != ''
        ORDER BY id
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [{'id': r[0], 'name': r[1], 'photo_url': r[2], 'access_level': r[3], 'department': r[4], 'role': r[5]} for r in rows]

def update_facial_event(event_id: int, person_id: int, person_name: str, event_type: str, confidence: float):
    """Atualiza o facial_event com o person_id reconhecido."""
    import psycopg2
    db_url = os.environ.get('DATABASE_URL', '')
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("""
        UPDATE facial_events
        SET person_id = %s, event_type = %s, confidence = %s
        WHERE id = %s
    """, (person_id, event_type, confidence, event_id))
    conn.commit()
    cur.close()
    conn.close()

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'deepface'})

@app.route('/compare', methods=['POST'])
def compare():
    try:
        data = request.get_json()
        face_url = data.get('face_url')
        top_n = int(data.get('top_n', 3))
        event_id = data.get('event_id')
        
        if not face_url:
            return jsonify({'error': 'face_url obrigatório'}), 400
        
        DeepFace = get_deepface()
        
        # Baixar a imagem da face detectada
        try:
            face_path = download_image(face_url)
        except Exception as e:
            return jsonify({'error': f'Erro ao baixar imagem: {str(e)}', 'recognized': False, 'matches': []}), 200
        
        # Buscar todas as pessoas cadastradas
        try:
            persons = get_all_persons()
        except Exception as e:
            return jsonify({'error': f'Erro ao buscar pessoas: {str(e)}', 'recognized': False, 'matches': []}), 200
        
        if not persons:
            return jsonify({'recognized': False, 'matches': [], 'message': 'Nenhuma pessoa cadastrada com foto'}), 200
        
        matches = []
        
        for person in persons:
            try:
                # Baixar foto da pessoa cadastrada
                person_path = download_image(person['photo_url'])
                
                # Verificar se são a mesma pessoa
                result = DeepFace.verify(
                    img1_path=face_path,
                    img2_path=person_path,
                    model_name='VGG-Face',
                    distance_metric='cosine',
                    enforce_detection=False
                )
                
                if result.get('verified', False):
                    distance = result.get('distance', 1.0)
                    confidence = round((1 - distance) * 100, 1)
                    matches.append({
                        'person_id': person['id'],
                        'name': person['name'],
                        'confidence': confidence,
                        'access_level': person['access_level'],
                        'department': person['department'],
                        'role': person['role']
                    })
                
                # Limpar arquivo temporário da pessoa
                if person_path != person['photo_url'] and os.path.exists(person_path):
                    os.unlink(person_path)
                    
            except Exception as e:
                print(f"[deepface] Erro ao comparar com {person['name']}: {e}")
                continue
        
        # Limpar arquivo temporário da face detectada
        if os.path.exists(face_path) and face_path.startswith('/tmp'):
            os.unlink(face_path)
        
        # Ordenar por confiança
        matches.sort(key=lambda x: x['confidence'], reverse=True)
        matches = matches[:top_n]
        
        best_match = matches[0] if matches else None
        recognized = best_match is not None and best_match['confidence'] > 55
        
        # Atualizar facial_event se event_id fornecido
        if recognized and best_match and event_id:
            try:
                event_type = 'blocked' if best_match['access_level'] == 'blocked' else 'recognized'
                update_facial_event(event_id, best_match['person_id'], best_match['name'], event_type, best_match['confidence'])
                print(f"[deepface] Evento {event_id} atualizado: {best_match['name']} ({best_match['confidence']}%)")
            except Exception as e:
                print(f"[deepface] Erro ao atualizar evento: {e}")
        
        return jsonify({
            'recognized': recognized,
            'best_match': best_match,
            'matches': matches
        })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e), 'recognized': False, 'matches': []}), 200

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print(f"[deepface] Iniciando serviço na porta {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
