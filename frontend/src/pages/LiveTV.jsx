import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Tv, RefreshCw, ChevronRight, PanelRightClose, PanelRightOpen, WifiOff, Settings, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import IPTVPlayer from '../components/IPTVPlayer';
import ChannelLogo from '../components/ChannelLogo';
import api from '../lib/api';

export default function LiveTV() {
  const [providers, setProviders]           = useState([]);
  const [activeProvider, setActiveProvider] = useState(null);
  const [categories, setCategories]         = useState([]);
  const [channels, setChannels]             = useState([]);
  const [filtered, setFiltered]             = useState([]);
  const [selectedCat, setSelectedCat]       = useState('all');
  const [search, setSearch]                 = useState('');
  const [currentChannel, setCurrentChannel] = useState(null);
  const [streamInfo, setStreamInfo]         = useState(null);
  const [loadingList, setLoadingList]       = useState(true);
  const [loadingStream, setLoadingStream]   = useState(false);
  const [error, setError]                   = useState('');
  const [sidebarOpen, setSidebarOpen]       = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [providerOpen, setProviderOpen]     = useState(false);
  const searchRef = useRef(null);
  const providerRef = useRef(null);

  // Close provider dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (providerRef.current && !providerRef.current.contains(e.target)) setProviderOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load provider list then auto-select first
  const loadProviders = useCallback(async () => {
    try {
      const r = await api.get('/iptv/providers');
      setProviders(Array.isArray(r.data) ? r.data : []);
      if (r.data?.length > 0 && !activeProvider) {
        setActiveProvider(r.data[0]);
      }
    } catch {}
  }, [activeProvider]);

  useEffect(() => { loadProviders(); }, []);

  // Load channels/categories for active provider
  const loadData = useCallback(async (forceRefresh = false) => {
    if (!activeProvider && providers.length === 0) return;
    setLoadingList(true);
    setError('');
    try {
      if (forceRefresh) await api.post('/iptv/refresh');
      const pid = activeProvider?.id ? `?p=${activeProvider.id}` : '';
      const [cats, chs] = await Promise.all([
        api.get(`/iptv/categories${pid}`),
        api.get(`/iptv/channels${pid}`),
      ]);
      setCategories(Array.isArray(cats.data) ? cats.data : []);
      setChannels(Array.isArray(chs.data) ? chs.data : []);
      setSelectedCat('all');
    } catch (e) {
      setError(e.response?.data?.error || 'Error cargando canales. Configura las credenciales IPTV en el panel Admin.');
    } finally {
      setLoadingList(false);
    }
  }, [activeProvider, providers.length]);

  useEffect(() => {
    if (activeProvider !== null || providers.length === 0) loadData();
  }, [activeProvider]);

  // Filter channels
  useEffect(() => {
    let list = channels;
    if (selectedCat !== 'all') list = list.filter(c => String(c.category_id) === String(selectedCat));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name?.toLowerCase().includes(q));
    }
    setFiltered(list);
  }, [channels, selectedCat, search]);

  // Select channel
  const selectChannel = useCallback(async (ch) => {
    if (currentChannel?.stream_id === ch.stream_id) return;
    setCurrentChannel(ch);
    setStreamInfo(null);
    setLoadingStream(true);
    try {
      const pid = activeProvider?.id ? `?p=${activeProvider.id}` : '';
      const res = await api.get(`/iptv/stream/${ch.stream_id}${pid}`);
      setStreamInfo(res.data);
    } catch (e) {
      console.error('Stream info error:', e);
    } finally {
      setLoadingStream(false);
    }
  }, [currentChannel, activeProvider]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  };

  const switchProvider = (p) => {
    setActiveProvider(p);
    setProviderOpen(false);
    setCurrentChannel(null);
    setStreamInfo(null);
    setSearch('');
    setSelectedCat('all');
  };

  // Error: no IPTV configured
  if (!loadingList && error && channels.length === 0) return (
    <div className="pt-16 flex items-center justify-center min-h-screen px-4">
      <div className="glass-card p-8 max-w-lg text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-900/30 flex items-center justify-center mx-auto mb-4 border border-red-800/40">
          <WifiOff size={32} className="text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Sin conexión IPTV</h2>
        <p className="text-gray-400 text-sm mb-6">{error}</p>
        <Link to="/admin/providers" className="btn-primary justify-center mb-3">
          <Settings size={16} /> Configurar proveedores
        </Link>
        <button onClick={() => loadData()} className="btn-secondary justify-center w-full">
          <RefreshCw size={16} /> Reintentar
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col bg-gray-950" style={{ height: '100dvh', paddingTop: '64px' }}>

      {/* Top bar */}
      <div className="bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 px-4 py-2 flex items-center gap-3 flex-shrink-0">
        <Tv size={17} className="text-accent flex-shrink-0" />
        <span className="text-white font-bold text-sm hidden sm:block">TV en Vivo</span>

        {currentChannel && (
          <>
            <ChevronRight size={13} className="text-gray-700 hidden sm:block" />
            <span className="text-gray-300 text-sm truncate max-w-44">{currentChannel.name}</span>
            {streamInfo && (
              <span className="flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />EN VIVO
              </span>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Provider selector */}
          {providers.length > 1 && (
            <div className="relative" ref={providerRef}>
              <button
                onClick={() => setProviderOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors border border-gray-700"
              >
                <Tv size={12} />
                <span className="hidden md:inline max-w-24 truncate">{activeProvider?.name || 'Proveedor'}</span>
                <ChevronDown size={11} />
              </button>
              {providerOpen && (
                <div className="absolute right-0 top-full mt-1.5 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 min-w-48 overflow-hidden">
                  {providers.map(p => (
                    <button
                      key={p.id}
                      onClick={() => switchProvider(p)}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${activeProvider?.id === p.id ? 'bg-accent/20 text-accent-light' : 'text-gray-300 hover:bg-gray-800'}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${activeProvider?.id === p.id ? 'bg-accent' : 'bg-gray-600'}`} />
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <span className="text-gray-600 text-xs hidden md:block">{channels.length} canales</span>

          <button onClick={handleRefresh} disabled={refreshing} className="text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors" title="Actualizar">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setSidebarOpen(o => !o)}
            className={`p-1.5 rounded-lg transition-colors ${sidebarOpen ? 'text-accent bg-accent/10' : 'text-gray-500 hover:text-white hover:bg-gray-800'}`}
            title="Mostrar/ocultar canales"
          >
            {sidebarOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">

        {/* Player column */}
        <div className="flex-1 flex flex-col overflow-hidden bg-black">
          {loadingStream ? (
            <div className="w-full bg-gray-950 flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-accent/30 rounded-full mx-auto mb-3 relative">
                  <div className="absolute inset-0 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-gray-400 text-sm">Cargando {currentChannel?.name}…</p>
              </div>
            </div>
          ) : (
            <IPTVPlayer channel={currentChannel} streamInfo={streamInfo} />
          )}

          {/* Channel info bar */}
          {currentChannel && (
            <div className="bg-gray-900 border-t border-gray-800 px-4 py-3 flex items-center gap-3 flex-shrink-0">
              <ChannelLogo src={currentChannel.stream_icon} name={currentChannel.name} size="lg" />
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm truncate">{currentChannel.name}</p>
                <p className="text-gray-500 text-xs">{currentChannel.category_name || 'Sin categoría'}</p>
              </div>
              {activeProvider && providers.length > 1 && (
                <span className="hidden sm:flex items-center gap-1.5 bg-gray-800 text-gray-400 text-xs px-2 py-1 rounded-lg">
                  <Tv size={10} />{activeProvider.name}
                </span>
              )}
              <span className="hidden sm:block text-gray-700 text-xs">ID: {currentChannel.stream_id}</span>
            </div>
          )}
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-72 xl:w-80 bg-gray-900 border-l border-gray-800 flex flex-col flex-shrink-0 overflow-hidden">

            {/* Search */}
            <div className="p-3 border-b border-gray-800 flex-shrink-0">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Buscar canal…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700/60 text-white placeholder-gray-600 text-sm rounded-xl pl-9 pr-8 py-2 focus:outline-none focus:border-accent transition-colors"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-0.5 rounded">
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Categories */}
            <div className="flex gap-1.5 px-3 py-2 border-b border-gray-800 overflow-x-auto scrollbar-hide flex-shrink-0">
              <button
                onClick={() => setSelectedCat('all')}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${selectedCat === 'all' ? 'bg-accent text-white shadow-sm shadow-accent/40' : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-white'}`}
              >
                Todos
              </button>
              {categories.map(cat => (
                <button
                  key={cat.category_id}
                  onClick={() => setSelectedCat(cat.category_id)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${String(selectedCat) === String(cat.category_id) ? 'bg-accent text-white shadow-sm shadow-accent/40' : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-white'}`}
                >
                  {cat.category_name}
                </button>
              ))}
            </div>

            {/* Channel list */}
            <div className="flex-1 overflow-y-auto">
              {loadingList ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-600 text-xs">Cargando canales…</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <p className="text-gray-600 text-sm">{search ? `Sin resultados para "${search}"` : 'Sin canales en esta categoría'}</p>
                </div>
              ) : (
                filtered.map(ch => {
                  const isActive = currentChannel?.stream_id === ch.stream_id;
                  return (
                    <button
                      key={ch.stream_id}
                      onClick={() => selectChannel(ch)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 border-b border-gray-800/30 transition-all ${
                        isActive
                          ? 'bg-accent/10 border-l-2 border-l-accent'
                          : 'hover:bg-gray-800/50 border-l-2 border-l-transparent'
                      }`}
                    >
                      <ChannelLogo src={ch.stream_icon} name={ch.name} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold line-clamp-1 ${isActive ? 'text-accent-light' : 'text-white'}`}>
                          {ch.name}
                        </p>
                        {ch.category_name && (
                          <p className="text-gray-600 text-xs truncate mt-0.5">{ch.category_name}</p>
                        )}
                      </div>
                      {isActive && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t border-gray-800 flex items-center justify-between flex-shrink-0">
              <span className="text-gray-600 text-xs">{filtered.length} {filtered.length === 1 ? 'canal' : 'canales'}</span>
              {(selectedCat !== 'all' || search) && (
                <button onClick={() => { setSelectedCat('all'); setSearch(''); }} className="text-accent-light text-xs hover:underline">
                  Limpiar filtros
                </button>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
