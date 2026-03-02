import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { modelsApi, devicesApi } from '../services/api'
import { Search, Plus, Cpu, Radio, Wifi, Bluetooth, Signal, Loader2, X, Check } from 'lucide-react'

const protoIcon: Record<string, any> = { mqtt: Radio, lorawan: Signal, wifi: Wifi, lte: Signal, bluetooth: Bluetooth }
const protoColor: Record<string, string> = {
  mqtt: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  lorawan: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  wifi: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  lte: 'text-green-400 bg-green-500/10 border-green-500/20',
  bluetooth: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  custom: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
}
const catLabel: Record<string, string> = {
  sensor_temperature: '🌡️ Temperatura', sensor_motion: '👁️ Movimento', sensor_gas: '💨 Gás/Ar',
  sensor_water: '💧 Água/Nível', sensor_light: '💡 Luz', meter_energy: '⚡ Energia',
  tracker_gps: '📍 GPS/Rastreador', actuator_relay: '🔌 Relé/Atuador', actuator_valve: '🚰 Válvula',
  panic_button: '🆘 Botão de Pânico', gateway: '🌐 Gateway', custom: '⚙️ Custom',
}

interface AddForm { name: string; identifier: string; protocol: string; type: string; notes: string }

export default function DeviceLibrary() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [protocol, setProtocol] = useState('')
  const [selected, setSelected] = useState<any>(null)
  const [form, setForm] = useState<AddForm>({ name: '', identifier: '', protocol: '', type: 'iot', notes: '' })
  const [success, setSuccess] = useState(false)

  const { data: models = [] } = useQuery({ queryKey: ['models', search, category, protocol], queryFn: () => modelsApi.list({ search: search || undefined, category: category || undefined, protocol: protocol || undefined }).then(r => r.data) })
  const { data: cats = [] } = useQuery({ queryKey: ['cats'], queryFn: () => modelsApi.categories().then(r => r.data) })

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
    setForm({ name: m.name, identifier: '', protocol: m.protocol, type: m.category.includes('tracker') ? 'tracker' : 'iot', notes: '' })
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    add.mutate({ ...form, modelId: selected.id })
  }

  const grouped = models.reduce((acc: any, m: any) => {
    if (!acc[m.category]) acc[m.category] = []
    acc[m.category].push(m)
    return acc
  }, {})

  return (
    <div className="p-6 space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Biblioteca de Dispositivos</h1>
          <p className="text-gray-500 text-sm mt-0.5">{models.length} modelos disponíveis — plug & play</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar dispositivo..." className="input pl-9" />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)} className="input w-auto">
          <option value="">Todas as categorias</option>
          {cats.map((c: any) => <option key={c.category} value={c.category}>{catLabel[c.category] || c.category} ({c.count})</option>)}
        </select>
        <select value={protocol} onChange={e => setProtocol(e.target.value)} className="input w-auto">
          <option value="">Todos os protocolos</option>
          {['mqtt', 'lorawan', 'wifi', 'lte', 'bluetooth', 'custom'].map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
        </select>
      </div>

      {/* Grid por categoria */}
      {Object.entries(grouped).map(([cat, items]: any) => (
        <div key={cat}>
          <h2 className="text-sm font-semibold text-gray-400 mb-3">{catLabel[cat] || cat}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((m: any) => {
              const ProtoIcon = protoIcon[m.protocol] || Cpu
              return (
                <div key={m.id} className="card p-5 hover:border-gray-700 transition-colors cursor-pointer group" onClick={() => openModel(m)}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg border ${protoColor[m.protocol] || protoColor.custom}`}>
                        <ProtoIcon size={18} />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-200 text-sm">{m.name}</p>
                        <p className="text-xs text-gray-500">{m.manufacturer}</p>
                      </div>
                    </div>
                    <button className="opacity-0 group-hover:opacity-100 transition-opacity btn-primary py-1 px-3 text-xs flex items-center gap-1">
                      <Plus size={13} /> Adicionar
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{m.description}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${protoColor[m.protocol] || protoColor.custom}`}>{m.protocol.toUpperCase()}</span>
                    {m.tags?.slice(0, 3).map((t: string) => <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">{t}</span>)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Modal Adicionar */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <div>
                <h3 className="font-semibold text-white">Adicionar: {selected.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{selected.manufacturer} · {selected.protocol.toUpperCase()}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
            </div>

            {success ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
                  <Check size={32} className="text-green-400" />
                </div>
                <p className="text-green-400 font-semibold">Dispositivo adicionado!</p>
              </div>
            ) : (
              <form onSubmit={submit} className="p-6 space-y-4">
                <div>
                  <label className="label">Nome do dispositivo</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className="input" placeholder="Ex: Sensor Sala 01" />
                </div>
                <div>
                  <label className="label">Identificador único (ID/EUI/MAC/IP)</label>
                  <input value={form.identifier} onChange={e => setForm(p => ({ ...p, identifier: e.target.value }))} required className="input font-mono" placeholder="Ex: AA:BB:CC:DD:EE:FF" />
                </div>
                <div>
                  <label className="label">Protocolo</label>
                  <select value={form.protocol} onChange={e => setForm(p => ({ ...p, protocol: e.target.value }))} className="input">
                    {['mqtt', 'lorawan', 'wifi', 'lte', 'bluetooth', 'custom'].map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Observações (opcional)</label>
                  <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="input" placeholder="Localização, observações..." />
                </div>

                {add.error && <p className="text-red-400 text-sm">{(add.error as any).response?.data?.error || 'Erro ao adicionar'}</p>}

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setSelected(null)} className="btn-secondary flex-1">Cancelar</button>
                  <button type="submit" disabled={add.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                    {add.isPending ? <><Loader2 size={16} className="animate-spin" /> Adicionando...</> : <><Plus size={16} /> Adicionar</>}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
