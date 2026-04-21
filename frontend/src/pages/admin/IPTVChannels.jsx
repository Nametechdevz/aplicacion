import React, { useState, useEffect, useMemo } from 'react';
import { Tv, Film, Clapperboard, Eye, EyeOff, Search, X, Save, RefreshCw, AlertCircle, ChevronDown } from 'lucide-react';
import api from '../../lib/api';

const KINDS = [
  { key: 'live',   label: 'TV en Vivo',  icon: Tv,          catField: 'hidden_live_categories',   itemField: 'hidden_live_channels',    hasItems: true  },
  { key: 'vod',    label: 'Películas',   icon: Film,        catField: 'hidden_vod_categories',    itemField: null,                       hasItems: false },
  { key: 'series', label: 'Series',      icon: Clapperboard, catField: 'hidden_series_categories', itemField: null,                       hasItems: false },
];

export default function IPTVChannels() {
  const [providers, setProviders]   = useState([]);
  const [activeId, setActiveId]     = useState('');
  const [kind, setKind]             = useState('live');
  const [catalog, setCatalog]       = useState(null); // { categories, items, hidden_* }
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [saved, setSaved]           = useState(false);
  const [search, setSearch]         = useState('');
  const [selectedCat, setSelectedCat] = useState('all');

  // Load providers
  useEffect(() => {
    api.get('/admin/providers').then(r => {
      setProviders(r.data || []);
      if (r.data?.length) setActiveId(r.data[0].id);
    }).catch(() => {});
  }, []);

  // Load catalog when provider or kind changes
  const loadCatalog = () => {
    if (!activeId) return;
    setLoading(true); setError(''); setSearch(''); setSelectedCat('all');
    api.get(`/admin/providers/${activeId}/catalog?kind=${kind}`)
      .then(r => setCatalog(r.data))
      .catch(e => setError(e.response?.data?.error || 'Error cargando el catálogo'))
      .finally(() => setLoading(false));
  };

  useEffect(loadCatalog, [activeId, kind]);

  const currentKind = KINDS.find(k => k.key === kind);
  const categories  = catalog?.categories || [];
  const items       = catalog?.items || [];

  const hiddenCats  = useMemo(() => new Set((catalog?.[currentKind.catField] || []).map(String)), [catalog, currentKind]);
  const hiddenItems = useMemo(() => new Set((catalog?.[currentKind.itemField] || []).map(String)), [catalog, currentKind]);

  const filteredItems = useMemo(() => {
    if (!currentKind.hasItems) return [];
    let list = items;
    if (selectedCat !== 'all') list = list.filter(c => String(c.category_id) === String(selectedCat));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => (c.name || '').toLowerCase().includes(q));
    }
    return list;
  }, [items, selectedCat, search, currentKind]);

  const toggleCat = (id) => {
    setCatalog(c => {
      const field = currentKind.catField;
      const set = new Set((c[field] || []).map(String));
      const v = String(id);
      if (set.has(v)) set.delete(v); else set.add(v);
      return { ...c, [field]: Array.from(set) };
    });
  };

  const toggleItem = (id) => {
    if (!currentKind.itemField) return;
    setCatalog(c => {
      const field = currentKind.itemField;
      const set = new Set((c[field] || []).map(String));
      const v = String(id);
      if (set.has(v)) set.delete(v); else set.add(v);
      return { ...c, [field]: Array.from(set) };
    });
  };

  const bulkSetCat = (hide) => {
    setCatalog(c => ({
      ...c,
      [currentKind.catField]: hide ? categories.map(x => String(x.category_id)) : [],
    }));
  };

  const bulkSetCurrentCatItems = (hide) => {
    if (!currentKind.itemField) return;
    setCatalog(c => {
      const field = currentKind.itemField;
      const set = new Set((c[field] || []).map(String));
      for (const it of filteredItems) {
        if (hide) set.add(String(it.stream_id));
        else      set.delete(String(it.stream_id));
      }
      return { ...c, [field]: Array.from(set) };
    });
  };

  const saveChanges = async () => {
    if (!catalog) return;
    setSaving(true); setSaved(false); setError('');
    try {
      await api.put(`/admin/providers/${activeId}/visibility`, {
        hidden_live_categories:   catalog.hidden_live_categories || [],
        hidden_live_channels:     catalog.hidden_live_channels || [],
        hidden_vod_categories:    catalog.hidden_vod_categories || [],
        hidden_series_categories: catalog.hidden_series_categories || [],
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const stats = {
    totalCats: categories.length,
    hiddenCats: hiddenCats.size,
    totalItems: items.length,
    hiddenItems: hiddenItems.size,
  };

  if (providers.length === 0) {
    return (
      <div className="glass-card p-16 text-center">
        <Tv size={52} className="text-gray-600 mx-auto mb-4" />
        <p className="text-white font-bold text-lg mb-2">Sin proveedores</p>
        <p className="text-gray-500 text-sm">Agrega un proveedor IPTV primero en la sección Proveedores.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white">Visibilidad IPTV</h1>
        <p className="text-gray-400 mt-1">Oculta categorías o canales que no quieras mostrar a los usuarios.</p>
      </div>

      {/* Controls bar */}
      <div className="glass-card p-4 mb-6 flex flex-wrap items-center gap-3">
        {/* Provider */}
        <div className="relative">
          <select
            className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg pl-3 pr-9 py-2 focus:outline-none focus:border-accent appearance-none cursor-pointer"
            value={activeId}
            onChange={e => setActiveId(Number(e.target.value))}
          >
            {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        </div>

        {/* Kind tabs */}
        <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
          {KINDS.map(k => {
            const Icon = k.icon;
            const active = kind === k.key;
            return (
              <button key={k.key} onClick={() => setKind(k.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${active ? 'bg-accent text-white shadow shadow-accent/30' : 'text-gray-400 hover:text-white'}`}>
                <Icon size={13} /> {k.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        <button onClick={loadCatalog} disabled={loading} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors" title="Recargar catálogo">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>

        <button onClick={saveChanges} disabled={saving || loading || !catalog} className="btn-primary py-2">
          {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={14} />}
          Guardar cambios
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-lg p-3 text-sm mb-4 flex items-center gap-2">
          <AlertCircle size={16} />{error}
        </div>
      )}
      {saved && (
        <div className="bg-green-900/30 border border-green-800 text-green-300 rounded-lg p-3 text-sm mb-4">
          ✓ Cambios guardados — los usuarios ya no verán los elementos ocultos.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : !catalog ? null : (
        <>
          {/* Stats summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="glass-card p-4">
              <p className="text-gray-500 text-xs font-medium">Categorías</p>
              <p className="text-white text-2xl font-black mt-1">{stats.totalCats}</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-gray-500 text-xs font-medium">Ocultas</p>
              <p className="text-red-400 text-2xl font-black mt-1">{stats.hiddenCats}</p>
            </div>
            {currentKind.hasItems && (
              <>
                <div className="glass-card p-4">
                  <p className="text-gray-500 text-xs font-medium">Canales</p>
                  <p className="text-white text-2xl font-black mt-1">{stats.totalItems}</p>
                </div>
                <div className="glass-card p-4">
                  <p className="text-gray-500 text-xs font-medium">Canales ocultos</p>
                  <p className="text-red-400 text-2xl font-black mt-1">{stats.hiddenItems}</p>
                </div>
              </>
            )}
          </div>

          {/* Categories card */}
          <div className="glass-card overflow-hidden mb-6">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
              <h2 className="text-white font-bold">Categorías</h2>
              <div className="flex gap-2">
                <button onClick={() => bulkSetCat(false)} className="text-xs text-green-400 hover:underline">Mostrar todas</button>
                <span className="text-gray-700">·</span>
                <button onClick={() => bulkSetCat(true)} className="text-xs text-red-400 hover:underline">Ocultar todas</button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-800/60">
              {categories.length === 0 ? (
                <p className="text-gray-500 text-sm py-8 text-center">No hay categorías en este proveedor.</p>
              ) : categories.map(cat => {
                const isHidden = hiddenCats.has(String(cat.category_id));
                return (
                  <label key={cat.category_id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-800/30 cursor-pointer transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleCat(cat.category_id)}
                      className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-all flex-shrink-0 ${isHidden ? 'bg-gray-700 justify-start' : 'bg-green-600 justify-end'}`}
                    >
                      <span className="w-5 h-5 bg-white rounded-full shadow" />
                    </button>
                    <span className={`flex-1 text-sm ${isHidden ? 'text-gray-500 line-through' : 'text-white'}`}>{cat.category_name}</span>
                    <span className={`badge text-xs ${isHidden ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>
                      {isHidden ? <><EyeOff size={10} /> Oculta</> : <><Eye size={10} /> Visible</>}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Individual items (live channels only) */}
          {currentKind.hasItems && (
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800 flex flex-wrap items-center gap-3">
                <h2 className="text-white font-bold">Canales individuales</h2>
                <div className="flex-1 min-w-64 relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar canal..."
                    className="w-full bg-gray-900 border border-gray-800 text-white placeholder-gray-600 text-sm rounded-lg pl-9 pr-8 py-2 focus:outline-none focus:border-accent"
                  />
                  {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"><X size={13} /></button>}
                </div>
                <select
                  className="bg-gray-900 border border-gray-800 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent"
                  value={selectedCat}
                  onChange={e => setSelectedCat(e.target.value)}
                >
                  <option value="all">Todas las categorías</option>
                  {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
                </select>
                <div className="flex gap-2 text-xs">
                  <button onClick={() => bulkSetCurrentCatItems(false)} className="text-green-400 hover:underline">Mostrar visibles</button>
                  <span className="text-gray-700">·</span>
                  <button onClick={() => bulkSetCurrentCatItems(true)} className="text-red-400 hover:underline">Ocultar visibles</button>
                </div>
              </div>

              <div className="max-h-[32rem] overflow-y-auto divide-y divide-gray-800/60">
                {filteredItems.length === 0 ? (
                  <p className="text-gray-500 text-sm py-12 text-center">
                    {search ? `Sin resultados para "${search}"` : 'Selecciona otra categoría o recarga el catálogo.'}
                  </p>
                ) : filteredItems.slice(0, 500).map(ch => {
                  const isHidden = hiddenItems.has(String(ch.stream_id));
                  return (
                    <label key={ch.stream_id} className="flex items-center gap-3 px-5 py-2 hover:bg-gray-800/30 cursor-pointer transition-colors">
                      <button
                        type="button"
                        onClick={() => toggleItem(ch.stream_id)}
                        className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-all flex-shrink-0 ${isHidden ? 'bg-gray-700 justify-start' : 'bg-green-600 justify-end'}`}
                      >
                        <span className="w-4 h-4 bg-white rounded-full shadow" />
                      </button>
                      {ch.stream_icon ? (
                        <img src={ch.stream_icon} alt="" className="w-7 h-7 object-contain rounded bg-gray-800 flex-shrink-0" onError={e => { e.target.style.display = 'none'; }} />
                      ) : (
                        <div className="w-7 h-7 bg-gray-800 rounded flex-shrink-0" />
                      )}
                      <span className={`flex-1 text-sm truncate ${isHidden ? 'text-gray-500 line-through' : 'text-white'}`}>{ch.name}</span>
                      <span className="text-gray-600 text-xs hidden md:inline">ID: {ch.stream_id}</span>
                    </label>
                  );
                })}
                {filteredItems.length > 500 && (
                  <p className="text-gray-500 text-xs text-center py-3">Mostrando primeros 500 de {filteredItems.length}. Filtra por categoría o nombre para ver el resto.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
