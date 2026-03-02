import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { modelsApi, devicesApi } from '../services/api'
import { Search, Plus, Cpu, Radio, Wifi, Bluetooth, Signal, Loader2, X, Check, Zap, MapPin, AlertTriangle, Eye, Wind, Droplets, Shield, Leaf, Watch, Home, Truck } from 'lucide-react'

const PROTOCOL_COLORS: Record<string, string> = {
  'LoRaWAN': 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  'MQTT': 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  'Wi-Fi/MQTT': 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  'Wi-Fi': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'TCP': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  'TCP/MQTT': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  'TCP/UDP': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  'Modbus TCP': 'text-red-400 bg-red-500/10 border-red-500/20',
  'Modbus RTU': 'text-red-400 bg-red-500/10 border-red-500/20',
  'Modbus TCP/MQTT': 'text-red-400 bg-red-500/10 border-red-500/20',
  'HTTP': 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  'ONVIF/RTSP': 'text-pink-400 bg-pink-500/10 border-pink-500/20',
  'Zigbee': 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  'Z-Wave': 'text-lime-400 bg-lime-500/10 border-lime-500/20',
  'Bluetooth': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'LTE': 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  'Satellite/MQTT': 'text-violet-400 bg-violet-500/10 border-violet-500/20',
}

const CATEGORY_ICONS: Record<string, any> = {
  'Temperatura e Umidade': Droplets,
  'Rastreadores GPS': MapPin,
  'Botões de Pânico': AlertTriangle,
  'Sensores de Movimento': Eye,
  'Gateways IoT': Radio,
  'Sensores de Gás': Wind,
  'Medidores de Energia': Zap,
  'Câmeras IP': Shield,
  'Controladores PLC': Cpu,
  'Sensores de Nível': Droplets,
  'Controle de Acesso': Shield,
  'Sensores Agrícolas': Leaf,
  'Wearables': Watch,
  'Smart Home': Home,
  'Frotas Especiais': Truck,
}

const CATEGORY_EMOJI: Record<string, string> = {
  'Temperatura e Umidade': '🌡️',
  'Rastreadores GPS': '📍',
  'Botões de Pânico': '🆘',
  'Sensores de Movimento': '👁️',
  'Gateways IoT': '🔀',
  'Sensores de Gás': '💨',
  'Medidores de Energia': '⚡',
  'Câmeras IP': '📷',
  'Controladores PLC': '🔧',
  'Sensores de Nível': '📊',
  'Controle de Acesso': '🔐',
  'Sensores Agrícolas': '🌱',
  'Wearables': '⌚',
  'Smart Home': '🏠',
  'Frotas Especiais': '🚛',
}

interface AddForm { name: string; identifier: string; protocol: string; type: string; notes: string }

