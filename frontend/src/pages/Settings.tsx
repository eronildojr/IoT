import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiKeysApi } from '../services/api'
import { useAuth } from '../store/auth'
import { Settings as SettingsIcon, Key, Plus, Trash2, Copy, Check, X, Loader2, Eye, EyeOff } from 'lucide-react'

export default function Settings() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'profile' | 'api'>('profile')
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})

  const { data: apiKeys = [] } = useQuery({ queryKey: ['api-keys'], queryFn: () => apiKeysApi.list().then(r => r.data) })

  const createKey = useMutation({
    mutationFn: (d: any) => apiKeysApi.create(d),
    onSuccess: (r) => { setCreatedKey(r.data.key); qc.invalidateQueries({ queryKey: ['api-keys'] }); setNewKeyName('') },
  })
  const delKey = useMutation({
    mutationFn: (id: string) => apiKeysApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="page-header">
        <h1 className="page-title">Configurações</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        {(['profile', 'api'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20' : 'text-gray-500 hover:text-gray-300'}`}>
            {t === 'profile' ? '👤 Perfil' : '🔑 API Keys'}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="space-y-4 max-w-lg">
          <div className="card p-6 space-y-4">
            <h3 className="font-semibold text-white">Informações da Conta</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Nome', value: user?.name },
                { label: 'E-mail', value: user?.email },
                { label: 'Organização', value: user?.tenantName },
                { label: 'Perfil', value: user?.role },
                { label: 'Plano', value: user?.plan },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="text-gray-200 font-medium">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <h3 className="font-semibold text-white mb-4">Documentação da API</h3>
            <div className="space-y-3 text-sm text-gray-400">
              <p>Use as API Keys para integrar dispositivos e sistemas externos com a plataforma.</p>
              <div className="bg-gray-800 rounded-lg p-4 font-mono text-xs space-y-2">
                <p className="text-gray-500"># Enviar telemetria de um dispositivo</p>
                <p className="text-cyan-400">POST /api/devices/:deviceId/telemetry</p>
                <p className="text-gray-500">Authorization: Bearer {'<sua-api-key>'}</p>
                <p className="text-gray-300">{'{"data": {"temperature": 25.5, "humidity": 60}}'}</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 font-mono text-xs space-y-2">
                <p className="text-gray-500"># Listar dispositivos</p>
                <p className="text-cyan-400">GET /api/devices</p>
                <p className="text-gray-500">Authorization: Bearer {'<sua-api-key>'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'api' && (
        <div className="space-y-4 max-w-2xl">
          {/* Criar nova key */}
          <div className="card p-5">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2"><Key size={16} className="text-cyan-400" /> Criar Nova API Key</h3>
            <div className="flex gap-3">
              <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Nome da key (ex: Sensor Sala A)" className="input flex-1" />
              <button onClick={() => createKey.mutate({ name: newKeyName })} disabled={!newKeyName || createKey.isPending} className="btn-primary flex items-center gap-2 flex-shrink-0">
                {createKey.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Criar
              </button>
            </div>

            {createdKey && (
              <div className="mt-4 bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <p className="text-green-400 text-sm font-semibold mb-2">✓ API Key criada! Copie agora — não será exibida novamente.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono text-gray-300 bg-gray-800 rounded px-3 py-2 break-all">{createdKey}</code>
                  <button onClick={() => copy(createdKey)} className="p-2 text-gray-400 hover:text-green-400 transition-colors flex-shrink-0">
                    {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                  </button>
                </div>
                <button onClick={() => setCreatedKey(null)} className="text-xs text-gray-500 hover:text-gray-400 mt-2">Fechar</button>
              </div>
            )}
          </div>

          {/* Lista de keys */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-gray-800">
              <h3 className="font-semibold text-white text-sm">{apiKeys.length} API Keys ativas</h3>
            </div>
            {apiKeys.length === 0 ? (
              <div className="p-8 text-center text-gray-600">
                <Key size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma API key criada</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {apiKeys.map((k: any) => (
                  <div key={k.id} className="flex items-center gap-4 px-5 py-3">
                    <Key size={16} className="text-gray-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-200 text-sm">{k.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <code className="text-xs font-mono text-gray-500">
                          {showKeys[k.id] ? k.key_preview : `${k.key_preview?.substring(0, 12)}...`}
                        </code>
                        <button onClick={() => setShowKeys(p => ({ ...p, [k.id]: !p[k.id] }))} className="text-gray-600 hover:text-gray-400">
                          {showKeys[k.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">Criada: {new Date(k.created_at).toLocaleDateString('pt-BR')} · Último uso: {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString('pt-BR') : 'Nunca'}</p>
                    </div>
                    <button onClick={() => { if (confirm('Revogar esta API key?')) delKey.mutate(k.id) }} className="p-1.5 text-gray-600 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
