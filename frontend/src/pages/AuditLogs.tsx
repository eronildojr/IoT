import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

interface AuditLog {
  id: number
  user_id: string
  user_name: string
  user_email: string
  action: string
  resource: string
  resource_id: string
  details: any
  ip_address: string
  created_at: string
}

const fmtDate = (d: string) => d ? new Date(d).toLocaleString('pt-BR') : '-'

const actionColor = (action: string) => {
  if (action?.includes('DELETE') || action?.includes('delete')) return 'bg-red-500/20 text-red-400 border-red-500/30'
  if (action?.includes('CREATE') || action?.includes('create') || action?.includes('POST')) return 'bg-green-500/20 text-green-400 border-green-500/30'
  if (action?.includes('UPDATE') || action?.includes('update') || action?.includes('PUT')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
}

export default function AuditLogs() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: () => api.get('/audit-logs', { params: { page, limit: 50 } }).then(r => r.data),
  })

  const logs: AuditLog[] = data?.logs || []
  const total: number = data?.total || 0
  const totalPages = Math.ceil(total / 50)

  const filtered = logs.filter(l =>
    !search ||
    l.action?.toLowerCase().includes(search.toLowerCase()) ||
    l.user_name?.toLowerCase().includes(search.toLowerCase()) ||
    l.resource?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Auditoria de Ações</h1>
          <p className="text-gray-400 text-sm mt-1">{total} registro(s) no total</p>
        </div>
      </div>

      <div className="mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filtrar por ação, usuário ou recurso..."
          className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm placeholder-gray-500" />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Data/Hora</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Usuário</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Ação</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Recurso</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">IP</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-gray-500">Nenhum registro de auditoria encontrado</td></tr>
              )}
              {filtered.map(log => (
                <>
                  <tr key={log.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{fmtDate(log.created_at)}</td>
                    <td className="px-4 py-3">
                      <p className="text-white text-xs">{log.user_name || 'Sistema'}</p>
                      {log.user_email && <p className="text-gray-500 text-xs">{log.user_email}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${actionColor(log.action)}`}>
                        {log.action || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs">
                      {log.resource || '-'}
                      {log.resource_id && <span className="text-gray-500 ml-1">#{log.resource_id}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{log.ip_address || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      {log.details && (
                        <button onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                          className="text-xs px-2 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600">
                          {expanded === log.id ? 'Fechar' : 'Ver'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === log.id && log.details && (
                    <tr key={`${log.id}-detail`} className="border-b border-gray-700/50 bg-gray-900/50">
                      <td colSpan={6} className="px-4 py-3">
                        <pre className="text-xs text-gray-300 bg-gray-800 rounded-lg p-3 overflow-x-auto max-h-40">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-400">Página {page} de {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 disabled:opacity-50">Anterior</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 disabled:opacity-50">Próxima</button>
          </div>
        </div>
      )}
    </div>
  )
}
