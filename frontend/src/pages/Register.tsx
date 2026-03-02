import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '../services/api'
import { useAuth } from '../store/auth'
import { Radio, Loader2 } from 'lucide-react'

export default function Register() {
  const navigate = useNavigate()
  const { setAuth } = useAuth()
  const [form, setForm] = useState({ tenantName: '', name: '', email: '', password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password !== form.confirm) { setError('Senhas não coincidem'); return }
    if (form.password.length < 8) { setError('Senha mínimo 8 caracteres'); return }
    setLoading(true); setError('')
    try {
      const r = await authApi.register({ tenantName: form.tenantName, name: form.name, email: form.email, password: form.password })
      setAuth(r.data.user, r.data.token)
      navigate('/dashboard')
    } catch (err: any) { setError(err.response?.data?.error || 'Erro ao criar conta') }
    finally { setLoading(false) }
  }

  const fields = [
    { k: 'tenantName', label: 'Nome da empresa', placeholder: 'Minha Empresa' },
    { k: 'name', label: 'Seu nome', placeholder: 'João Silva' },
    { k: 'email', label: 'E-mail', placeholder: 'seu@email.com', type: 'email' },
    { k: 'password', label: 'Senha (mín. 8 caracteres)', placeholder: '••••••••', type: 'password' },
    { k: 'confirm', label: 'Confirmar senha', placeholder: '••••••••', type: 'password' },
  ]

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 mb-4">
            <Radio className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Criar conta</h1>
          <p className="text-gray-500 text-sm mt-1">Configure sua plataforma IoT</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          {error && <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>}
          <form onSubmit={submit} className="space-y-4">
            {fields.map(({ k, label, placeholder, type = 'text' }) => (
              <div key={k}>
                <label className="label">{label}</label>
                <input type={type} value={(form as any)[k]} onChange={set(k)} required placeholder={placeholder} className="input" />
              </div>
            ))}
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
              {loading ? <><Loader2 size={18} className="animate-spin" /> Criando...</> : 'Criar conta'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-6">
            Já tem conta? <Link to="/login" className="text-cyan-400 hover:text-cyan-300 font-medium">Entrar</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
