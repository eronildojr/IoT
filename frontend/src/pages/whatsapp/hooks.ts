import { useQuery } from '@tanstack/react-query'
import { whatsappApi } from '../../services/api'

export interface WaCategory {
  id: number; name: string; priority: number; active: boolean
  embedded: boolean; embedding_source?: string
  keywords: string[]; synonyms: string[]
}

export interface WaOccurrence {
  id: number; phone: string; name: string | null
  latitude: number | null; longitude: number | null
  description_raw: string | null; description_transcribed: string | null
  audio_url: string | null
  category_id: number | null; category_name: string | null
  ai_confidence: string | number | null; ai_method: string | null
  status: string
  dispatched_wf_username: string | null; dispatched_distance_m: number | null
  dispatched_at: string | null; created_at: string
  dispatch_log?: any[]
}

export interface WaAgent {
  wf_username: string; display_name: string | null
  last_lat: number | null; last_lng: number | null
  fixTime: string | null; fresh: boolean; distance_m: number | null
}

/** React Query v5 entrega estados intermediários — sempre garantir array. */
const asArray = <T,>(v: any): T[] => (Array.isArray(v) ? v : [])

export function useWaConfig() {
  return useQuery({ queryKey: ['wa-config'], queryFn: () => whatsappApi.getConfig().then(r => r.data) })
}

export function useConnection() {
  return useQuery({
    queryKey: ['wa-connection'],
    queryFn: () => whatsappApi.connection().then(r => r.data).catch(() => null),
    refetchInterval: 20000, retry: 0,
  })
}

export function useAiHealth() {
  return useQuery({ queryKey: ['wa-ai-health'], queryFn: () => whatsappApi.aiHealth().then(r => r.data), refetchInterval: 60000 })
}

export function useCategories() {
  return useQuery<WaCategory[]>({
    queryKey: ['wa-categories'],
    queryFn: () => whatsappApi.categories().then(r => asArray<WaCategory>(r.data)),
  })
}

export function usePendingOccurrences() {
  return useQuery<WaOccurrence[]>({
    queryKey: ['wa-pending'],
    queryFn: () => whatsappApi.pending().then(r => asArray<WaOccurrence>(r.data?.occurrences)),
    refetchInterval: 15000,
  })
}

export function useOccurrences(filters: { status?: string; from?: string; to?: string }) {
  return useQuery<{ occurrences: WaOccurrence[]; total: number }>({
    queryKey: ['wa-occurrences', filters],
    queryFn: () => whatsappApi.occurrences(filters).then(r => ({
      occurrences: asArray<WaOccurrence>(r.data?.occurrences),
      total: r.data?.total ?? 0,
    })),
  })
}

export function useOccurrence(id: number | null) {
  return useQuery<WaOccurrence>({
    queryKey: ['wa-occurrence', id],
    queryFn: () => whatsappApi.occurrence(id as number).then(r => r.data),
    enabled: id != null,
  })
}

export function useAvailableAgents(occurrenceId: number | null) {
  return useQuery<WaAgent[]>({
    queryKey: ['wa-agents', occurrenceId],
    queryFn: () => whatsappApi.availableAgents(occurrenceId ?? undefined).then(r => asArray<WaAgent>(r.data)),
    enabled: occurrenceId != null,
    refetchInterval: 20000,
  })
}
