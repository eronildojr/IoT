import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Setting {
  id: number;
  key: string;
  value: string;
  description: string;
  is_secret: boolean;
  category: string;
  updated_at: string;
}

const categoryLabels: Record<string, string> = {
  ai: 'Inteligência Artificial',
  integrations: 'Integrações',
  alerts: 'Alertas & Notificações',
  general: 'Geral',
};

const categoryIcons: Record<string, string> = {
  ai: '🤖',
  integrations: '🔗',
  alerts: '🔔',
  general: '⚙️',
};

export default function Settings() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/api/settings', { withCredentials: true });
      setSettings(res.data.data);
    } catch (err) {
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (key: string, currentValue: string) => {
    setEditing(prev => ({ ...prev, [key]: currentValue === '••••••••' ? '' : currentValue }));
  };

  const handleSave = async (key: string) => {
    const value = editing[key];
    if (value === undefined) return;
    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      await axios.put(`/api/settings/${key}`, { value }, { withCredentials: true });
      setSaved(prev => ({ ...prev, [key]: true }));
      setEditing(prev => { const n = { ...prev }; delete n[key]; return n; });
      await fetchSettings();
      setTimeout(() => setSaved(prev => ({ ...prev, [key]: false })), 2000);
    } catch (err) {
      alert('Erro ao salvar configuração');
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleCancel = (key: string) => {
    setEditing(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const grouped = settings.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {} as Record<string, Setting[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Configurações do Sistema</h1>
        <p className="text-gray-400 mt-1">Gerencie chaves de API, integrações e parâmetros do sistema</p>
      </div>

      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="mb-6 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-700 bg-gray-750">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-xl">{categoryIcons[category] || '⚙️'}</span>
              {categoryLabels[category] || category}
            </h2>
          </div>
          <div className="divide-y divide-gray-700">
            {items.map(setting => (
              <div key={setting.key} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-mono text-blue-400">{setting.key}</span>
                      {setting.is_secret && (
                        <span className="text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded-full">
                          Secreto
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mb-2">{setting.description}</p>
                    
                    {editing[setting.key] !== undefined ? (
                      <div className="flex gap-2 mt-2">
                        <input
                          type={setting.is_secret && !showSecret[setting.key] ? 'password' : 'text'}
                          value={editing[setting.key]}
                          onChange={e => setEditing(prev => ({ ...prev, [setting.key]: e.target.value }))}
                          className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                          placeholder={setting.is_secret ? 'Digite o valor secreto...' : 'Digite o valor...'}
                          autoFocus
                        />
                        {setting.is_secret && (
                          <button
                            onClick={() => setShowSecret(prev => ({ ...prev, [setting.key]: !prev[setting.key] }))}
                            className="px-3 py-2 bg-gray-700 rounded-lg text-gray-300 hover:bg-gray-600 text-sm"
                          >
                            {showSecret[setting.key] ? '🙈' : '👁️'}
                          </button>
                        )}
                        <button
                          onClick={() => handleSave(setting.key)}
                          disabled={saving[setting.key]}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                          {saving[setting.key] ? 'Salvando...' : 'Salvar'}
                        </button>
                        <button
                          onClick={() => handleCancel(setting.key)}
                          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-sm font-mono ${setting.value && setting.value !== '••••••••' ? 'text-green-400' : setting.value === '••••••••' ? 'text-yellow-400' : 'text-gray-500'}`}>
                          {setting.value || '(não configurado)'}
                        </span>
                        {saved[setting.key] && (
                          <span className="text-xs text-green-400">✓ Salvo!</span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {editing[setting.key] === undefined && (
                    <button
                      onClick={() => handleEdit(setting.key, setting.value)}
                      className="shrink-0 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm border border-gray-600"
                    >
                      Editar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* WalkieFleet — rotinas automáticas (Prompt 35-FIX-2) */}
      <div className="mb-6 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-700 bg-gray-750">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="text-xl">📡</span>
            WalkieFleet — Rotinas Automáticas
          </h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex gap-3 items-start">
            <span className="text-xl shrink-0">🔄</span>
            <div>
              <strong className="block text-sm text-white mb-1">Login automático</strong>
              <p className="text-xs text-gray-400 leading-relaxed">
                A sessão conecta automaticamente como USER1 ao abrir a plataforma.
                Não é necessário clicar em "Conectar" manualmente.
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-xl shrink-0">♻️</span>
            <div>
              <strong className="block text-sm text-white mb-1">Reconexão automática</strong>
              <p className="text-xs text-gray-400 leading-relaxed">
                Se a conexão cair, o sistema reconecta sozinho automaticamente,
                com tentativas progressivas (backoff).
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-xl shrink-0">⏰</span>
            <div>
              <strong className="block text-sm text-white mb-1">Reinício programado (12 horas)</strong>
              <p className="text-xs text-gray-400 leading-relaxed">
                A cada 12 horas a sessão do WalkieFleet é reiniciada automaticamente
                para manter o desempenho e liberar memória. Durante o reinício
                (alguns segundos), o áudio e o vídeo ficam momentaneamente
                indisponíveis e a reconexão é automática.
              </p>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-700 bg-blue-900/20">
          <p className="text-xs text-blue-400">
            ℹ️ Estas rotinas garantem que o WalkieFleet permaneça sempre disponível
            e estável, sem necessidade de intervenção manual.
          </p>
        </div>
      </div>

      <div className="mt-4 p-4 bg-blue-900/20 border border-blue-700/30 rounded-xl">
        <p className="text-xs text-blue-400">
          <strong>Nota:</strong> Alterações nas chaves de API entram em vigor imediatamente, sem necessidade de reiniciar o servidor.
          Valores marcados como "Secreto" são mascarados na exibição por segurança.
        </p>
      </div>
    </div>
  );
}
