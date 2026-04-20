import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Tv, RefreshCw, ChevronRight, List, WifiOff, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import IPTVPlayer from '../components/IPTVPlayer';
import api from '../lib/api';

export default function LiveTV() {
  const [categories, setCategories]     = useState([]);
  const [channels, setChannels]         = useState([]);
  const [filtered, setFiltered]         = useState([]);
  const [selectedCat, setSelectedCat]   = useState('all');
  const [search, setSearch]             = useState('');
  const [currentChannel, setCurrentChannel] = useState(null);
  const [streamInfo, setStreamInfo]     = useState(null);
  const [loadingList, setLoadingList]   = useState(true);
  const [loadingStream, setLoadingStream] = useState(false);
  const [error, setError]               = useState('');
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const searchRef = useRef(null);

  // ── Load categories + all channels ──────────────────────────────────────────
  const loadData = useCallback(async (forceRefresh = false) => {
    setLoadingList(true);
    try {
      if (forceRefresh) await api.post('/iptv/refresh');
      const [cats, chs] = await Promise.all([
        api.get('/iptv/categories'),
        api.get('/iptv/channels'),
      ]);
      setCategories(Array.isArray(cats.data) ? cats.data : []);
      setChannels(Array.isArray(chs.data) ? chs.data : []);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'Error cargando canales. Configura las credenciales IPTV en el panel Admin.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filter channels ──────────────────────────────────────────────────────────
  useEffect(() => {
    let list = channels;
    if (selectedCat !== 'all') list = list.filter(c => String(c.category_id) === String(selectedCat));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name?.toLowerCase().includes(q));
    }
    setFiltered(list);
  }, [channels, selectedCat, search]);

  // ── Select channel ────────────────────────────────────────────────────────────
  const selectChannel = useCallback(async (ch) => {
    if (currentChannel?.stream_id === ch.stream_id) return;
    setCurrentChannel(ch);
    setStreamInfo(null);
    setLoadingStream(true);
    try {
      const res = await api.get(`/iptv/stream/${ch.stream_id}`);
      setStreamInfo(res.data);
    } catch (e) {
      console.error('Stream info error:', e);
    } finally {
      setLoadingStream(false);
    }
  }, [currentChannel]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  };

  // ── Error state ───────────────────────────────────────────────────────────────
  if (!loadingList && error) return (
    <div className="pt-16 flex items-center justify-center min-h-screen px-4">
      <div className="glass-card p-8 max-w-lg text-center">
        <WifiOff size={52} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Sin conexión IPTV</h2>
        <p className="text-gray-400 text-sm mb-6">{error}</p>
        <Link to="/admin/settings" className="btn-primary justify-center mb-3">
          <Settings size={16} /> Configurar credenciales
        </Link>
        <button onClick={() => loadData()} className="btn-secondary justify-center w-full">
          <RefreshCw size={16} /> Reintentar
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col bg-gray-950" style={{ height: '100dvh', paddingTop: '64px' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center gap-3 flex-shrink-0">
        <Tv size={18} className="text-red-400 flex-shrink-0" />
        <span className="text-white font-bold text-sm hidden sm:block">TV en Vivo</span>

        {currentChannel && (
          <>
            <ChevronRight size={14} className="text-gray-600 hidden sm:block" />
            <span className="text-gray-300 text-sm truncate max-w-48">{currentChannel.name}</span>
            {streamInfo && <span className="flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />EN VIVO
            </span>}
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-gray-600 text-xs hidden md:block">{channels.length} canales</span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            title="Actualizar lista"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className={`p-1.5 rounded-lg transition-colors ${sidebarOpen ? 'text-accent bg-accent/10' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            title="Ocultar/mostrar canales"
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Player side */}
        <div className="flex-1 flex flex-col overflow-hidden bg-black">
          {loadingStream ? (
            <div className="w-full bg-black flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Cargando {currentChannel?.name}...</p>
              </div>
            </div>
          ) : (
            <IPTVPlayer
              channel={currentChannel}
              streamInfo={streamInfo}
            />
          )}

          {/* Channel info bar */}
          {currentChannel && (
            <div className="bg-gray-900 border-t border-gray-800 px-4 py-3 flex items-center gap-3 flex-shrink-0">
              {currentChannel.stream_icon ? (
                <img
                  src={currentChannel.stream_icon}
                  alt={currentChannel.name}
                  className="w-10 h-10 object-contain rounded-lg bg-gray-800 p-1 flex-shrink-0"
                  onError={e => e.target.style.display = 'none'}
                />
              ) : (
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Tv size={18} className="text-gray-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm truncate">{currentChannel.name}</p>
                <p className="text-gray-500 text-xs">{currentChannel.category_name || 'Sin categoría'}</p>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-xs text-gray-500">
                <span>ID: {currentChannel.stream_id}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar ────────────────────────────────────────────────────────── */}
        {sidebarOpen && (
          <aside className="w-72 xl:w-80 bg-gray-900 border-l border-gray-800 flex flex-col flex-shrink-0 overflow-hidden">

            {/* Search */}
            <div className="p-3 border-b border-gray-800 flex-shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Buscar canal..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm rounded-lg pl-9 pr-8 py-2 focus:outline-none focus:border-accent"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Categories */}
            <div className="flex gap-1.5 px-3 py-2 border-b border-gray-800 overflow-x-auto scrollbar-hide flex-shrink-0">
              <button
                onClick={() => setSelectedCat('all')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${selectedCat === 'all' ? 'bg-accent text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}
              >
                Todos
              </button>
              {categories.map(cat => (
                <button
                  key={cat.category_id}
                  onClick={() => setSelectedCat(cat.category_id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${String(selectedCat) === String(cat.category_id) ? 'bg-accent text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}
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
                  <p className="text-gray-500 text-xs">Cargando canales...</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">
                  {search ? `Sin resultados para "${search}"` : 'Sin canales'}
                </div>
              ) : (
                filtered.map(ch => {
                  const isActive = currentChannel?.stream_id === ch.stream_id;
                  return (
                    <button
                      key={ch.stream_id}
                      onClick={() => selectChannel(ch)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 border-b border-gray-800/40 transition-all hover:bg-gray-800/60 ${isActive ? 'bg-accent/10 border-l-2 border-l-accent' : ''}`}
                    >
                      {/* Logo */}
                      <div className="w-9 h-9 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {ch.stream_icon ? (
                          <img
                            src={ch.stream_icon}
                            alt={ch.name}
                            className="w-full h-full object-contain p-0.5"
                            onError={e => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <Tv size={14} className="text-gray-600" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold line-clamp-1 ${isActive ? 'text-accent-light' : 'text-white'}`}>
                          {ch.name}
                        </p>
                        {ch.category_name && (
                          <p className="text-gray-600 text-xs truncate">{ch.category_name}</p>
                        )}
                      </div>

                      {isActive && (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer count */}
            <div className="px-3 py-2 border-t border-gray-800 flex-shrink-0 flex items-center justify-between">
              <span className="text-gray-600 text-xs">
                {filtered.length} {filtered.length === 1 ? 'canal' : 'canales'}
              </span>
              {selectedCat !== 'all' || search ? (
                <button
                  onClick={() => { setSelectedCat('all'); setSearch(''); }}
                  className="text-accent-light text-xs hover:underline"
                >
                  Limpiar filtros
                </button>
              ) : null}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
