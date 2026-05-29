import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { devicesApi } from '../services/api'
import { Link } from 'react-router-dom'
import { Plus, Search, Cpu, Wifi, WifiOff, AlertTriangle, Trash2, Edit, RefreshCw, MapPin, Radio, Copy, Eye, EyeOff, Send, Activity } from 'lucide-react'

const statusBadge: Record<string, string> = {
  online: 'badge-online', offline: 'badge-offline', warning: 'badge-warning', error: 'badge-error', provisioning: 'badge-warning'
}
const statusDot: Record<string, string> = {
  online: 'bg-green-400 shadow-green-400/50 shadow-sm', offline: 'bg-gray-600', warning: 'bg-yellow-400', error: 'bg-red-400', provisioning: 'bg-blue-400'
}
const protocolColor: Record<string, string> = {
  mqtt: 'text-cyan-400 bg-cyan-500/10', lorawan: 'text-purple-400 bg-purple-500/10', wifi: 'text-blue-400 bg-blue-500/10',
  lte: 'text-green-400 bg-green-500/10', bluetooth: 'text-indigo-400 bg-indigo-500/10', custom: 'text-gray-400 bg-gray-500/10'
}

export default function Devices() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [protocol, setProtocol] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showMqtt, setShowMqtt] = useState<string | null>(null)
  const [showPwd, setShowPwd] = useState(false)
  const [editDevice, setEditDevice] = useState<any>(null)
  const [form, setForm] = useState({ name: '', identifier: '', protocol: 'mqtt', type: 'iot', location: '', notes: '', modelId: '' })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['devices', search, status, protocol],
    queryFn: () => devicesApi.list({ search: search || undefined, status: status || undefined, protocol: protocol || undefined, limit: 50 }).then(r => r.data),
  })
  const { data: stats } = useQuery({ queryKey: ['devices-stats'], queryFn: () => devicesApi.stats().then(r => r.data) })
  const { data: models } = useQuery({ queryKey: ['device-models'], queryFn: () => devicesApi.listModels({ limit: 100 }).then(r => r.data) })
  const { data: mqttInfo } = useQuery({
    queryKey: ['mqtt-topics', showMqtt],
    queryFn: () => showMqtt ? devicesApi.mqttTopics(showMqtt).then(r => r.data) : null,
    enabled: !!showMqtt,
  })

  const del = useMutation({
    mutationFn: (id: string) => devicesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  })
  const create = useMutation({
    mutationFn: (d: any) => devicesApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); setShowCreate(false); setForm({ name: '', identifier: '', protocol: 'mqtt', type: 'iot', location: '', notes: '', modelId: '' }) },
  })

  const devices: any[] = data?.devices || []

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Cpu className="w-7 h-7 text-cyan-400" /> Dispositivos IoT</h1>
          <p className="text-gray-400 text-sm mt-1">Gerencie equipamentos MQTT, LoRaWAN, WiFi e mais</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Novo Dispositivo
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'text-white' },
            { label: 'Online', value: stats.online, color: 'text-green-400' },
            { label: 'Offline', value: stats.offline, color: 'text-gray-400' },
            { label: 'Alerta', value: stats.warning, color: 'text-yellow-400' },
            { label: 'Erro', value: stats.error, color: 'text-red-400' },
            { label: 'Rastreadores', value: stats.trackers, color: 'text-blue-400' },
            { label: 'Bateria Baixa', value: stats.low_battery, color: 'text-orange-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/50 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar dispositivo..." className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500" />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500">
          <option value="">Todos os status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="warning">Alerta</option>
          <option value="error">Erro</option>
        </select>
        <select value={protocol} onChange={e => setProtocol(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500">
          <option value="">Todos os protocolos</option>
          <option value="mqtt">MQTT</option>
          <option value="lorawan">LoRaWAN</option>
          <option value="wifi">WiFi</option>
          <option value="lte">LTE</option>
          <option value="bluetooth">Bluetooth</option>
        </select>
        <button onClick={() => refetch()} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg text-sm transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : devices.length === 0 ? (
        <div className="text-center py-16 bg-gray-800/40 rounded-2xl border border-dashed border-gray-700">
          <Cpu className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">Nenhum dispositivo cadastrado</p>
          <p className="text-gray-500 text-sm mt-1">Clique em "Novo Dispositivo" para adicionar o primeiro equipamento</p>
          <button onClick={() => setShowCreate(true)} className="mt-4 flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors mx-auto">
            <Plus className="w-4 h-4" /> Adicionar Dispositivo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {devices.map((d: any) => (
            <div key={d.id} className="bg-gray-800/60 rounded-xl border border-gray-700/50 p-4 hover:border-gray-600 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center">
                      <Cpu className="w-5 h-5 text-cyan-400" />
                    </div>
                    <span className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-gray-800 ${statusDot[d.status] || 'bg-gray-600'}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">{d.name}</h3>
                    <p className="text-xs text-gray-400 font-mono">{d.identifier}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${protocolColor[d.protocol] || 'text-gray-400 bg-gray-700'}`}>
                  {d.protocol?.toUpperCase()}
                </span>
              </div>

              {d.location && (
                <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
                  <MapPin className="w-3 h-3" /> {d.location}
                </div>
              )}

              {d.last_seen_at && (
                <div className="flex items-center gap-1 text-xs text-gray-500 mb-3">
                  <Activity className="w-3 h-3" /> Último: {new Date(d.last_seen_at).toLocaleString()}
                </div>
              )}

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700/50">
                <Link to={`/devices/${d.id}`} className="flex-1 text-center text-xs bg-gray-700 hover:bg-gray-600 text-white py-1.5 rounded-lg transition-colors">
                  Detalhes
                </Link>
                {d.protocol === 'mqtt' && (
                  <button onClick={() => setShowMqtt(d.id)} className="flex items-center gap-1 text-xs bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 px-2 py-1.5 rounded-lg transition-colors">
                    <Radio className="w-3 h-3" /> MQTT
                  </button>
                )}
                <button onClick={() => { if (confirm(`Excluir "${d.name}"?`)) del.mutate(d.id) }} className="text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1.5 rounded-lg transition-colors">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Criar Dispositivo */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-700">
              <h2 className="text-lg font-bold text-white">Novo Dispositivo IoT</h2>
              <p className="text-gray-400 text-sm mt-1">Preencha os dados do equipamento</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Nome do Dispositivo *</label>
                  <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Ex: Sensor Temperatura Sala 01" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Identificador Único * <span className="text-gray-500">(usado no tópico MQTT)</span></label>
                  <input value={form.identifier} onChange={e => setForm(f => ({...f, identifier: e.target.value.replace(/\s/g, '_').toLowerCase()}))} placeholder="Ex: sensor_temp_sala01" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Protocolo *</label>
                  <select value={form.protocol} onChange={e => setForm(f => ({...f, protocol: e.target.value}))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500">
                    <option value="mqtt">MQTT</option>
                    <option value="lorawan">LoRaWAN</option>
                    <option value="wifi">WiFi</option>
                    <option value="lte">LTE/4G</option>
                    <option value="bluetooth">Bluetooth</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Tipo</label>
                  <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500">
                    <option value="iot">IoT Genérico</option>
                    <option value="sensor">Sensor</option>
                    <option value="actuator">Atuador</option>
                    <option value="gateway">Gateway</option>
                    <option value="tracker">Rastreador</option>
                    <option value="camera">Câmera</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Localização</label>
                  <input value={form.location} onChange={e => setForm(f => ({...f, location: e.target.value}))} placeholder="Ex: Sala Principal, Galpão A, Veículo 01" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Modelo (opcional)</label>
                  <select value={form.modelId} onChange={e => setForm(f => ({...f, modelId: e.target.value}))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500">
                    <option value="">Selecionar modelo...</option>
                    {(models || []).map((m: any) => (
                      <option key={m.id} value={m.id}>{m.name} — {m.brand || 'Generic'}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Observações</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} rows={2} placeholder="Informações adicionais..." className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none" />
                </div>
              </div>
              {form.protocol === 'mqtt' && form.identifier && (
                <div className="bg-cyan-950/40 border border-cyan-800/40 rounded-xl p-4">
                  <p className="text-xs font-semibold text-cyan-400 mb-2 flex items-center gap-1"><Radio className="w-3 h-3" /> Tópicos MQTT que serão gerados</p>
                  <div className="space-y-1 font-mono text-xs text-gray-300">
                    <div><span className="text-gray-500">Telemetria: </span>iot/[tenant_id]/{form.identifier}/telemetry</div>
                    <div><span className="text-gray-500">Comando:    </span>iot/[tenant_id]/{form.identifier}/command</div>
                    <div><span className="text-gray-500">Status:     </span>iot/[tenant_id]/{form.identifier}/status</div>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-700 flex gap-3 justify-end">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={() => create.mutate({ ...form, modelId: form.modelId || undefined })} disabled={!form.name || !form.identifier || create.isPending} className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors">
                {create.isPending ? 'Criando...' : 'Criar Dispositivo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal MQTT Topics */}
      {showMqtt && mqttInfo && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg">
            <div className="p-6 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2"><Radio className="w-5 h-5 text-cyan-400" /> Configuração MQTT</h2>
                <p className="text-gray-400 text-sm mt-1 font-mono">{mqttInfo.identifier}</p>
              </div>
              <button onClick={() => setShowMqtt(null)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Credenciais */}
              <div className="bg-gray-800 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Credenciais do Broker</p>
                {[
                  { label: 'Host', value: mqttInfo.credentials?.host },
                  { label: 'Porta MQTT', value: String(mqttInfo.credentials?.port) },
                  { label: 'Porta WebSocket', value: String(mqttInfo.credentials?.websocket_port) },
                  { label: 'Usuário', value: mqttInfo.credentials?.username },
                  { label: 'Senha', value: mqttInfo.credentials?.password, secret: true },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{item.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-white">
                        {item.secret && !showPwd ? '••••••••' : item.value}
                      </span>
                      {item.secret && (
                        <button onClick={() => setShowPwd(!showPwd)} className="text-gray-400 hover:text-white">
                          {showPwd ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      )}
                      <button onClick={() => copyText(item.value || '')} className="text-gray-400 hover:text-cyan-400">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tópicos */}
              <div className="bg-gray-800 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Tópicos MQTT</p>
                {[
                  { label: 'Telemetria (publicar dados)', value: mqttInfo.topics?.telemetry, color: 'text-green-400' },
                  { label: 'Comandos (receber)', value: mqttInfo.topics?.command, color: 'text-yellow-400' },
                  { label: 'Status (conexão)', value: mqttInfo.topics?.status, color: 'text-blue-400' },
                ].map(item => (
                  <div key={item.label}>
                    <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                    <div className="flex items-center justify-between bg-gray-900 rounded-lg px-3 py-2">
                      <span className={`text-xs font-mono ${item.color}`}>{item.value}</span>
                      <button onClick={() => copyText(item.value || '')} className="text-gray-400 hover:text-cyan-400 ml-2">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Exemplo de payload */}
              <div className="bg-gray-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Exemplo de Payload</p>
                <pre className="text-xs font-mono text-cyan-300 bg-gray-900 rounded-lg p-3 overflow-x-auto">
{JSON.stringify(mqttInfo.example_payload, null, 2)}
                </pre>
              </div>
            </div>
            <div className="p-6 border-t border-gray-700 flex justify-end">
              <button onClick={() => setShowMqtt(null)} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
