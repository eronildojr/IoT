/**
 * Mapa de níveis de risco da Matriz Estratégica de Prioridade (Script 27/28).
 * Compartilhado entre a tela de Categorias e a seção de palavras-gatilho.
 */
export type Level = 'critical' | 'high' | 'medium' | 'low'

export const LEVELS: Level[] = ['critical', 'high', 'medium', 'low']

export const PRIORITY: Record<Level, { label: string; color: string; badge: string }> = {
  critical: { label: 'Máxima (Vermelho)', color: '#dc2626', badge: 'bg-red-600' },
  high:     { label: 'Alta (Laranja)',    color: '#ea580c', badge: 'bg-orange-500' },
  medium:   { label: 'Média (Amarelo)',   color: '#ca8a04', badge: 'bg-yellow-500' },
  low:      { label: 'Baixa (Verde)',     color: '#16a34a', badge: 'bg-green-600' }, // azul → verde (Script 31): cor e nome
}

/** Peso base sugerido por nível (igual ao backend defaultWeightForLevel). */
export const defaultWeightForLevel = (l: Level): number =>
  ({ critical: 10, high: 6, medium: 3, low: 1 } as Record<Level, number>)[l] ?? 3

export const isLevel = (v: any): v is Level => LEVELS.includes(v)
