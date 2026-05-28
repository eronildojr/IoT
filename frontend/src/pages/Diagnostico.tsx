import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, Activity, Camera, HelpCircle } from 'lucide-react'
import { diagnosticsApi } from '../services/api'

type HealthCheck = {
  name: string
  status: 'ok' | 'warn' | 'error'
  detail: string
  latency_ms: number | null
}

type CameraStatus = {
  id: number
  name: string
  manufacturer?: string
  ip: string
  rtsp_port?: number | null
  rtsp_path?: string | null
  active: boolean
  synced: boolean
  status: { code: string; label: string; color: 'green' | 'yellow' | 'gray' }
}

type CameraTestResult = {
  status: 'ok' | 'error'
  label: string
  detail: string
  latency_ms?: number
}

const statusStyles = {
  ok:    { card: 'bg-green-900/20 border-green-500/40',  text: 'text-green-300',  Icon: CheckCircle2 },
  warn:  { card: 'bg-yellow-900/20 border-yellow-500/40', text: 'text-yellow-300', Icon: AlertTriangle },
  error: { card: 'bg-red-900/20 border-red-500/40',      text: 'text-red-300',    Icon: XCircle },
} as const

const badgeStyles = {
  green:  'bg-green-500/20 text-green-300 border-green-500/30',
  yellow: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  gray:   'bg-gray-500/20 text-gray-300 border-gray-500/30',
} as const

export default function Diagnostico() {
  const { data: health, isFetching, refetch } = useQuery({
    queryKey: ['diag-health'],
    queryFn: () => diagnosticsApi.health().then(r => r.data),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  })

  const { data: camerasData } = useQuery({
    queryKey: ['diag-cameras'],
    queryFn: () => diagnosticsApi.cameras().then(r => r.data),
    refetchInterval: 30000,
  })

  const [testResults, setTestResults] = useState<Record<number, CameraTestResult>>({})
  const [testing, setTesting] = useState<number | null>(null)

  const testCamera = async (id: number) => {
    setTesting(id)
    try {
      const r = await diagnosticsApi.testCamera(id)
      setTestResults(prev => ({ ...prev, [id]: r.data.result }))
    } catch (e: any) {
      setTestResults(prev => ({
        ...prev,
        [id]: { status: 'error', label: 'Falha', detail: e.response?.data?.error || 'Erro de rede' },
      }))
    } finally {
      setTesting(null)
    }
  }

  const cameras: CameraStatus[] = camerasData?.cameras ?? []

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="text-cyan-400" /> Diagnóstico do Sistema
          </h1>
          <p className="text-sm text-white/60 mt-1">
            {health?.timestamp
              ? `Última verificação: ${new Date(health.timestamp).toLocaleString('pt-BR')}`
              : 'Carregando...'}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg flex items-center gap-2 text-white text-sm font-medium"
        >
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          {isFetching ? 'Verificando...' : 'Verificar agora'}
        </button>
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">Serviços principais</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(health?.checks ?? []).map((c: HealthCheck) => (
            <HealthCard key={c.name} check={c} />
          ))}
          {!health && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-slate-800/50 border border-white/10 rounded-lg p-4 animate-pulse h-28" />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Camera size={18} /> Câmeras IP ({cameras.length})
        </h2>
        {cameras.length === 0 ? (
          <div className="bg-slate-800/40 border border-white/10 rounded-lg p-8 text-center text-white/50">
            Nenhuma câmera cadastrada.
          </div>
        ) : (
          <div className="space-y-2">
            {cameras.map(cam => {
              const result = testResults[cam.id]
              return (
                <div key={cam.id} className="bg-slate-800/50 border border-white/10 rounded-lg p-3 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-medium text-white">{cam.name}</div>
                    <div className="text-xs text-white/50 mt-0.5">
                      {cam.manufacturer || 'genérico'} · {cam.ip}
                      {cam.rtsp_port ? `:${cam.rtsp_port}` : ''}
                      {cam.rtsp_path || ''}
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${badgeStyles[cam.status.color]}`}>
                    {cam.status.label}
                  </span>

                  {result && (
                    <span
                      title={result.detail}
                      className={`px-2.5 py-1 rounded text-xs font-medium border ${
                        result.status === 'ok'
                          ? 'bg-green-500/20 text-green-300 border-green-500/30'
                          : 'bg-red-500/20 text-red-300 border-red-500/30'
                      }`}
                    >
                      {result.status === 'ok' ? '✓' : '✕'} {result.label}
                      {result.latency_ms != null && ` · ${result.latency_ms}ms`}
                    </span>
                  )}

                  <button
                    onClick={() => testCamera(cam.id)}
                    disabled={testing === cam.id}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded text-sm text-white"
                  >
                    {testing === cam.id ? 'Testando...' : 'Testar'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {Object.values(testResults).some(r => r.status === 'error') && (
          <p className="text-xs text-white/50 mt-3 flex items-center gap-1.5">
            <HelpCircle size={14} />
            Câmeras "Aguardando sincronização" precisam ser editadas e salvas novamente para forçar o registro no Shinobi.
          </p>
        )}
      </section>
    </div>
  )
}

function HealthCard({ check }: { check: HealthCheck }) {
  const style = statusStyles[check.status] || statusStyles.error
  const { Icon } = style
  return (
    <div className={`border rounded-lg p-4 ${style.card}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-white">{check.name}</span>
        <Icon className={style.text} size={22} />
      </div>
      <p className="text-sm text-white/80">{check.detail}</p>
      {check.latency_ms != null && (
        <p className="text-xs text-white/40 mt-2">{check.latency_ms} ms</p>
      )}
    </div>
  )
}
