/**
 * Matriz Estratégica de Prioridade — helpers determinísticos (Script 27).
 * Regra de negócio pura no Node; o serviço de IA (groupates_ai) NÃO participa
 * do escalonamento.
 */
export const LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type Level = typeof LEVELS[number];

/** low=0 ... critical=3 */
export const levelRank = (l: Level): number => LEVELS.indexOf(l);

/** Maior dos dois níveis (nunca rebaixa). */
export const maxLevel = (a: Level, b: Level): Level =>
  levelRank(a) >= levelRank(b) ? a : b;

/** Peso base sugerido para cada nível. */
export const defaultWeightForLevel = (l: Level): number =>
  ({ critical: 10, high: 6, medium: 3, low: 1 } as Record<Level, number>)[l] ?? 3;

/** Valida se uma string é um Level conhecido. */
export const isLevel = (v: any): v is Level => LEVELS.includes(v);

/** Normaliza: minúsculas + sem acento, para casar palavras-gatilho. */
export const normalize = (s: string): string =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Distância de Levenshtein (implementação leve, sem dependência externa).
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Razão de similaridade [0..1] baseada em Levenshtein. */
export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Verdadeiro se `term` aparece em `text` de forma aproximada (tolera erro de
 * digitação). Compara o termo (já normalizado) contra janelas de tokens do
 * texto do mesmo tamanho em palavras. `text` e `term` devem vir normalizados.
 */
export function fuzzyContains(text: string, term: string, threshold = 0.88): boolean {
  if (!term) return false;
  if (text.includes(term)) return true;
  const tokens = text.split(/\s+/).filter(Boolean);
  const termWords = term.split(/\s+/).filter(Boolean).length || 1;
  if (!tokens.length) return false;
  for (let i = 0; i + termWords <= tokens.length; i++) {
    const window = tokens.slice(i, i + termWords).join(' ');
    if (similarity(window, term) >= threshold) return true;
  }
  // termo de palavra única: também tolera contra cada token isolado
  if (termWords === 1) {
    for (const tk of tokens) if (similarity(tk, term) >= threshold) return true;
  }
  return false;
}
