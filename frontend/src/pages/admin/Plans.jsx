import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Star, Check, X, Tv, Monitor, Bookmark, Users } from 'lucide-react';
import api from '../../lib/api';

const PLAN_COLORS = ['#6b7280', '#3b82f6', '#7c3aed', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];

const emptyForm = {
  name: '',
  description: '',
  price: '',
  duration_days: 30,
  color: '#7c3aed',
  features: { iptv: false, hd: false, max_devices: 1, watchlist_limit: 0 },
  active: true,
};

const FeatureBadge = ({ yes, label }) => (
  <span className={`flex items-center gap-1 text-xs ${yes ? 'text-green-400' : 'text-gray-600'}`}>
    {yes ? <Check size={12} /> : <X size={12} />} {label}
  </span>
);

export default function Plans() {
  const [plans, setPlans]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(null);
  const [form, setForm]     = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const load = () => {
    setLoading(true);
    api.get('/admin/plans').then(r => setPlans(r.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(emptyForm); setError(''); setModal('create'); };
  const openEdit = (p) => {
    setForm({ name: p.name, description: p.description || '', price: p.price, duration_days: p.duration_days, color: p.color, features: { ...p.features }, active: p.active });
    setError('');
    setModal(p);
  };

  const setFeat = (key, val) => setForm(f => ({ ...f, features: { ...f.features, [key]: val } }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = { ...form, price: Number(form.price), duration_days: Number(form.duration_days) };
      if (modal === 'create') await api.post('/admin/plans', payload);
      else await api.put(`/admin/plans/${modal.id}`, payload);
      setModal(null);
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este plan?')) return;
    await api.delete(`/admin/plans/${id}`);
    load();
  };

  const handleToggle = async (p) => {
    await api.put(`/admin/plans/${p.id}`, { active: !p.active });
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-white">Planes de Suscripción</h1>
          <p className="text-gray-400 mt-1">Crea y gestiona los planes de acceso</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={18} /> Nuevo Plan
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {plans.map(p => (
            <div key={p.id} className={`glass-card p-5 flex flex-col gap-4 ${!p.active ? 'opacity-50' : ''}`}>
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 rounded-full" style={{ background: p.color }} />
                    <span className="text-white font-bold">{p.name}</span>
                  </div>
                  <p className="text-gray-500 text-xs line-clamp-2">{p.description}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Price */}
              <div>
                {p.price === 0 ? (
                  <span className="text-2xl font-black text-white">Gratis</span>
                ) : (
                  <div>
                    <span className="text-2xl font-black text-white">${p.price}</span>
                    <span className="text-gray-500 text-sm"> / {p.duration_days === 0 ? 'forever' : `${p.duration_days}d`}</span>
                  </div>
                )}
              </div>

              {/* Features */}
              <div className="space-y-1.5 flex-1">
                <FeatureBadge yes={p.features?.iptv} label="TV en Vivo (IPTV)" />
                <FeatureBadge yes={p.features?.hd} label="Calidad HD" />
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Monitor size={12} /> {p.features?.max_devices || 1} dispositivo{p.features?.max_devices !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Bookmark size={12} /> {p.features?.watchlist_limit === 0 ? 'Lista ilimitada' : `${p.features?.watchlist_limit} en lista`}
                </span>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-800">
                <span className={`badge text-xs ${p.active ? 'bg-green-500/20 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
                  {p.active ? 'Activo' : 'Inactivo'}
                </span>
                <button onClick={() => handleToggle(p)} className="text-xs text-gray-500 hover:text-white transition-colors">
                  {p.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="glass-card w-full max-w-lg p-6 my-4">
            <h2 className="text-xl font-bold text-white mb-5">
              {modal === 'create' ? 'Crear Plan' : `Editar: ${modal.name}`}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Nombre del plan</label>
                  <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Premium" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Precio (USD)</label>
                  <input type="number" min="0" step="0.01" className="input-field" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="9.99" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Descripción</label>
                <input className="input-field" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descripción corta del plan" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Duración (días)</label>
                  <input type="number" min="0" className="input-field" value={form.duration_days} onChange={e => setForm({ ...form, duration_days: e.target.value })} placeholder="30" />
                  <p className="text-gray-600 text-xs mt-1">0 = sin vencimiento</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Dispositivos máx.</label>
                  <input type="number" min="1" className="input-field" value={form.features.max_devices} onChange={e => setFeat('max_devices', Number(e.target.value))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Color del plan</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PLAN_COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ background: c }} />
                  ))}
                  <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="w-8 h-7 rounded cursor-pointer border border-gray-700 bg-transparent" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Características</label>
                <div className="space-y-2">
                  {[
                    { key: 'iptv', label: 'TV en Vivo (IPTV)' },
                    { key: 'hd', label: 'Calidad HD' },
                  ].map(f => (
                    <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.features[f.key]} onChange={e => setFeat(f.key, e.target.checked)} className="w-4 h-4 accent-violet-600" />
                      <span className="text-sm text-gray-300">{f.label}</span>
                    </label>
                  ))}
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-300 w-40">Límite de lista</label>
                    <input type="number" min="0" className="input-field w-28 py-1.5 text-sm" value={form.features.watchlist_limit} onChange={e => setFeat('watchlist_limit', Number(e.target.value))} />
                    <span className="text-gray-600 text-xs">0 = ilimitada</span>
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="w-4 h-4 accent-violet-600" />
                <span className="text-sm text-gray-300">Plan activo (visible para asignar)</span>
              </label>

              {error && <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-lg p-3 text-sm">{error}</div>}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary py-2">
                  {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {modal === 'create' ? 'Crear Plan' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
