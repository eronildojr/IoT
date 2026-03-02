import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { devicesApi } from '../services/api'
import { ArrowLeft, Cpu, Activity, Clock, Wifi, WifiOff, AlertTriangle, Network, Settings, BarChart2, Loader2, CheckCircle, XCircle, Zap } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const statusBadge: Record<string, string> = {
  online: 'badge-online', offline: 'badge-offline', warning: 'badge-warning', error: 'badge-error'
}

const PROTOCOL_PORTS: Record<string, number> = {
  'mqtt': 1883, 'mqtts': 8883, 'http': 80, 'https': 443, 'tcp': 502,
  'modbus': 502, 'lorawan': 1700, 'rtsp': 554, 'onvif': 80, 'telnet': 23,
  'ftp': 21, 'ssh': 22, 'coap': 5683, 'amqp': 5672, 'opcua': 4840,
}

const PROTOCOL_DESCRIPTIONS: Record<string, string> = {
  'mqtt': 'Protocolo de mensagens leve para IoT. Broker recebe dados do dispositivo.',
  'tcp': 'Conexão TCP direta. Ideal para Modbus, PLCs e equipamentos industriais.',
  'http': 'API REST HTTP. O dispositivo envia dados via POST para a plataforma.',
  'lorawan': 'LoRaWAN via Network Server (TTN, Chirpstack). Porta 1700 UDP.',
  'modbus': 'Modbus TCP/RTU para equipamentos industriais e medidores.',
  'rtsp': 'Stream de vídeo RTSP para câmeras IP.',
  'coap': 'CoAP - protocolo leve para dispositivos com recursos limitados.',
}

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'telemetry' | 'connection' | 'config'>('telemetry')
  const [connForm, setConnForm] = useState({ host: '', port: '', protocol: 'mqtt', path: '/', topic: '', username: '', password: '' })
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const { data: device, isLoading, refetch } = useQuery({
    queryKey: ['device', id],
    queryFn: () => devicesApi.get(id!).then(r => {
      const d = r.data
      // Pré-preencher form com dados existentes
      if (d.connection_host) {
        setConnForm({
          host: d.connection_host || '',
          port: String(d.connection_port || ''),
          protocol: d.connection_protocol || 'mqtt',
          path: d.connection_path || '/',
          topic: d.connection_config?.topic || '',
          username: d.connection_config?.username || '',
          password: d.connection_config?.password || '',
        })
      }
      return d
    }),
    refetchInterval: 15000,
  })

  const { data: telemetry } = useQuery({
    queryKey: ['telemetry', id],
    queryFn: () => devicesApi.telemetry(id!, { limit: 50 }).then(r => r.data),
    refetchInterval: 15000,
  })

  const saveConn = useMutation({
    mutationFn: () => devicesApi.setConnection(id!, {
      host: connForm.host,
      port: parseInt(connForm.port),
      protocol: connForm.protocol,
      path: connForm.path,
      config: {
        topic: connForm.topic,
        username: connForm.username,
        password: connForm.password,
      }
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['device', id] })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    }
  })

  const testConn = async () => {
    setTestLoading(true)
    setTestResult(null)
    try {
      const r = await devicesApi.testConnection(id!)
      setTestResult(r.data)
    } catch (e: any) {
      setTestResult({ success: false, message: e.response?.data?.error || 'Erro ao testar' })
    } finally {
      setTestLoading(false)
    }
  }

  const handleProtocolChange = (proto: string) => {
    setConnForm(p => ({
      ...p,
      protocol: proto,
      port: String(PROTOCOL_PORTS[proto] || p.port),
    }))
  }

  if (isLoading) return (
    <div className="p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-800 rounded w-1/3" />
        <div className="card p-6 h-40" />
      </div>
    </div>
  )

  if (!device) return (
    <div className="p-6 text-center">
      <p className="text-gray-500">Dispositivo não encontrado</p>
      <Link to="/devices" className="text-cyan-400 hover:underline mt-2 inline-block">← Voltar</Link>
    </div>
  )

  const numericFields = telemetry?.length > 0
    ? Object.entries(telemetry[0].data).filter(([, v]) => typeof v === 'number').map(([k]) => k)
    : []

  const chartData = [...(telemetry || [])].reverse().map((t: any) => ({
    time: format(new Date(t.timestamp), 'HH:mm', { locale: ptBR }),
    ...t.data,
  }))

  const fieldColors = ['#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444']

  const connStatus = device.connection_status
  const hasConnection = !!device.connection_host

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/devices" className="p-2 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="page-title">{device.name}</h1>
          <p className="text-gray-500 text-sm font-mono">{device.identifier}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {hasConnection && (
            <span className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${
              connStatus === 'online' ? 'text-green-400 bg-green-500/10 border-green-500/20' :
              connStatus === 'offline' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
              'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
            }`}>
              <Network size={12} />
              {device.connection_host}:{device.connection_port}
            </span>
          )}
          <span className={statusBadge[device.status] || 'badge-offline'}>
            <span className={`w-1.5 h-1.5 rounded-full ${device.status === 'online' ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
            {device.status}
          </span>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Protocolo', value: device.protocol?.toUpperCase(), icon: Wifi, cls: 'text-cyan-400' },
          { label: 'Tipo', value: device.type, icon: Cpu, cls: 'text-blue-400' },
          { label: 'Modelo', value: device.model_name || 'Custom', icon: Activity, cls: 'text-purple-400' },
          { label: 'Último contato', value: device.last_seen_at ? format(new Date(device.last_seen_at), 'dd/MM HH:mm', { locale: ptBR }) : 'Nunca', icon: Clock, cls: 'text-gray-400' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={16} className={cls} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <p className="font-semibold text-gray-200">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800/50 rounded-xl p-1 w-fit">
        {[
          { id: 'telemetry', label: 'Telemetria', icon: BarChart2 },
          { id: 'connection', label: 'Conexão IP:Porta', icon: Network },
          { id: 'config', label: 'Configuração', icon: Settings },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-gray-700 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <tab.icon size={15} />
            {tab.label}
            {tab.id === 'connection' && !hasConnection && (
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* Tab: Telemetria */}
      {activeTab === 'telemetry' && (
        <div className="space-y-5">
          {device.last_telemetry && (
            <div className="card p-5">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Activity size={16} className="text-cyan-400" /> Última Leitura
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {Object.entries(device.last_telemetry).map(([key, val]: any) => (
                  <div key={key} className="bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1 capitalize">{key.replace(/_/g, ' ')}</p>
                    <p className="text-lg font-bold text-cyan-400">
                      {typeof val === 'boolean' ? (val ? '✓ Ativo' : '✗ Inativo') : String(val)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {chartData.length > 0 && numericFields.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart2 size={16} className="text-cyan-400" /> Histórico de Telemetria
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' }} />
                  {numericFields.slice(0, 5).map((field, i) => (
                    <Line key={field} type="monotone" dataKey={field} stroke={fieldColors[i]} strokeWidth={2} dot={false} name={field} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {telemetry?.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-white mb-4">Histórico Detalhado</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 pb-2 pr-4">Timestamp</th>
                      {numericFields.slice(0, 6).map(f => (
                        <th key={f} className="text-left text-gray-500 pb-2 pr-4 capitalize">{f.replace(/_/g, ' ')}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {telemetry.slice(0, 20).map((t: any) => (
                      <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="py-2 pr-4 text-gray-400 font-mono text-xs">{format(new Date(t.timestamp), 'dd/MM HH:mm:ss', { locale: ptBR })}</td>
                        {numericFields.slice(0, 6).map(f => (
                          <td key={f} className="py-2 pr-4 text-gray-300">{t.data[f] ?? '-'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!device.last_telemetry && telemetry?.length === 0 && (
            <div className="card p-10 text-center">
              <WifiOff size={40} className="text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">Nenhuma telemetria recebida ainda</p>
              <p className="text-gray-600 text-sm mt-1">Configure a conexão na aba <button onClick={() => setActiveTab('connection')} className="text-cyan-400 hover:underline">Conexão IP:Porta</button> para começar a receber dados.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab: Conexão IP:Porta */}
      {activeTab === 'connection' && (
        <div className="space-y-5">
          {/* Status atual */}
          {hasConnection && (
            <div className={`card p-4 border ${
              connStatus === 'online' ? 'border-green-500/30 bg-green-500/5' :
              connStatus === 'offline' ? 'border-red-500/30 bg-red-500/5' :
              'border-yellow-500/30 bg-yellow-500/5'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {connStatus === 'online' ? <CheckCircle size={20} className="text-green-400" /> :
                   connStatus === 'offline' ? <XCircle size={20} className="text-red-400" /> :
                   <AlertTriangle size={20} className="text-yellow-400" />}
                  <div>
                    <p className="text-white font-medium">
                      {connStatus === 'online' ? 'Dispositivo acessível' :
                       connStatus === 'offline' ? 'Dispositivo inacessível' :
                       'Conexão configurada'}
                    </p>
                    <p className="text-gray-400 text-sm font-mono">
                      {device.connection_protocol?.toUpperCase()}://{device.connection_host}:{device.connection_port}{device.connection_path !== '/' ? device.connection_path : ''}
                    </p>
                  </div>
                </div>
                {device.connection_last_check && (
                  <p className="text-gray-500 text-xs">
                    Verificado: {format(new Date(device.connection_last_check), 'dd/MM HH:mm', { locale: ptBR })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Formulário de conexão */}
          <div className="card p-6">
            <h3 className="font-semibold text-white mb-1 flex items-center gap-2">
              <Network size={16} className="text-cyan-400" /> Configurar Conexão
            </h3>
            <p className="text-gray-500 text-sm mb-5">Aponte o IP e porta do dispositivo para que a plataforma se comunique com ele.</p>

            <div className="space-y-4">
              {/* Protocolo */}
              <div>
                <label className="label">Protocolo de Comunicação</label>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {['mqtt', 'tcp', 'http', 'modbus', 'lorawan', 'rtsp', 'coap', 'https', 'opcua', 'custom'].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleProtocolChange(p)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
                        connForm.protocol === p
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {p.toUpperCase()}
                    </button>
                  ))}
                </div>
                {PROTOCOL_DESCRIPTIONS[connForm.protocol] && (
                  <p className="text-gray-500 text-xs mt-2">{PROTOCOL_DESCRIPTIONS[connForm.protocol]}</p>
                )}
              </div>

              {/* Host e Porta */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="label">Host / IP *</label>
                  <input
                    value={connForm.host}
                    onChange={e => setConnForm(p => ({ ...p, host: e.target.value }))}
                    className="input font-mono"
                    placeholder="Ex: 192.168.1.100 ou broker.empresa.com"
                  />
                </div>
                <div>
                  <label className="label">Porta *</label>
                  <input
                    value={connForm.port}
                    onChange={e => setConnForm(p => ({ ...p, port: e.target.value }))}
                    className="input font-mono"
                    placeholder={String(PROTOCOL_PORTS[connForm.protocol] || 1883)}
                    type="number"
                  />
                </div>
              </div>

              {/* Path (para HTTP/MQTT) */}
              {['http', 'https', 'mqtt', 'mqtts'].includes(connForm.protocol) && (
                <div>
                  <label className="label">
                    {connForm.protocol.startsWith('mqtt') ? 'Tópico MQTT' : 'Path / Endpoint'}
                  </label>
                  <input
                    value={connForm.protocol.startsWith('mqtt') ? connForm.topic : connForm.path}
                    onChange={e => setConnForm(p => connForm.protocol.startsWith('mqtt')
                      ? { ...p, topic: e.target.value }
                      : { ...p, path: e.target.value }
                    )}
                    className="input font-mono"
                    placeholder={connForm.protocol.startsWith('mqtt') ? 'devices/sensor01/data' : '/api/data'}
                  />
                </div>
              )}

              {/* Credenciais */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Usuário (opcional)</label>
                  <input
                    value={connForm.username}
                    onChange={e => setConnForm(p => ({ ...p, username: e.target.value }))}
                    className="input"
                    placeholder="username"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="label">Senha (opcional)</label>
                  <input
                    value={connForm.password}
                    onChange={e => setConnForm(p => ({ ...p, password: e.target.value }))}
                    className="input"
                    placeholder="••••••••"
                    type="password"
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={testConn}
                  disabled={!connForm.host || !connForm.port || testLoading}
                  className="btn-secondary flex items-center gap-2"
                >
                  {testLoading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                  Testar Conexão
                </button>
                <button
                  type="button"
                  onClick={() => saveConn.mutate()}
                  disabled={!connForm.host || !connForm.port || saveConn.isPending}
                  className="btn-primary flex items-center gap-2 flex-1"
                >
                  {saveConn.isPending ? <Loader2 size={16} className="animate-spin" /> : <Network size={16} />}
                  {saveSuccess ? '✓ Salvo!' : 'Salvar Configuração'}
                </button>
              </div>

              {/* Resultado do teste */}
              {testResult && (
                <div className={`p-4 rounded-xl border flex items-center gap-3 ${
                  testResult.success
                    ? 'border-green-500/30 bg-green-500/5 text-green-400'
                    : 'border-red-500/30 bg-red-500/5 text-red-400'
                }`}>
                  {testResult.success
                    ? <CheckCircle size={20} />
                    : <XCircle size={20} />
                  }
                  <div>
                    <p className="font-medium">{testResult.message}</p>
                    {testResult.latency && <p className="text-xs opacity-70">Latência: {testResult.latency}ms</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Guia de integração */}
          <div className="card p-5">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Activity size={16} className="text-cyan-400" /> Como enviar dados para a plataforma
            </h3>
            <p className="text-gray-500 text-sm mb-4">
              O dispositivo deve enviar dados para a API da plataforma. Use o endpoint abaixo:
            </p>
            <div className="bg-gray-800 rounded-xl p-4 space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Endpoint de telemetria</p>
                <code className="text-cyan-400 text-sm font-mono">POST /api/devices/{id}/telemetry</code>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Headers</p>
                <code className="text-green-400 text-xs font-mono block">Authorization: Bearer {'<seu_api_key>'}</code>
                <code className="text-green-400 text-xs font-mono block">Content-Type: application/json</code>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Body (exemplo)</p>
                <pre className="text-yellow-400 text-xs font-mono">{JSON.stringify({ data: { temperature: 25.3, humidity: 60, battery: 85 } }, null, 2)}</pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Configuração */}
      {activeTab === 'config' && (
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4">Configuração do Dispositivo</h3>
          <pre className="text-xs text-gray-400 bg-gray-800 rounded-lg p-4 overflow-x-auto font-mono">
            {JSON.stringify({ ...device.config, connection: { host: device.connection_host, port: device.connection_port, protocol: device.connection_protocol } }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
