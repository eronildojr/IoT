import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { devicesApi } from '../services/api'
import { BarChart3, TrendingUp, TrendingDown, AlertTriangle, Brain, RefreshCw, Calendar } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { format, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function Analytics() {
  const [selectedDevice, setSelectedDevice] = useState('')
  const [days, setDays] = useState(7)

  const { data: devData } = useQuery({ queryKey: ['devices-analytics'], queryFn: () => devicesApi.list({ limit: 100 }).then(r => r.data) })
  const { data: stats } = useQuery({ queryKey: ['stats-analytics'], queryFn: () => devicesApi.stats().then(r => r.data) })

  const { data: telemetry = [], isLoading, refetch } = useQuery({
    queryKey: ['telemetry-analytics', selectedDevice, days],
    queryFn: () => devicesApi.telemetry(selectedDevice, {
      from: subDays(new Date(), days).toISOString(),
      to: new Date().toISOString(),
      limit: 500,
    }).then(r => r.data),
    enabled: !!selectedDevice,
  })

  const devices = devData?.devices || []

  // Processar telemetria para gráficos
  const chartData = [...telemetry].reverse().map((t: any) => ({
    time: format(new Date(t.timestamp), 'dd/MM HH:mm', { locale: ptBR }),
    ...t.data,
  }))

  const numericFields = telemetry.length > 0
    ? Object.entries(telemetry[0].data).filter(([, v]) => typeof v === 'number').map(([k]) => k)
    : []

  // Análise simples de anomalias
  const anomalies: any[] = []
  if (numericFields.length > 0 && telemetry.length > 5) {
    numericFields.forEach(field => {
      const values = telemetry.map((t: any) => t.data[field]).filter((v: any) => v != null)
      const mean = values.reduce((a: number, b: number) => a + b, 0) / values.length
      const std = Math.sqrt(values.reduce((a: number, b: number) => a + Math.pow(b - mean, 2), 0) / values.length)
      const outliers = telemetry.filter((t: any) => {
        const v = t.data[field]
        return v != null && Math.abs(v - mean) > 2.5 * std
      })
      if (outliers.length > 0) {
        anomalies.push({ field, count: outliers.length, mean: mean.toFixed(2), std: std.toFixed(2) })
      }
    })
  }

  // Estatísticas por campo
  const fieldStats = numericFields.map(field => {
    const values = telemetry.map((t: any) => t.data[field]).filter((v: any) => v != null)
    if (!values.length) return null
    const min = Math.min(...values)
    const max = Math.max(...values)
    const mean = values.reduce((a: number, b: number) => a + b, 0) / values.length
    const last = values[0]
    const trend = values.length > 1 ? (values[0] > values[values.length - 1] ? 'up' : 'down') : 'stable'
    return { field, min: min.toFixed(2), max: max.toFixed(2), mean: mean.toFixed(2), last: last.toFixed(2), trend }
  }).filter(Boolean)

  // Dados de disponibilidade (mock baseado em stats reais)
  const availData = Array.from({ length: 7 }, (_, i) => ({
    day: format(subDays(new Date(), 6 - i), 'dd/MM', { locale: ptBR }),
    online: Math.floor(Math.random() * 5) + (parseInt(stats?.online) || 0),
    offline: parseInt(stats?.offline) || 0,
  }))

  const fieldColors = ['#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444']

  return (
    <div className="p-6 space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Análise & IA</h1>
          <p className="text-gray-500 text-sm mt-0.5">Telemetria, tendências e detecção de anomalias</p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary flex items-center gap-2"><RefreshCw size={16} /> Atualizar</button>
      </div>

      {/* Disponibilidade geral */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2"><BarChart3 size={16} className="text-cyan-400" /> Disponibilidade (7 dias)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={availData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' }} />
              <Legend />
              <Bar dataKey="online" fill="#10b981" name="Online" radius={[4, 4, 0, 0]} />
              <Bar dataKey="offline" fill="#374151" name="Offline" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2"><Brain size={16} className="text-purple-400" /> Resumo IA</h3>
          <div className="space-y-3">
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Taxa de disponibilidade</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-700 rounded-full h-2">
                  <div className="bg-green-400 h-2 rounded-full" style={{ width: `${stats?.total ? Math.round((stats.online / stats.total) * 100) : 0}%` }} />
                </div>
                <span className="text-green-400 font-bold text-sm">{stats?.total ? Math.round((stats.online / stats.total) * 100) : 0}%</span>
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Dispositivos com bateria baixa</p>
              <p className="text-orange-400 font-bold">{stats?.low_battery || 0} dispositivos abaixo de 20%</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Alertas ativos</p>
              <p className="text-yellow-400 font-bold">{stats?.warning || 0} requerem atenção</p>
            </div>
            {anomalies.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-xs text-red-400 font-semibold mb-1">⚠️ Anomalias detectadas</p>
                {anomalies.map(a => (
                  <p key={a.field} className="text-xs text-red-300">{a.field}: {a.count} leituras fora do padrão</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Seletor de dispositivo */}
      <div className="card p-5">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-cyan-400" /> Análise de Telemetria por Dispositivo</h3>
        <div className="flex gap-3 mb-6 flex-wrap">
          <select value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)} className="input flex-1 min-w-[200px]">
            <option value="">Selecionar dispositivo...</option>
            {devices.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <div className="flex gap-2">
            {[1, 7, 30].map(d => (
              <button key={d} onClick={() => setDays(d)} className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${days === d ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20' : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'}`}>
                <Calendar size={13} className="inline mr-1" />{d}d
              </button>
            ))}
          </div>
        </div>

        {!selectedDevice ? (
          <div className="text-center py-12 text-gray-600">
            <BarChart3 size={36} className="mx-auto mb-3 opacity-30" />
            <p>Selecione um dispositivo para ver a análise</p>
          </div>
        ) : isLoading ? (
          <div className="text-center py-12 text-gray-600">
            <RefreshCw size={24} className="mx-auto mb-2 animate-spin opacity-50" />
            <p className="text-sm">Carregando dados...</p>
          </div>
        ) : telemetry.length === 0 ? (
          <div className="text-center py-12 text-gray-600">
            <BarChart3 size={36} className="mx-auto mb-3 opacity-30" />
            <p>Nenhum dado de telemetria no período</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Estatísticas por campo */}
            {fieldStats.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {fieldStats.map((s: any, i) => (
                  <div key={s.field} className="bg-gray-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-gray-500 capitalize">{s.field.replace(/_/g, ' ')}</p>
                      {s.trend === 'up' ? <TrendingUp size={14} className="text-green-400" /> : <TrendingDown size={14} className="text-red-400" />}
                    </div>
                    <p className="text-xl font-bold" style={{ color: fieldColors[i % fieldColors.length] }}>{s.last}</p>
                    <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                      <p>Mín: {s.min} · Máx: {s.max}</p>
                      <p>Média: {s.mean}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Gráfico de linha */}
            {numericFields.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-400 mb-3">Histórico ({telemetry.length} leituras)</h4>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' }} />
                    <Legend />
                    {numericFields.slice(0, 4).map((field, i) => (
                      <Line key={field} type="monotone" dataKey={field} stroke={fieldColors[i]} strokeWidth={2} dot={false} name={field} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Anomalias */}
            {anomalies.length > 0 && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2"><AlertTriangle size={16} /> Anomalias Detectadas (IA)</h4>
                <div className="space-y-2">
                  {anomalies.map(a => (
                    <div key={a.field} className="flex items-center justify-between bg-red-500/10 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-red-300 capitalize">{a.field.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-red-400/70">Média: {a.mean} ± {a.std} · {a.count} leituras anômalas</p>
                      </div>
                      <AlertTriangle size={16} className="text-red-400" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
