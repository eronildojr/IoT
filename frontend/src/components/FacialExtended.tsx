import { useState, useEffect, useCallback } from 'react';
import { Users, Shield, Clock, Bell, Activity, BarChart2, FileText, ChevronDown, ChevronUp, Plus, Edit2, Trash2, Check, X, AlertTriangle, UserCheck, UserX, Eye, Download, Calendar, RefreshCw, Zap, Lock, Unlock, Settings } from 'lucide-react';
import api from '../services/api';

// ============================================================
// TIPOS
// ============================================================
interface AccessGroup { id: number; name: string; description: string; group_type: string; color: string; active: boolean; person_count?: number; }
interface AccessPoint { id: number; name: string; location: string; camera_id: number; relay_ip: string; relay_port: number; relay_channel?: number; relay_type: string; auto_open_on_recognized: boolean; auto_open_on_vip: boolean; block_unknown: boolean; block_blacklisted: boolean; active: boolean; camera_name?: string; }
interface AlertRule { id: number; name: string; trigger_type: string; notify_push: boolean; notify_whatsapp: boolean; notify_email: boolean; cooldown_minutes: number; active: boolean; person_name?: string; group_name?: string; }
interface Schedule { id: number; name: string; days_of_week: number[]; time_start: string; time_end: string; valid_from?: string; valid_until?: string; active: boolean; person_name?: string; group_name?: string; }
interface PresenceEntry { id: number; person_name: string; department: string; event_type: string; confidence: number; camera_name: string; created_at: number; }
interface BehaviorEvent { id: number; behavior_type: string; confidence: number; duration_seconds: number; person_count: number; camera_name: string; created_at: number; }
interface DashboardData { persons: any; events: any; groups: any; access_points: any; alert_rules: any; behavior_24h: any; presence_today: any; access_log_24h: any; }

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TRIGGER_LABELS: Record<string, string> = {
  blocked_detected: 'Bloqueado Detectado',
  unknown_detected: 'Desconhecido Detectado',
  vip_detected: 'VIP Detectado',
  person_detected: 'Pessoa Detectada',
  access_denied: 'Acesso Negado',
  access_granted: 'Acesso Liberado',
};
const BEHAVIOR_LABELS: Record<string, string> = {
  loitering: 'Permanência Suspeita',
  running: 'Corrida',
  crowd: 'Aglomeração',
  tailgating: 'Passagem Não Autorizada',
  perimeter_breach: 'Violação de Perímetro',
  abandoned_object: 'Objeto Abandonado',
};
const GROUP_TYPE_LABELS: Record<string, string> = {
  employee: 'Funcionário',
  visitor: 'Visitante',
  vip: 'VIP',
  blocked: 'Bloqueado',
  contractor: 'Terceiro',
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function FacialExtended() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'groups' | 'access' | 'schedules' | 'alerts' | 'presence' | 'behavior' | 'reports'>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await api.get('/facial/dashboard');
      setDashboard(res.data);
    } catch {}
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const tabs = [
    { key: 'dashboard', label: 'Visão Geral', icon: BarChart2 },
    { key: 'groups', label: 'Grupos', icon: Users },
    { key: 'access', label: 'Controle de Acesso', icon: Shield },
    { key: 'schedules', label: 'Agendamentos', icon: Clock },
    { key: 'alerts', label: 'Alertas', icon: Bell },
    { key: 'presence', label: 'Presença', icon: UserCheck },
    { key: 'behavior', label: 'Comportamental', icon: Activity },
    { key: 'reports', label: 'Relatórios', icon: FileText },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-700 pb-2">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === t.key
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
              }`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === 'dashboard' && <DashboardTab data={dashboard} onRefresh={loadDashboard} />}
      {activeTab === 'groups' && <GroupsTab />}
      {activeTab === 'access' && <AccessPointsTab />}
      {activeTab === 'schedules' && <SchedulesTab />}
      {activeTab === 'alerts' && <AlertRulesTab />}
      {activeTab === 'presence' && <PresenceTab />}
      {activeTab === 'behavior' && <BehaviorTab />}
      {activeTab === 'reports' && <ReportsTab />}
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function DashboardTab({ data, onRefresh }: { data: DashboardData | null; onRefresh: () => void }) {
  if (!data) return <div className="text-center py-8 text-gray-400">Carregando...</div>;

  const cards = [
    { label: 'Total de Pessoas', value: data.persons?.total || 0, color: 'text-blue-400', icon: Users },
    { label: 'Permitidos', value: data.persons?.allowed || 0, color: 'text-green-400', icon: UserCheck },
    { label: 'Bloqueados', value: data.persons?.blocked || 0, color: 'text-red-400', icon: UserX },
    { label: 'VIPs', value: data.persons?.vip || 0, color: 'text-yellow-400', icon: Zap },
    { label: 'Eventos (24h)', value: data.events?.last_24h || 0, color: 'text-purple-400', icon: Activity },
    { label: 'Reconhecidos', value: data.events?.recognized || 0, color: 'text-cyan-400', icon: Check },
    { label: 'Presença Hoje', value: data.presence_today?.unique_persons || 0, color: 'text-indigo-400', icon: UserCheck },
    { label: 'Comportamental (24h)', value: data.behavior_24h?.total || 0, color: 'text-orange-400', icon: AlertTriangle },
    { label: 'Pontos de Acesso', value: data.access_points?.total || 0, color: 'text-teal-400', icon: Shield },
    { label: 'Acessos Liberados (24h)', value: data.access_log_24h?.granted || 0, color: 'text-green-300', icon: Unlock },
    { label: 'Acessos Negados (24h)', value: data.access_log_24h?.denied || 0, color: 'text-red-300', icon: Lock },
    { label: 'Regras de Alerta', value: data.alert_rules?.total || 0, color: 'text-pink-400', icon: Bell },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Visão Geral do Módulo Facial</h3>
        <button onClick={onRefresh} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-700">
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className={c.color} />
                <span className="text-xs text-gray-400">{c.label}</span>
              </div>
              <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// GRUPOS DE ACESSO
// ============================================================
function GroupsTab() {
  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AccessGroup | null>(null);
  const [form, setForm] = useState({ name: '', description: '', group_type: 'employee', color: '#3B82F6' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get('/facial/groups'); setGroups(res.data.groups || []); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      if (editing) { await api.put(`/facial/groups/${editing.id}`, { ...form, active: true }); }
      else { await api.post('/facial/groups', form); }
      setShowForm(false); setEditing(null); setForm({ name: '', description: '', group_type: 'employee', color: '#3B82F6' });
      load();
    } catch (e: any) { alert(e.response?.data?.error || 'Erro ao salvar'); }
  };

  const del = async (id: number) => {
    if (!confirm('Excluir grupo?')) return;
    try { await api.delete(`/facial/groups/${id}`); load(); } catch (e: any) { alert(e.response?.data?.error || 'Erro'); }
  };

  const startEdit = (g: AccessGroup) => { setEditing(g); setForm({ name: g.name, description: g.description || '', group_type: g.group_type, color: g.color }); setShowForm(true); };

  const GROUP_COLORS: Record<string, string> = { employee: 'bg-blue-500/20 text-blue-300 border-blue-500/30', visitor: 'bg-green-500/20 text-green-300 border-green-500/30', vip: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', blocked: 'bg-red-500/20 text-red-300 border-red-500/30', contractor: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Grupos de Acesso</h3>
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', description: '', group_type: 'employee', color: '#3B82F6' }); }} className="flex items-center gap-1 text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg">
          <Plus size={13} /> Novo Grupo
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-800/80 border border-purple-500/30 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-medium text-gray-200">{editing ? 'Editar Grupo' : 'Novo Grupo'}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Nome *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" placeholder="Nome do grupo" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Tipo</label>
              <select value={form.group_type} onChange={e => setForm(f => ({ ...f, group_type: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500">
                {Object.entries(GROUP_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">Descrição</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" placeholder="Descrição opcional" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Cor</label>
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-full h-9 bg-gray-700 border border-gray-600 rounded-lg cursor-pointer" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg"><Check size={13} /> Salvar</button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="flex items-center gap-1 text-xs bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg"><X size={13} /> Cancelar</button>
          </div>
        </div>
      )}

      {loading ? <div className="text-center py-6 text-gray-400 text-sm">Carregando...</div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {groups.map(g => (
            <div key={g.id} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color }} />
                  <span className="text-sm font-medium text-gray-200">{g.name}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(g)} className="p-1 text-gray-400 hover:text-blue-400"><Edit2 size={13} /></button>
                  <button onClick={() => del(g.id)} className="p-1 text-gray-400 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${GROUP_COLORS[g.group_type] || 'bg-gray-700 text-gray-300 border-gray-600'}`}>{GROUP_TYPE_LABELS[g.group_type] || g.group_type}</span>
              {g.description && <p className="text-xs text-gray-400 mt-2">{g.description}</p>}
              <p className="text-xs text-gray-500 mt-2">{g.person_count || 0} pessoas</p>
            </div>
          ))}
          {groups.length === 0 && <div className="col-span-3 text-center py-6 text-gray-500 text-sm">Nenhum grupo cadastrado</div>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// PONTOS DE ACESSO
// ============================================================
function AccessPointsTab() {
  const [points, setPoints] = useState<AccessPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AccessPoint | null>(null);
  const [form, setForm] = useState({ name: '', location: '', camera_id: '', relay_ip: '', relay_port: '80', relay_channel: '1', relay_type: 'http', auto_open_on_recognized: true, auto_open_on_vip: true, block_unknown: true, block_blacklisted: true });
  const [triggering, setTriggering] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get('/facial/access-points'); setPoints(res.data.access_points || []); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      const payload = { ...form, camera_id: form.camera_id ? Number(form.camera_id) : null, relay_port: Number(form.relay_port), relay_channel: Number(form.relay_channel) };
      if (editing) { await api.put(`/facial/access-points/${editing.id}`, { ...payload, active: true }); }
      else { await api.post('/facial/access-points', payload); }
      setShowForm(false); setEditing(null); load();
    } catch (e: any) { alert(e.response?.data?.error || 'Erro ao salvar'); }
  };

  const del = async (id: number) => {
    if (!confirm('Excluir ponto de acesso?')) return;
    try { await api.delete(`/facial/access-points/${id}`); load(); } catch {}
  };

  const trigger = async (id: number) => {
    setTriggering(id);
    try {
      const res = await api.post(`/facial/access-points/${id}/trigger`);
      alert(res.data.relay_triggered ? 'Relay acionado com sucesso!' : 'Comando enviado (relay pode não ter respondido)');
    } catch (e: any) { alert(e.response?.data?.error || 'Erro ao acionar'); }
    setTriggering(null);
  };

  const startEdit = (p: AccessPoint) => {
    setEditing(p);
    setForm({ name: p.name, location: p.location || '', camera_id: p.camera_id?.toString() || '', relay_ip: p.relay_ip || '', relay_port: p.relay_port?.toString() || '80', relay_channel: p.relay_channel?.toString() || '1', relay_type: p.relay_type || 'http', auto_open_on_recognized: p.auto_open_on_recognized, auto_open_on_vip: p.auto_open_on_vip, block_unknown: p.block_unknown, block_blacklisted: p.block_blacklisted });
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Pontos de Acesso (Catracas/Portões)</h3>
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', location: '', camera_id: '', relay_ip: '', relay_port: '80', relay_channel: '1', relay_type: 'http', auto_open_on_recognized: true, auto_open_on_vip: true, block_unknown: true, block_blacklisted: true }); }} className="flex items-center gap-1 text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg">
          <Plus size={13} /> Novo Ponto
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-800/80 border border-purple-500/30 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-medium text-gray-200">{editing ? 'Editar Ponto de Acesso' : 'Novo Ponto de Acesso'}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-400 mb-1 block">Nome *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" placeholder="Ex: Portão Principal" /></div>
            <div><label className="text-xs text-gray-400 mb-1 block">Localização</label><input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" placeholder="Ex: Entrada principal" /></div>
            <div><label className="text-xs text-gray-400 mb-1 block">IP do Relay</label><input value={form.relay_ip} onChange={e => setForm(f => ({ ...f, relay_ip: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" placeholder="192.168.1.100" /></div>
            <div><label className="text-xs text-gray-400 mb-1 block">Porta</label><input type="number" value={form.relay_port} onChange={e => setForm(f => ({ ...f, relay_port: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" /></div>
            <div><label className="text-xs text-gray-400 mb-1 block">Tipo de Relay</label>
              <select value={form.relay_type} onChange={e => setForm(f => ({ ...f, relay_type: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500">
                <option value="http">HTTP</option><option value="mqtt">MQTT</option><option value="tcp">TCP</option><option value="wiegand">Wiegand</option>
              </select>
            </div>
            <div><label className="text-xs text-gray-400 mb-1 block">Canal</label><input type="number" value={form.relay_channel} onChange={e => setForm(f => ({ ...f, relay_channel: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[['auto_open_on_recognized', 'Abrir para Reconhecidos'], ['auto_open_on_vip', 'Abrir para VIPs'], ['block_unknown', 'Bloquear Desconhecidos'], ['block_blacklisted', 'Bloquear Bloqueados']].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input type="checkbox" checked={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} className="rounded" />
                {label}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg"><Check size={13} /> Salvar</button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="flex items-center gap-1 text-xs bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg"><X size={13} /> Cancelar</button>
          </div>
        </div>
      )}

      {loading ? <div className="text-center py-6 text-gray-400 text-sm">Carregando...</div> : (
        <div className="space-y-3">
          {points.map(p => (
            <div key={p.id} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Shield size={14} className="text-teal-400" />
                    <span className="text-sm font-medium text-gray-200">{p.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.active ? 'bg-green-500/20 text-green-300' : 'bg-gray-600 text-gray-400'}`}>{p.active ? 'Ativo' : 'Inativo'}</span>
                  </div>
                  {p.location && <p className="text-xs text-gray-400">{p.location}</p>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {p.relay_ip && <span className="text-xs text-gray-500">Relay: {p.relay_ip}:{p.relay_port} ({p.relay_type})</span>}
                    {p.camera_name && <span className="text-xs text-gray-500">Câmera: {p.camera_name}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {p.auto_open_on_recognized && <span className="text-xs bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded">Abre p/ Reconhecidos</span>}
                    {p.auto_open_on_vip && <span className="text-xs bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded">Abre p/ VIPs</span>}
                    {p.block_unknown && <span className="text-xs bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">Bloqueia Desconhecidos</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => trigger(p.id)} disabled={triggering === p.id} className="flex items-center gap-1 text-xs bg-teal-600 hover:bg-teal-700 text-white px-2 py-1 rounded-lg disabled:opacity-50">
                    {triggering === p.id ? <RefreshCw size={11} className="animate-spin" /> : <Zap size={11} />} Acionar
                  </button>
                  <button onClick={() => startEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-400"><Edit2 size={13} /></button>
                  <button onClick={() => del(p.id)} className="p-1.5 text-gray-400 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          ))}
          {points.length === 0 && <div className="text-center py-8 text-gray-500 text-sm">Nenhum ponto de acesso cadastrado.<br /><span className="text-xs text-gray-600">Adicione catracas, portões ou cancelas para controle de acesso por reconhecimento facial.</span></div>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// AGENDAMENTOS
// ============================================================
function SchedulesTab() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', person_id: '', group_id: '', days_of_week: [1,2,3,4,5], time_start: '08:00', time_end: '18:00', valid_from: '', valid_until: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get('/facial/schedules'); setSchedules(res.data.schedules || []); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      await api.post('/facial/schedules', { ...form, person_id: form.person_id ? Number(form.person_id) : null, group_id: form.group_id ? Number(form.group_id) : null });
      setShowForm(false); setForm({ name: '', person_id: '', group_id: '', days_of_week: [1,2,3,4,5], time_start: '08:00', time_end: '18:00', valid_from: '', valid_until: '' }); load();
    } catch (e: any) { alert(e.response?.data?.error || 'Erro ao salvar'); }
  };

  const del = async (id: number) => {
    if (!confirm('Excluir agendamento?')) return;
    try { await api.delete(`/facial/schedules/${id}`); load(); } catch {}
  };

  const toggleDay = (day: number) => {
    setForm(f => ({ ...f, days_of_week: f.days_of_week.includes(day) ? f.days_of_week.filter(d => d !== day) : [...f.days_of_week, day] }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Agendamentos de Acesso</h3>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg"><Plus size={13} /> Novo Agendamento</button>
      </div>

      {showForm && (
        <div className="bg-gray-800/80 border border-purple-500/30 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-medium text-gray-200">Novo Agendamento</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="text-xs text-gray-400 mb-1 block">Nome *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" placeholder="Ex: Horário Comercial" /></div>
            <div><label className="text-xs text-gray-400 mb-1 block">Hora Início</label><input type="time" value={form.time_start} onChange={e => setForm(f => ({ ...f, time_start: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" /></div>
            <div><label className="text-xs text-gray-400 mb-1 block">Hora Fim</label><input type="time" value={form.time_end} onChange={e => setForm(f => ({ ...f, time_end: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" /></div>
            <div><label className="text-xs text-gray-400 mb-1 block">Válido de</label><input type="date" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" /></div>
            <div><label className="text-xs text-gray-400 mb-1 block">Válido até</label><input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" /></div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-2 block">Dias da Semana</label>
            <div className="flex gap-1">
              {DAY_LABELS.map((d, i) => (
                <button key={i} onClick={() => toggleDay(i)} className={`w-9 h-9 rounded-lg text-xs font-medium transition-all ${form.days_of_week.includes(i) ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>{d}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg"><Check size={13} /> Salvar</button>
            <button onClick={() => setShowForm(false)} className="flex items-center gap-1 text-xs bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg"><X size={13} /> Cancelar</button>
          </div>
        </div>
      )}

      {loading ? <div className="text-center py-6 text-gray-400 text-sm">Carregando...</div> : (
        <div className="space-y-2">
          {schedules.map(s => (
            <div key={s.id} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={13} className="text-indigo-400" />
                  <span className="text-sm font-medium text-gray-200">{s.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${s.active ? 'bg-green-500/20 text-green-300' : 'bg-gray-600 text-gray-400'}`}>{s.active ? 'Ativo' : 'Inativo'}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{s.time_start} – {s.time_end}</span>
                  <span>{s.days_of_week?.map((d: number) => DAY_LABELS[d]).join(', ')}</span>
                  {s.person_name && <span>Pessoa: {s.person_name}</span>}
                  {s.group_name && <span>Grupo: {s.group_name}</span>}
                </div>
              </div>
              <button onClick={() => del(s.id)} className="p-1.5 text-gray-400 hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
          {schedules.length === 0 && <div className="text-center py-8 text-gray-500 text-sm">Nenhum agendamento cadastrado.<br /><span className="text-xs text-gray-600">Defina horários de acesso permitidos por pessoa ou grupo.</span></div>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// REGRAS DE ALERTA
// ============================================================
function AlertRulesTab() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', trigger_type: 'blocked_detected', notify_push: true, notify_whatsapp: false, notify_email: false, whatsapp_numbers: '', email_addresses: '', cooldown_minutes: 5 });

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get('/facial/alert-rules'); setRules(res.data.rules || []); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      const payload = {
        ...form,
        whatsapp_numbers: form.whatsapp_numbers ? form.whatsapp_numbers.split(',').map(s => s.trim()) : [],
        email_addresses: form.email_addresses ? form.email_addresses.split(',').map(s => s.trim()) : [],
      };
      await api.post('/facial/alert-rules', payload);
      setShowForm(false); load();
    } catch (e: any) { alert(e.response?.data?.error || 'Erro ao salvar'); }
  };

  const toggleActive = async (r: AlertRule) => {
    try { await api.put(`/facial/alert-rules/${r.id}`, { ...r, active: !r.active }); load(); } catch {}
  };

  const del = async (id: number) => {
    if (!confirm('Excluir regra?')) return;
    try { await api.delete(`/facial/alert-rules/${id}`); load(); } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Regras de Alerta em Tempo Real</h3>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg"><Plus size={13} /> Nova Regra</button>
      </div>

      {showForm && (
        <div className="bg-gray-800/80 border border-purple-500/30 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-medium text-gray-200">Nova Regra de Alerta</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="text-xs text-gray-400 mb-1 block">Nome *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" placeholder="Ex: Alerta de Bloqueado" /></div>
            <div><label className="text-xs text-gray-400 mb-1 block">Gatilho</label>
              <select value={form.trigger_type} onChange={e => setForm(f => ({ ...f, trigger_type: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500">
                {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-gray-400 mb-1 block">Cooldown (min)</label><input type="number" value={form.cooldown_minutes} onChange={e => setForm(f => ({ ...f, cooldown_minutes: Number(e.target.value) }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" /></div>
            <div className="col-span-2"><label className="text-xs text-gray-400 mb-1 block">WhatsApp (separados por vírgula)</label><input value={form.whatsapp_numbers} onChange={e => setForm(f => ({ ...f, whatsapp_numbers: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" placeholder="+5511999999999, +5521888888888" /></div>
            <div className="col-span-2"><label className="text-xs text-gray-400 mb-1 block">E-mails (separados por vírgula)</label><input value={form.email_addresses} onChange={e => setForm(f => ({ ...f, email_addresses: e.target.value }))} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" placeholder="admin@empresa.com, seguranca@empresa.com" /></div>
          </div>
          <div className="flex gap-4">
            {[['notify_push', 'Push'], ['notify_whatsapp', 'WhatsApp'], ['notify_email', 'E-mail']].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input type="checkbox" checked={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} className="rounded" />
                {label}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg"><Check size={13} /> Salvar</button>
            <button onClick={() => setShowForm(false)} className="flex items-center gap-1 text-xs bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg"><X size={13} /> Cancelar</button>
          </div>
        </div>
      )}

      {loading ? <div className="text-center py-6 text-gray-400 text-sm">Carregando...</div> : (
        <div className="space-y-2">
          {rules.map(r => (
            <div key={r.id} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Bell size={13} className="text-pink-400" />
                  <span className="text-sm font-medium text-gray-200">{r.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${r.active ? 'bg-green-500/20 text-green-300' : 'bg-gray-600 text-gray-400'}`}>{r.active ? 'Ativo' : 'Inativo'}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{TRIGGER_LABELS[r.trigger_type] || r.trigger_type}</span>
                  <span>Cooldown: {r.cooldown_minutes}min</span>
                  <div className="flex gap-1">
                    {r.notify_push && <span className="bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded">Push</span>}
                    {r.notify_whatsapp && <span className="bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded">WhatsApp</span>}
                    {r.notify_email && <span className="bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded">E-mail</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => toggleActive(r)} className={`p-1.5 ${r.active ? 'text-green-400 hover:text-gray-400' : 'text-gray-400 hover:text-green-400'}`}>{r.active ? <Check size={13} /> : <X size={13} />}</button>
                <button onClick={() => del(r.id)} className="p-1.5 text-gray-400 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
          {rules.length === 0 && <div className="text-center py-8 text-gray-500 text-sm">Nenhuma regra de alerta cadastrada.<br /><span className="text-xs text-gray-600">Configure alertas para receber notificações quando pessoas bloqueadas ou desconhecidas forem detectadas.</span></div>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// DASHBOARD DE PRESENÇA
// ============================================================
function PresenceTab() {
  const [presence, setPresence] = useState<PresenceEntry[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [view, setView] = useState<'summary' | 'log'>('summary');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        api.get(`/facial/presence?date=${date}`),
        api.get(`/facial/presence/summary?date=${date}`),
      ]);
      setPresence(pRes.data.presence || []);
      setSummary(sRes.data.summary || []);
    } catch {}
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-300">Dashboard de Presença</h3>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-purple-500" />
          <div className="flex rounded-lg overflow-hidden border border-gray-600">
            <button onClick={() => setView('summary')} className={`px-3 py-1.5 text-xs ${view === 'summary' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400'}`}>Resumo</button>
            <button onClick={() => setView('log')} className={`px-3 py-1.5 text-xs ${view === 'log' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400'}`}>Log</button>
          </div>
          <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-200"><RefreshCw size={14} /></button>
        </div>
      </div>

      {loading ? <div className="text-center py-6 text-gray-400 text-sm">Carregando...</div> : view === 'summary' ? (
        <div className="space-y-2">
          {summary.filter(s => Number(s.total_events) > 0).map(s => (
            <div key={s.id} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-3 flex items-center gap-3">
              {s.photo_url ? <img src={s.photo_url} alt={s.name} className="w-10 h-10 rounded-full object-cover border border-gray-600" /> : <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center"><Users size={16} className="text-gray-400" /></div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-200">{s.name}</span>
                  {s.department && <span className="text-xs text-gray-500">{s.department}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                  <span>Entradas: {s.entries || 0}</span>
                  <span>Saídas: {s.exits || 0}</span>
                  {s.first_seen && <span>1ª vez: {formatTime(Number(s.first_seen))}</span>}
                  {s.last_seen && <span>Última: {formatTime(Number(s.last_seen))}</span>}
                </div>
              </div>
              <span className="text-lg font-bold text-purple-400">{s.total_events}</span>
            </div>
          ))}
          {summary.filter(s => Number(s.total_events) > 0).length === 0 && <div className="text-center py-8 text-gray-500 text-sm">Nenhuma presença registrada nesta data.</div>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-gray-700"><th className="text-left py-2 px-3 text-gray-400">Pessoa</th><th className="text-left py-2 px-3 text-gray-400">Tipo</th><th className="text-left py-2 px-3 text-gray-400">Câmera</th><th className="text-left py-2 px-3 text-gray-400">Confiança</th><th className="text-left py-2 px-3 text-gray-400">Hora</th></tr></thead>
            <tbody>
              {presence.map(p => (
                <tr key={p.id} className="border-b border-gray-700/30 hover:bg-gray-700/20">
                  <td className="py-2 px-3 text-gray-200">{p.person_name || 'Desconhecido'}</td>
                  <td className="py-2 px-3"><span className={`px-1.5 py-0.5 rounded-full ${p.event_type === 'entry' ? 'bg-green-500/20 text-green-300' : p.event_type === 'exit' ? 'bg-red-500/20 text-red-300' : 'bg-gray-600 text-gray-300'}`}>{p.event_type === 'entry' ? 'Entrada' : p.event_type === 'exit' ? 'Saída' : 'Passagem'}</span></td>
                  <td className="py-2 px-3 text-gray-400">{p.camera_name || '-'}</td>
                  <td className="py-2 px-3 text-gray-400">{p.confidence ? `${(p.confidence * 100).toFixed(0)}%` : '-'}</td>
                  <td className="py-2 px-3 text-gray-400">{formatTime(p.created_at)}</td>
                </tr>
              ))}
              {presence.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-gray-500">Nenhum registro</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ANÁLISE COMPORTAMENTAL
// ============================================================
function BehaviorTab() {
  const [events, setEvents] = useState<BehaviorEvent[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, sRes] = await Promise.all([
        api.get(`/facial/behavior${filter ? `?behavior_type=${filter}` : ''}`),
        api.get('/facial/behavior/stats'),
      ]);
      setEvents(eRes.data.events || []);
      setStats(sRes.data.stats || []);
    } catch {}
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const BEHAVIOR_COLORS: Record<string, string> = {
    loitering: 'bg-yellow-500/20 text-yellow-300',
    running: 'bg-orange-500/20 text-orange-300',
    crowd: 'bg-red-500/20 text-red-300',
    tailgating: 'bg-purple-500/20 text-purple-300',
    perimeter_breach: 'bg-pink-500/20 text-pink-300',
    abandoned_object: 'bg-blue-500/20 text-blue-300',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-300">Análise Comportamental</h3>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500">
            <option value="">Todos os tipos</option>
            {Object.entries(BEHAVIOR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-200"><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Stats */}
      {stats.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {stats.map(s => (
            <div key={s.behavior_type} className={`rounded-xl p-2 text-center ${BEHAVIOR_COLORS[s.behavior_type] || 'bg-gray-700 text-gray-300'}`}>
              <div className="text-lg font-bold">{s.count}</div>
              <div className="text-xs opacity-80">{BEHAVIOR_LABELS[s.behavior_type] || s.behavior_type}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? <div className="text-center py-6 text-gray-400 text-sm">Carregando...</div> : (
        <div className="space-y-2">
          {events.map(e => (
            <div key={e.id} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${BEHAVIOR_COLORS[e.behavior_type] || 'bg-gray-600 text-gray-300'}`}>{BEHAVIOR_LABELS[e.behavior_type] || e.behavior_type}</span>
                  {e.camera_name && <span className="text-xs text-gray-400">{e.camera_name}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  {e.confidence > 0 && <span>Confiança: {(e.confidence * 100).toFixed(0)}%</span>}
                  {e.duration_seconds > 0 && <span>Duração: {e.duration_seconds}s</span>}
                  {e.person_count > 0 && <span>Pessoas: {e.person_count}</span>}
                  <span>{new Date(e.created_at).toLocaleString('pt-BR')}</span>
                </div>
              </div>
              {e.behavior_type === 'loitering' && <AlertTriangle size={16} className="text-yellow-400" />}
              {e.behavior_type === 'crowd' && <Users size={16} className="text-red-400" />}
            </div>
          ))}
          {events.length === 0 && <div className="text-center py-8 text-gray-500 text-sm">Nenhum evento comportamental registrado.<br /><span className="text-xs text-gray-600">Os eventos são enviados pelas câmeras via webhook POST /api/facial/behavior</span></div>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// RELATÓRIOS
// ============================================================
function ReportsTab() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]; });
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);
  const [daily, setDaily] = useState<any[]>([]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const [rRes, dRes] = await Promise.all([
        api.get(`/facial/reports/audit?from=${from}&to=${to}`),
        api.get('/facial/reports/presence-daily?days=14'),
      ]);
      setReport(rRes.data);
      setDaily(dRes.data.daily || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadReport(); }, []);

  const exportCSV = () => {
    if (!report) return;
    const rows = report.facial_events.map((e: any) => [e.id, e.person_name || 'Desconhecido', e.event_type, e.confidence || '', e.camera_name || '', e.detected_at].join(','));
    const csv = ['ID,Pessoa,Tipo,Confiança,Câmera,Data', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `auditoria_facial_${from}_${to}.csv`; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-300">Relatórios de Auditoria</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500" />
          <span className="text-gray-500 text-xs">até</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500" />
          <button onClick={loadReport} className="flex items-center gap-1 text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg"><RefreshCw size={12} /> Gerar</button>
          {report && <button onClick={exportCSV} className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg"><Download size={12} /> CSV</button>}
        </div>
      </div>

      {loading ? <div className="text-center py-6 text-gray-400 text-sm">Gerando relatório...</div> : report && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-purple-400">{report.total_events}</div>
              <div className="text-xs text-gray-400">Eventos Faciais</div>
            </div>
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-blue-400">{report.total_presence}</div>
              <div className="text-xs text-gray-400">Registros de Presença</div>
            </div>
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-3 text-center">
              <div className="text-xs text-gray-400 mb-1">Período</div>
              <div className="text-xs text-gray-200">{from}</div>
              <div className="text-xs text-gray-500">até {to}</div>
            </div>
          </div>

          {/* Daily chart */}
          {daily.length > 0 && (
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4">
              <h4 className="text-xs font-medium text-gray-400 mb-3">Presença Diária (últimos 14 dias)</h4>
              <div className="space-y-1.5">
                {daily.slice(0, 10).map((d: any) => {
                  const max = Math.max(...daily.map((x: any) => Number(x.unique_persons)));
                  const pct = max > 0 ? (Number(d.unique_persons) / max) * 100 : 0;
                  return (
                    <div key={d.date} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-20 shrink-0">{new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                      <div className="flex-1 bg-gray-700 rounded-full h-4 overflow-hidden">
                        <div className="h-full bg-purple-500/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-400 w-8 text-right">{d.unique_persons}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Events table */}
          <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-300">Eventos Faciais ({report.facial_events.length})</span>
            </div>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-800"><tr className="border-b border-gray-700"><th className="text-left py-2 px-3 text-gray-400">Pessoa</th><th className="text-left py-2 px-3 text-gray-400">Tipo</th><th className="text-left py-2 px-3 text-gray-400">Câmera</th><th className="text-left py-2 px-3 text-gray-400">Data/Hora</th></tr></thead>
                <tbody>
                  {report.facial_events.slice(0, 100).map((e: any) => (
                    <tr key={e.id} className="border-b border-gray-700/30 hover:bg-gray-700/20">
                      <td className="py-1.5 px-3 text-gray-200">{e.person_name || 'Desconhecido'}</td>
                      <td className="py-1.5 px-3"><span className={`px-1.5 py-0.5 rounded-full text-xs ${e.event_type === 'recognized' ? 'bg-green-500/20 text-green-300' : e.event_type === 'unknown' ? 'bg-gray-600 text-gray-300' : 'bg-red-500/20 text-red-300'}`}>{e.event_type}</span></td>
                      <td className="py-1.5 px-3 text-gray-400">{e.camera_name || '-'}</td>
                      <td className="py-1.5 px-3 text-gray-500">{e.detected_at ? new Date(e.detected_at).toLocaleString('pt-BR') : '-'}</td>
                    </tr>
                  ))}
                  {report.facial_events.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-gray-500">Nenhum evento no período</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
