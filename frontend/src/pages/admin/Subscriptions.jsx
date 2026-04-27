import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CreditCard, Calendar, User, Search, X, CheckCircle, Clock } from 'lucide-react';
import api from '../../lib/api';

const StatusBadge = ({ status }) => (
  <span className={`badge text-xs flex items-center gap-1 ${status === 'active' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
    {status === 'active' ? <CheckCircle size={10} /> : <Clock size={10} />}
    {status === 'active' ? 'Activa' : 'Expirada'}
  </span>
);

export default function Subscriptions() {
  const [subs, setSubs]     = useState([]);
  const [users, setUsers]   = useState([]);
  const [plans, setPlans]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm]     = useState({ user_id: '', plan_id: '', duration_days: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/admin/subscriptions'),
      api.get('/admin/plans'),
    ]).then(([s, p]) => {
      setSubs(s.data);
      setPlans(p.data.filter(p => p.active));
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const searchUsers = async (q) => {
    setUserSearch(q);
    if (!q.trim()) { setUserResults([]); return; }
    try {
      const r = await api.get(`/admin/users?search=${encodeURIComponent(q)}&limit=8`);
      setUserResults(r.data.users || []);
    } catch {}
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta suscripción?')) return;
    await api.delete(`/admin/subscriptions/${id}`);
    load();
  };

  const openModal = () => {
    setForm({ user_id: '', plan_id: '', duration_days: '', notes: '' });
    setUserSearch(''); setUserResults([]); setError('');
    setModal(true);
  };

  const selectUser = (u) => {
    setForm(f => ({ ...f, user_id: u.id }));
    setUserSearch(u.name + ' — ' + u.email);
    setUserResults([]);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.user_id || !form.plan_id) { setError('Selecciona un usuario y un plan'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/admin/subscriptions', { ...form, duration_days: Number(form.duration_days) || undefined });
      setModal(false);
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const filtered = subs.filter(s =>
    !search || s.user_name?.toLowerCase().includes(search.toLowerCase()) || s.user_email?.toLowerCase().includes(search.toLowerCase()) || s.plan_name?.toLowerCase().includes(search.toLowerCase())
  );

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-white">Suscripciones</h1>
          <p className="text-gray-400 mt-1">Gestiona los accesos de los usuarios</p>
        </div>
        <button onClick={openModal} className="btn-primary">
          <Plus size={18} /> Asignar Suscripción
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por usuario o plan..."
          className="w-full bg-gray-900 border border-gray-800 text-white placeholder-gray-600 text-sm rounded-xl pl-9 pr-8 py-2.5 focus:outline-none focus:border-accent"
        />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"><X size={14} /></button>}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <CreditCard size={52} className="text-gray-600 mx-auto mb-4" />
          <p className="text-white font-bold text-lg mb-2">{search ? 'Sin resultados' : 'Sin suscripciones'}</p>
          {!search && <p className="text-gray-500 text-sm mb-6">Asigna un plan a un usuario para que acceda a los contenidos premium</p>}
          {!search && <button onClick={openModal} className="btn-primary justify-center"><Plus size={16} /> Asignar Suscripción</button>}
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Usuario', 'Plan', 'Inicio', 'Vence', 'Estado', ''].map(h => (
                    <th key={h} className="text-left text-gray-500 text-xs font-semibold uppercase tracking-wider px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {filtered.map(s => (
                  <tr key={s.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-accent/20 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-accent-light font-bold text-xs">{s.user_name?.[0]?.toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium">{s.user_name}</p>
                          <p className="text-gray-500 text-xs">{s.user_email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.plan_color }} />
                        <span className="text-white text-sm font-medium">{s.plan_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{fmtDate(s.starts_at)}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {s.expires_at ? (
                        <span className={new Date(s.expires_at) < new Date() ? 'text-red-400' : ''}>
                          {fmtDate(s.expires_at)}
                        </span>
                      ) : <span className="text-green-400 text-xs">Sin vencimiento</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(s.id)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-800 text-gray-600 text-xs">
            {filtered.length} suscripci{filtered.length !== 1 ? 'ones' : 'ón'} — {subs.filter(s => s.status === 'active').length} activas
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-white mb-5">Asignar Suscripción</h2>
            <form onSubmit={handleSave} className="space-y-4">

              {/* User search */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Usuario</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    className="input-field pl-9"
                    value={userSearch}
                    onChange={e => searchUsers(e.target.value)}
                    placeholder="Buscar usuario..."
                    autoComplete="off"
                  />
                </div>
                {userResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-xl overflow-hidden">
                    {userResults.map(u => (
                      <button key={u.id} type="button" onClick={() => selectUser(u)}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-800 transition-colors flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-accent/20 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-accent-light text-xs font-bold">{u.name?.[0]?.toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium">{u.name}</p>
                          <p className="text-gray-500 text-xs">{u.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {form.user_id && <p className="text-green-400 text-xs mt-1">✓ Usuario seleccionado (ID: {form.user_id})</p>}
              </div>

              {/* Plan */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Plan</label>
                <select className="input-field" value={form.plan_id} onChange={e => setForm({ ...form, plan_id: e.target.value })} required>
                  <option value="">Seleccionar plan...</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name} — ${p.price}/{p.duration_days === 0 ? '∞' : `${p.duration_days}d`}</option>)}
                </select>
              </div>

              {/* Duration override */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Duración (días) <span className="text-gray-600 font-normal">— opcional, sobreescribe el plan</span></label>
                <input type="number" min="0" className="input-field" value={form.duration_days} onChange={e => setForm({ ...form, duration_days: e.target.value })} placeholder="Dejar vacío para usar la del plan" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Notas internas</label>
                <input className="input-field" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Opcional..." />
              </div>

              {error && <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-lg p-3 text-sm">{error}</div>}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary py-2">
                  {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Asignar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
