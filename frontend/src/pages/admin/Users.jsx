import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, Pencil, Trash2, Search, X, CheckCircle, XCircle } from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

const emptyForm = { name: '', email: '', password: '', role: 'user', active: true };

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null); // null | 'create' | 'edit' | 'delete'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/users', { params: { page, limit: 15, search } });
      setUsers(res.data.users);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openCreate = () => { setForm(emptyForm); setFormError(''); setModal('create'); };
  const openEdit = (u) => { setSelected(u); setForm({ name: u.name, email: u.email, password: '', role: u.role, active: Boolean(u.active) }); setFormError(''); setModal('edit'); };
  const openDelete = (u) => { setSelected(u); setModal('delete'); };
  const closeModal = () => { setModal(null); setSelected(null); setFormError(''); };

  const handleSave = async () => {
    setFormError('');
    if (!form.name || !form.email) return setFormError('Nombre y email son requeridos');
    if (modal === 'create' && !form.password) return setFormError('La contraseña es requerida');
    setSaving(true);
    try {
      if (modal === 'create') {
        await api.post('/admin/users', form);
        showToast('Usuario creado exitosamente');
      } else {
        await api.put(`/admin/users/${selected.id}`, form);
        showToast('Usuario actualizado');
      }
      closeModal();
      fetchUsers();
    } catch (e) {
      setFormError(e.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await api.delete(`/admin/users/${selected.id}`);
      showToast('Usuario eliminado');
      closeModal();
      fetchUsers();
    } catch (e) {
      setFormError(e.response?.data?.error || 'Error al eliminar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-green-700 text-white px-5 py-3 rounded-xl shadow-xl z-50 font-semibold animate-fade-in">
          ✓ {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-white">Usuarios</h1>
          <p className="text-gray-400 mt-1">{total} usuarios registrados</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <UserPlus size={18} />Nuevo Usuario
        </button>
      </div>

      {/* Search */}
      <div className="glass-card p-4 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input-field pl-9"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800/50">
              <tr>
                {['Usuario', 'Email', 'Rol', 'Estado', 'Registrado', 'Acciones'].map(h => (
                  <th key={h} className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 py-3 first:pl-6 last:pr-6">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12">
                  <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
                </td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-500">No se encontraron usuarios</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="hover:bg-gray-800/20 transition-colors">
                  <td className="px-4 py-3 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-xs">{u.name?.[0]?.toUpperCase()}</span>
                      </div>
                      <span className="text-white text-sm font-medium">{u.name}</span>
                      {u.id === currentUser?.id && <span className="badge bg-green-900/40 text-green-400 text-xs">Tú</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-sm">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${u.role === 'admin' ? 'bg-accent/20 text-accent-light' : 'bg-gray-700 text-gray-300'}`}>
                      {u.role === 'admin' ? 'Admin' : 'Usuario'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.active ? (
                      <span className="flex items-center gap-1 text-green-400 text-xs font-semibold"><CheckCircle size={13} />Activo</span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-400 text-xs font-semibold"><XCircle size={13} />Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(u.created_at).toLocaleDateString('es-ES')}</td>
                  <td className="px-4 py-3 pr-6">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(u)} className="p-1.5 text-gray-400 hover:text-accent hover:bg-accent/10 rounded-lg transition-colors">
                        <Pencil size={15} />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => openDelete(u)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between">
            <span className="text-gray-400 text-sm">Página {page} de {pages}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 transition-colors">
                ← Anterior
              </button>
              <button disabled={page === pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 transition-colors">
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Create/Edit */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">{modal === 'create' ? 'Crear Usuario' : 'Editar Usuario'}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"><X size={20} /></button>
            </div>

            {formError && <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-lg p-3 mb-4 text-sm">{formError}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Nombre</label>
                <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre completo" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
                <input className="input-field" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@ejemplo.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Contraseña {modal === 'edit' && <span className="text-gray-500">(dejar vacío para mantener)</span>}
                </label>
                <input className="input-field" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Rol</label>
                  <select className="input-field" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                    <option value="user">Usuario</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Estado</label>
                  <select className="input-field" value={form.active ? '1' : '0'} onChange={e => setForm({ ...form, active: e.target.value === '1' })}>
                    <option value="1">Activo</option>
                    <option value="0">Inactivo</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={closeModal} className="flex-1 btn-secondary justify-center">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary justify-center">
                {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : modal === 'create' ? 'Crear' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Delete */}
      {modal === 'delete' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-sm p-6 shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={28} className="text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Eliminar Usuario</h2>
            <p className="text-gray-400 mb-6">¿Estás seguro de eliminar a <strong className="text-white">{selected?.name}</strong>? Esta acción no se puede deshacer.</p>
            {formError && <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-lg p-3 mb-4 text-sm">{formError}</div>}
            <div className="flex gap-3">
              <button onClick={closeModal} className="flex-1 btn-secondary justify-center">Cancelar</button>
              <button onClick={handleDelete} disabled={saving} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
