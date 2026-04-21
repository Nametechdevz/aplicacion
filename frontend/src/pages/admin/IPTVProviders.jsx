import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Wifi, WifiOff, CheckCircle, XCircle, Eye, EyeOff, ToggleLeft, ToggleRight, Loader } from 'lucide-react';
import api from '../../lib/api';

const emptyForm = { name: '', url: '', username: '', password: '', active: true };

export default function IPTVProviders() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null); // null | 'create' | provider obj
  const [form, setForm]           = useState(emptyForm);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [testResults, setTestResults] = useState({}); // id → { loading, result }

  const load = () => {
    setLoading(true);
    api.get('/admin/providers')
      .then(r => setProviders(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setError('');
    setShowPass(false);
    setModal('create');
  };

  const openEdit = async (p) => {
    setError('');
    setShowPass(false);
    // Fetch full record (with real password) for editing
    try {
      const r = await api.get(`/admin/providers/${p.id}`);
      setForm({ name: r.data.name, url: r.data.url, username: r.data.username, password: r.data.password || '', active: r.data.active });
      setModal(p);
    } catch {
      setForm({ name: p.name, url: p.url, username: p.username, password: '', active: p.active });
      setModal(p);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (modal === 'create') {
        await api.post('/admin/providers', form);
      } else {
        await api.put(`/admin/providers/${modal.id}`, form);
      }
      setModal(null);
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este proveedor?')) return;
    await api.delete(`/admin/providers/${id}`);
    load();
  };

  const handleToggle = async (p) => {
    await api.put(`/admin/providers/${p.id}`, { active: !p.active });
    load();
  };

  const handleTest = async (p) => {
    setTestResults(t => ({ ...t, [p.id]: { loading: true, result: null } }));
    try {
      const full = await api.get(`/admin/providers/${p.id}`);
      const r = await api.post('/admin/providers/test', { url: full.data.url, username: full.data.username, password: full.data.password });
      setTestResults(t => ({ ...t, [p.id]: { loading: false, result: { ok: true, msg: r.data.msg } } }));
    } catch (e) {
      setTestResults(t => ({ ...t, [p.id]: { loading: false, result: { ok: false, msg: e.response?.data?.error || 'Error de conexión' } } }));
    }
  };

  const handleTestForm = async () => {
    setSaving(true);
    setError('');
    try {
      const r = await api.post('/admin/providers/test', { url: form.url, username: form.username, password: form.password });
      setError(`✓ ${r.data.msg}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-white">Proveedores IPTV</h1>
          <p className="text-gray-400 mt-1">Gestiona múltiples conexiones Xtream Codes</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={18} /> Agregar Proveedor
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : providers.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <Wifi size={52} className="text-gray-600 mx-auto mb-4" />
          <p className="text-white font-bold text-lg mb-2">Sin proveedores configurados</p>
          <p className="text-gray-500 text-sm mb-6">Agrega tu primera conexión Xtream Codes para activar TV en Vivo</p>
          <button onClick={openCreate} className="btn-primary justify-center">
            <Plus size={16} /> Agregar Proveedor
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map(p => {
            const tr = testResults[p.id];
            return (
              <div key={p.id} className="glass-card p-5">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${p.active ? 'bg-green-600/20' : 'bg-gray-700/50'}`}>
                    {p.active ? <Wifi size={20} className="text-green-400" /> : <WifiOff size={20} className="text-gray-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-white font-bold">{p.name}</h3>
                      <span className={`badge text-xs ${p.active ? 'bg-green-500/20 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
                        {p.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <p className="text-gray-400 text-sm mt-0.5 truncate">{p.url}</p>
                    <p className="text-gray-600 text-xs mt-0.5">Usuario: {p.username || '—'}</p>

                    {tr?.result && (
                      <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-2 ${tr.result.ok ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                        {tr.result.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
                        {tr.result.msg}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleTest(p)}
                      disabled={tr?.loading}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors text-xs flex items-center gap-1.5"
                      title="Probar conexión"
                    >
                      {tr?.loading ? <Loader size={14} className="animate-spin" /> : <Wifi size={14} />}
                      <span className="hidden sm:inline">Probar</span>
                    </button>
                    <button
                      onClick={() => handleToggle(p)}
                      className={`p-2 rounded-lg transition-colors ${p.active ? 'text-green-400 hover:bg-green-900/30' : 'text-gray-500 hover:bg-gray-800'}`}
                      title={p.active ? 'Desactivar' : 'Activar'}
                    >
                      {p.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                    <button onClick={() => openEdit(p)} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                      <Edit2 size={15} />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-card w-full max-w-lg p-6">
            <h2 className="text-xl font-bold text-white mb-5">
              {modal === 'create' ? 'Agregar Proveedor IPTV' : `Editar: ${modal.name}`}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Nombre</label>
                <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Mi Proveedor IPTV" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">URL del servidor</label>
                <input className="input-field" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="http://servidor.com:8080" required />
                <p className="text-gray-600 text-xs mt-1">Incluye http:// y el puerto</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Usuario</label>
                  <input className="input-field" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="usuario" autoComplete="off" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Contraseña</label>
                  <div className="relative">
                    <input type={showPass ? 'text' : 'password'} className="input-field pr-10" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" autoComplete="off" />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="w-4 h-4 accent-violet-600" />
                  <span className="text-sm text-gray-300">Proveedor activo</span>
                </label>
              </div>

              {error && (
                <div className={`p-3 rounded-lg text-sm ${error.startsWith('✓') ? 'bg-green-900/30 text-green-300 border border-green-800' : 'bg-red-900/30 text-red-300 border border-red-800'}`}>
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={handleTestForm} disabled={saving} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors flex items-center gap-2">
                  <Wifi size={14} /> Probar conexión
                </button>
                <div className="flex-1" />
                <button type="button" onClick={() => setModal(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn-primary py-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                  {modal === 'create' ? 'Agregar' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
