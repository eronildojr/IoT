import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, RefreshCw, X, Check } from 'lucide-react'
import { whatsappApi } from '../../services/api'
import { useCategories, WaCategory } from './hooks'

function ChipsInput({ label, chips, onChange, color }: { label: string; chips: string[]; onChange: (v: string[]) => void; color: string }) {
  const [text, setText] = useState('')
  const add = () => {
    const t = text.trim()
    if (t && !chips.includes(t)) onChange([...chips, t])
    setText('')
  }
  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2 min-h-[1.5rem]">
        {chips.map(c => (
          <span key={c} className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${color}`}>
            {c}
            <button onClick={() => onChange(chips.filter(x => x !== c))} className="hover:text-white"><X size={12} /></button>
          </span>
        ))}
        {chips.length === 0 && <span className="text-xs text-gray-600">nenhum</span>}
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="Digite e pressione Enter…"
          className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
        <button onClick={add} className="px-3 py-2 bg-gray-700 text-gray-200 rounded-lg text-sm hover:bg-gray-600">Add</button>
      </div>
    </div>
  )
}

function CategoryModal({ category, onClose, onSave, saving }: { category?: WaCategory; onClose: () => void; onSave: (d: any) => void; saving: boolean }) {
  const [name, setName] = useState(category?.name || '')
  const [priority, setPriority] = useState(category?.priority ?? 1)
  const [keywords, setKeywords] = useState<string[]>(category?.keywords || [])
  const [synonyms, setSynonyms] = useState<string[]>(category?.synonyms || [])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-white mb-5">{category ? 'Editar Categoria' : 'Nova Categoria'}</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">Nome *</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Prioridade</label>
              <input type="number" value={priority} onChange={e => setPriority(Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          </div>
          <ChipsInput label="Palavras-chave" chips={keywords} onChange={setKeywords} color="bg-cyan-500/15 text-cyan-300 border-cyan-500/30" />
          <ChipsInput label="Sinônimos" chips={synonyms} onChange={setSynonyms} color="bg-purple-500/15 text-purple-300 border-purple-500/30" />
          <p className="text-xs text-gray-500">Ao salvar, o embedding semântico é (re)gerado automaticamente.</p>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-800">Cancelar</button>
          <button disabled={!name.trim() || saving} onClick={() => onSave({ name, priority, keywords, synonyms })}
            className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="animate-spin" size={15} /> : null} {category ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Categories() {
  const qc = useQueryClient()
  const { data: categories, isLoading, isError } = useCategories()
  const [showModal, setShowModal] = useState(false)
  const [editCat, setEditCat] = useState<WaCategory | undefined>()
  const [reembedMsg, setReembedMsg] = useState<string | null>(null)

  const list = Array.isArray(categories) ? categories : []

  const invalidate = () => qc.invalidateQueries({ queryKey: ['wa-categories'] })

  const create = useMutation({
    mutationFn: (d: any) => whatsappApi.createCategory(d),
    onSuccess: () => { invalidate(); setShowModal(false) },
  })
  const update = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => whatsappApi.updateCategory(id, d),
    onSuccess: () => { invalidate(); setEditCat(undefined) },
  })
  const remove = useMutation({
    mutationFn: (id: number) => whatsappApi.deleteCategory(id),
    onSuccess: invalidate,
  })
  const reembed = useMutation({
    mutationFn: () => whatsappApi.reembed(),
    onSuccess: (r: any) => { setReembedMsg(`Embeddings recalculados: ${r.data?.embedded}/${r.data?.total}.`); invalidate(); setTimeout(() => setReembedMsg(null), 4000) },
    onError: () => setReembedMsg('Falha ao recalcular embeddings.'),
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">WhatsApp · Categorias</h1>
          <p className="text-gray-400 text-sm mt-1">{list.length} categoria(s). Classificação semântica das ocorrências.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => reembed.mutate()} disabled={reembed.isPending}
            className="px-4 py-2 bg-gray-700 text-gray-200 rounded-lg text-sm hover:bg-gray-600 disabled:opacity-40 flex items-center gap-2">
            {reembed.isPending ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />} Recalcular embeddings
          </button>
          <button onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2">
            <Plus size={16} /> Nova Categoria
          </button>
        </div>
      </div>

      {reembedMsg && <div className="mb-4 text-sm text-cyan-400">{reembedMsg}</div>}

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando…</div>
      ) : isError ? (
        <div className="text-center py-12 text-red-400">Erro ao carregar categorias.</div>
      ) : (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Nome</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Prioridade</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Palavras-chave</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Sinônimos</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Embedding</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Ativa</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-500">Nenhuma categoria. Crie ex.: Iluminação (poste, lâmpada), Buraco (asfalto, cratera), Água (vazamento, cano).</td></tr>
              )}
              {list.map(c => (
                <tr key={c.id} className={`border-b border-gray-700/50 hover:bg-gray-700/20 ${!c.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-center text-gray-300">{c.priority}</td>
                  <td className="px-4 py-3 text-center text-gray-300">{c.keywords?.length ?? 0}</td>
                  <td className="px-4 py-3 text-center text-gray-300">{c.synonyms?.length ?? 0}</td>
                  <td className="px-4 py-3 text-center">
                    {c.embedded
                      ? <span className="inline-flex items-center gap-1 text-xs text-green-400"><Check size={13} /> ok</span>
                      : <span className="text-xs text-amber-400">pendente</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full border ${c.active ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                      {c.active ? 'sim' : 'não'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditCat(c)} className="text-xs px-3 py-1 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600">Editar</button>
                      {c.active && (
                        <button onClick={() => remove.mutate(c.id)} className="text-xs px-3 py-1 bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30">Desativar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <CategoryModal saving={create.isPending} onClose={() => setShowModal(false)} onSave={d => create.mutate(d)} />}
      {editCat && <CategoryModal category={editCat} saving={update.isPending} onClose={() => setEditCat(undefined)} onSave={d => update.mutate({ id: editCat.id, d })} />}
    </div>
  )
}
