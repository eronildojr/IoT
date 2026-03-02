import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { devicesApi } from '../services/api'
import { ArrowLeft, Cpu, Activity, Clock, Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const statusBadge: Record<string, string> = {
  online: 'badge-online', offline: 'badge-offline', warning: 'badge-warning', error: 'badge-error'
}

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>()

  const { data: device, isLoading } = useQuery({
    queryKey: ['device', id],
    queryFn: () => devicesApi.get(id!).then(r => r.data),
    refetchInterval: 15000,
  })

  const { data: telemetry } = useQuery({
    queryKey: ['telemetry', id],
    queryFn: () => devicesApi.telemetry(id!, { limit: 50 }).then(r => r.data),
    refetchInterval: 15000,
  })

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

  // Extrair campos numéricos da telemetria para gráficos
  const numericFields = telemetry?.length > 0
    ? Object.entries(telemetry[0].data).filter(([, v]) => typeof v === 'number').map(([k]) => k)
    : []

  const chartData = [...(telemetry || [])].reverse().map((t: any) => ({
    time: format(new Date(t.timestamp), 'HH:mm', { locale: ptBR }),
    ...t.data,
  }))

  const fieldColors = ['#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444']

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/devices" className="p-2 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="page-title">{device.name}</h1>
          <p className="text-gray-500 text-sm font-mono">{device.identifier}</p>
        </div>
        <span className={`ml-auto ${statusBadge[device.status] || 'badge-offline'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${device.status === 'online' ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
          {device.status}
        </span>
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

      {/* Last Telemetry */}
      {device.last_telemetry && (
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Activity size={16} className="text-cyan-400" /> Última Leitura
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Object.entries(device.last_telemetry).map(([key, val]: any) => (
              <div key={key} className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1 capitalize">{key.replace(/_/g, ' ')}</p>
                <p className="text-lg font-bold text-cyan-400">{typeof val === 'boolean' ? (val ? '✓ Ativo' : '✗ Inativo') : String(val)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      {chartData.length > 0 && numericFields.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Activity size={16} className="text-cyan-400" /> Histórico de Telemetria
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

      {/* Raw Telemetry Table */}
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

      {/* Config */}
      <div className="card p-5">
        <h3 className="font-semibold text-white mb-4">Configuração</h3>
        <pre className="text-xs text-gray-400 bg-gray-800 rounded-lg p-4 overflow-x-auto font-mono">
          {JSON.stringify(device.config || {}, null, 2)}
        </pre>
      </div>
    </div>
  )
}