export default function DeviceLibrary() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [protocol, setProtocol] = useState('')
  const [brand, setBrand] = useState('')
  const [selected, setSelected] = useState<any>(null)
  const [form, setForm] = useState<AddForm>({ name: '', identifier: '', protocol: '', type: 'iot', notes: '' })
  const [success, setSuccess] = useState(false)

  const { data: models = [] } = useQuery({
    queryKey: ['models', search, category, protocol],
    queryFn: () => modelsApi.list({ search: search || undefined, category: category || undefined, protocol: protocol || undefined }).then(r => r.data)
  })

  const { data: cats = [] } = useQuery({
    queryKey: ['cats'],
    queryFn: () => modelsApi.categories().then(r => r.data)
  })

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => modelsApi.brands().then(r => r.data)
  })

  const add = useMutation({
    mutationFn: (data: any) => devicesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      setSuccess(true)
      setTimeout(() => { setSelected(null); setSuccess(false) }, 2000)
    },
  })

  const openModel = (m: any) => {
    setSelected(m)
    setSuccess(false)
    setForm({
      name: m.name,
      identifier: '',
      protocol: m.protocol || 'mqtt',
      type: m.category?.toLowerCase().includes('tracker') || m.category?.toLowerCase().includes('rastreador') || m.category?.toLowerCase().includes('frota') ? 'tracker' : 'iot',
      notes: ''
    })
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    add.mutate({ ...form, modelId: selected.id })
  }

  // Filtrar por marca no frontend
  const filteredModels = brand ? models.filter((m: any) => m.brand === brand) : models

  // Agrupar por categoria
  const grouped = filteredModels.reduce((acc: any, m: any) => {
    if (!acc[m.category]) acc[m.category] = []
    acc[m.category].push(m)
    return acc
  }, {})

  // Protocolos únicos
  const protocols = [...new Set(models.map((m: any) => m.protocol))].sort() as string[]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Biblioteca de Dispositivos</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {filteredModels.length} modelos · {cats.length} categorias · {brands.length} fabricantes — plug &amp; play
          </p>
        </div>
      </div>

      {/* Stats por categoria */}
      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-2">
        {cats.map((cat: any) => {
          const Icon = CATEGORY_ICONS[cat.category] || Cpu
          return (
            <button
              key={cat.category}
              onClick={() => setCategory(category === cat.category ? '' : cat.category)}
              className={`p-3 rounded-xl border text-center transition-all ${
                category === cat.category
                  ? 'border-cyan-500 bg-cyan-500/10'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
            >
              <div className="text-xl mb-1">{CATEGORY_EMOJI[cat.category] || '📦'}</div>
              <div className="text-xs text-gray-400 font-medium leading-tight truncate">{cat.category.split(' ')[0]}</div>
              <div className="text-cyan-400 text-xs font-bold mt-0.5">{cat.count}</div>
            </button>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, marca, modelo, descrição..."
              className="input pl-9 w-full"
            />
          </div>
          <select value={protocol} onChange={e => setProtocol(e.target.value)} className="input">
            <option value="">Todos os Protocolos</option>
            {protocols.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={brand} onChange={e => setBrand(e.target.value)} className="input">
            <option value="">Todos os Fabricantes</option>
            {brands.map((b: any) => <option key={b.brand} value={b.brand}>{b.brand} ({b.count})</option>)}
          </select>
        </div>

        {/* Filtros ativos */}
        {(category || protocol || brand || search) && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-gray-500 text-xs">Filtros:</span>
            {category && <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs flex items-center gap-1">{CATEGORY_EMOJI[category]} {category} <button onClick={() => setCategory('')} className="hover:text-white">×</button></span>}
            {protocol && <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs flex items-center gap-1">{protocol} <button onClick={() => setProtocol('')} className="hover:text-white">×</button></span>}
            {brand && <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs flex items-center gap-1">{brand} <button onClick={() => setBrand('')} className="hover:text-white">×</button></span>}
            {search && <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs flex items-center gap-1">"{search}" <button onClick={() => setSearch('')} className="hover:text-white">×</button></span>}
            <button onClick={() => { setCategory(''); setProtocol(''); setBrand(''); setSearch('') }} className="text-gray-500 hover:text-gray-300 text-xs underline">Limpar tudo</button>
          </div>
        )}
      </div>

      {/* Grid por categoria */}
      {Object.entries(grouped).map(([cat, items]: any) => (
        <div key={cat}>
          <h2 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
            <span>{CATEGORY_EMOJI[cat] || '📦'}</span>
            <span>{cat}</span>
            <span className="text-gray-600">({items.length})</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((m: any) => {
              const protoClass = PROTOCOL_COLORS[m.protocol] || 'text-gray-400 bg-gray-500/10 border-gray-500/20'
              return (
                <div
                  key={m.id}
                  className="card p-5 hover:border-gray-600 transition-all cursor-pointer group"
                  onClick={() => openModel(m)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg border ${protoClass}`}>
                        {(() => { const Icon = CATEGORY_ICONS[m.category] || Cpu; return <Icon size={18} /> })()}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-200 text-sm leading-tight">{m.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {m.brand && <span className="font-medium text-gray-400">{m.brand}</span>}
                          {m.brand && m.model_number && <span className="text-gray-600"> · </span>}
                          {m.model_number && <span className="font-mono">{m.model_number}</span>}
                        </p>
                      </div>
                    </div>
                    <button className="opacity-0 group-hover:opacity-100 transition-opacity btn-primary py-1 px-3 text-xs flex items-center gap-1">
                      <Plus size={13} /> Usar
                    </button>
                  </div>

                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{m.description}</p>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${protoClass}`}>{m.protocol}</span>
                    {m.default_port && m.default_port > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 font-mono">:{m.default_port}</span>
                    )}
                    {(m.data_types || []).slice(0, 2).map((dt: string) => (
                      <span key={dt} className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">{dt.replace(/_/g, ' ')}</span>
                    ))}
                    {(m.data_types || []).length > 2 && (
                      <span className="text-xs text-gray-600">+{m.data_types.length - 2}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {filteredModels.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-gray-400">Nenhum dispositivo encontrado.</p>
          <button onClick={() => { setSearch(''); setCategory(''); setProtocol(''); setBrand('') }} className="mt-3 text-cyan-400 hover:text-cyan-300 text-sm">
            Limpar filtros
          </button>
        </div>
      )}

      {/* Modal Adicionar */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <div className="text-3xl">{CATEGORY_EMOJI[selected.category] || '📦'}</div>
                <div>
                  <h3 className="font-semibold text-white">{selected.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selected.brand && <span>{selected.brand}</span>}
                    {selected.model_number && <span> · {selected.model_number}</span>}
                    {' · '}{selected.protocol}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
            </div>

            {success ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
                  <Check size={32} className="text-green-400" />
                </div>
                <p className="text-green-400 font-semibold">Dispositivo adicionado com sucesso!</p>
                <p className="text-gray-500 text-sm mt-1">Configure o IP e porta na aba de Conexão.</p>
              </div>
            ) : (
              <div className="p-6 space-y-5">
                {/* Specs do modelo */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-800 rounded-xl p-3 text-center">
                    <p className="text-gray-500 text-xs mb-1">Protocolo</p>
                    <p className="text-white text-sm font-medium">{selected.protocol}</p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-3 text-center">
                    <p className="text-gray-500 text-xs mb-1">Porta Padrão</p>
                    <p className="text-cyan-400 font-mono text-sm font-medium">
                      {selected.default_port && selected.default_port > 0 ? selected.default_port : 'N/A'}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-3 text-center">
                    <p className="text-gray-500 text-xs mb-1">Modo</p>
                    <p className="text-white text-sm font-medium capitalize">{selected.communication_type || 'push'}</p>
                  </div>
                </div>

                {/* Dados enviados */}
                <div>
                  <p className="text-gray-500 text-xs uppercase mb-2">Dados enviados</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(selected.data_types || []).map((dt: string) => (
                      <span key={dt} className="text-xs px-2 py-1 bg-cyan-500/10 text-cyan-400 rounded-full border border-cyan-500/20">
                        {dt.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Config template */}
                {selected.config_template && Object.keys(selected.config_template).length > 0 && (
                  <div>
                    <p className="text-gray-500 text-xs uppercase mb-2">Template de Configuração</p>
                    <pre className="bg-gray-800 rounded-xl p-3 text-xs text-green-400 overflow-x-auto">
                      {JSON.stringify(selected.config_template, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Formulário */}
                <form onSubmit={submit} className="space-y-4 pt-2 border-t border-gray-800">
                  <p className="text-gray-400 text-sm font-medium">Cadastrar dispositivo</p>
                  <div>
                    <label className="label">Nome do dispositivo *</label>
                    <input
                      value={form.name}
                      onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      required
                      className="input"
                      placeholder="Ex: Sensor Sala 01"
                    />
                  </div>
                  <div>
                    <label className="label">Identificador único (ID/EUI/MAC/IP/Serial) *</label>
                    <input
                      value={form.identifier}
                      onChange={e => setForm(p => ({ ...p, identifier: e.target.value }))}
                      required
                      className="input font-mono"
                      placeholder="Ex: AA:BB:CC:DD:EE:FF ou 192.168.1.100"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Protocolo</label>
                      <select value={form.protocol} onChange={e => setForm(p => ({ ...p, protocol: e.target.value }))} className="input">
                        {['mqtt', 'lorawan', 'wifi', 'lte', 'bluetooth', 'modbus', 'tcp', 'http', 'zigbee', 'custom'].map(p => (
                          <option key={p} value={p}>{p.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Tipo</label>
                      <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="input">
                        <option value="iot">IoT / Sensor</option>
                        <option value="tracker">Rastreador GPS</option>
                        <option value="actuator">Atuador</option>
                        <option value="gateway">Gateway</option>
                        <option value="camera">Câmera</option>
                        <option value="meter">Medidor</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label">Observações (opcional)</label>
                    <input
                      value={form.notes}
                      onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                      className="input"
                      placeholder="Localização, número de série, observações..."
                    />
                  </div>

                  {add.error && (
                    <p className="text-red-400 text-sm">{(add.error as any).response?.data?.error || 'Erro ao adicionar'}</p>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setSelected(null)} className="btn-secondary flex-1">Cancelar</button>
                    <button type="submit" disabled={add.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                      {add.isPending ? <><Loader2 size={16} className="animate-spin" /> Adicionando...</> : <><Plus size={16} /> Adicionar Dispositivo</>}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
