import React, { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import { Tv, Search, X, Wifi, WifiOff, ChevronRight, List, Maximize2 } from 'lucide-react';
import api from '../lib/api';

export default function LiveTV() {
  const [categories, setCategories] = useState([]);
  const [channels, setChannels] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [selectedCat, setSelectedCat] = useState('all');
  const [search, setSearch] = useState('');
  const [currentChannel, setCurrentChannel] = useState(null);
  const [streamUrl, setStreamUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [streamLoading, setStreamLoading] = useState(false);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLive, setIsLive] = useState(false);

  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  // Load categories and all channels
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [cats, chs] = await Promise.all([
          api.get('/iptv/live/categories'),
          api.get('/iptv/live/channels'),
        ]);
        setCategories(cats.data || []);
        setChannels(chs.data || []);
        setFiltered(chs.data || []);
      } catch (e) {
        setError(e.response?.data?.error || 'Error cargando canales. Verifica las credenciales IPTV en el panel admin.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Filter channels
  useEffect(() => {
    let list = channels;
    if (selectedCat !== 'all') list = list.filter(c => c.category_id === selectedCat);
    if (search) list = list.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()));
    setFiltered(list);
  }, [channels, selectedCat, search]);

  // HLS player
  const playChannel = useCallback(async (channel) => {
    setCurrentChannel(channel);
    setStreamLoading(true);
    setIsLive(false);
    try {
      const res = await api.get(`/iptv/live/stream/${channel.stream_id}`);
      const { url, hls } = res.data;

      // Destroy previous HLS instance
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

      const video = videoRef.current;
      if (!video) return;

      const tryPlay = (src) => {
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          hlsRef.current = hls;
          hls.loadSource(src);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {});
            setIsLive(true);
            setStreamLoading(false);
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              // Try TS stream as fallback
              if (src !== url) {
                hls.destroy();
                video.src = url;
                video.play().catch(() => {});
                setIsLive(true);
                setStreamLoading(false);
              }
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS
          video.src = src;
          video.play().catch(() => {});
          setIsLive(true);
          setStreamLoading(false);
        } else {
          // Fallback TS
          video.src = url;
          video.play().catch(() => {});
          setIsLive(true);
          setStreamLoading(false);
        }
      };

      tryPlay(hls);
      setStreamUrl(hls);
    } catch (e) {
      setStreamLoading(false);
      console.error('Stream error:', e);
    }
  }, []);

  const goFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) videoRef.current.requestFullscreen();
      else if (videoRef.current.webkitRequestFullscreen) videoRef.current.webkitRequestFullscreen();
    }
  };

  if (loading) return (
    <div className="pt-20 flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Cargando canales...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="pt-20 flex items-center justify-center min-h-screen px-4">
      <div className="glass-card p-8 max-w-lg text-center">
        <WifiOff size={48} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Error de conexión IPTV</h2>
        <p className="text-gray-400 text-sm">{error}</p>
        <p className="text-gray-500 text-xs mt-4">Panel Admin → Configuración → Sección IPTV</p>
      </div>
    </div>
  );

  return (
    <div className="pt-16 h-screen flex flex-col bg-gray-950">
      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center gap-3 flex-shrink-0">
        <Tv size={20} className="text-red-400" />
        <span className="text-white font-bold">TV en Vivo</span>
        {isLive && (
          <span className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
            <span className="w-1.5 h-1.5 bg-white rounded-full" />
            EN VIVO
          </span>
        )}
        {currentChannel && (
          <span className="text-gray-400 text-sm truncate hidden sm:block">— {currentChannel.name}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
            <List size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Player */}
        <div className="flex-1 bg-black flex flex-col">
          <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
            {!currentChannel && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Tv size={64} className="text-gray-700 mx-auto mb-4" />
                  <p className="text-gray-500 font-semibold">Selecciona un canal para ver</p>
                  <p className="text-gray-600 text-sm mt-1">{channels.length} canales disponibles</p>
                </div>
              </div>
            )}

            {streamLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                <div className="text-center">
                  <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-gray-300 text-sm">Conectando al canal...</p>
                </div>
              </div>
            )}

            <video
              ref={videoRef}
              className="w-full h-full"
              controls
              playsInline
              autoPlay
              style={{ display: currentChannel ? 'block' : 'none' }}
            />

            {currentChannel && (
              <button
                onClick={goFullscreen}
                className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg transition-colors z-20"
              >
                <Maximize2 size={16} />
              </button>
            )}
          </div>

          {/* Channel info */}
          {currentChannel && (
            <div className="p-4 bg-gray-900 border-t border-gray-800 flex items-center gap-3">
              {currentChannel.stream_icon && (
                <img src={currentChannel.stream_icon} alt={currentChannel.name} className="w-10 h-10 object-contain rounded bg-gray-800 p-1 flex-shrink-0" onError={e => e.target.style.display='none'} />
              )}
              <div>
                <p className="text-white font-bold">{currentChannel.name}</p>
                <p className="text-gray-400 text-xs">{currentChannel.category_name || 'Sin categoría'}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Wifi size={16} className="text-green-400" />
                <span className="text-green-400 text-xs font-semibold">LIVE</span>
              </div>
            </div>
          )}
        </div>

        {/* Channel Sidebar */}
        {sidebarOpen && (
          <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col flex-shrink-0">
            {/* Search */}
            <div className="p-3 border-b border-gray-800">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="Buscar canal..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm rounded-lg pl-8 pr-8 py-2 focus:outline-none focus:border-red-500"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Categories */}
            <div className="flex gap-2 px-3 py-2 border-b border-gray-800 overflow-x-auto scrollbar-hide flex-shrink-0">
              <button
                onClick={() => setSelectedCat('all')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${selectedCat === 'all' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >
                Todos ({channels.length})
              </button>
              {categories.slice(0, 20).map(cat => (
                <button
                  key={cat.category_id}
                  onClick={() => setSelectedCat(cat.category_id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${selectedCat === cat.category_id ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                  {cat.category_name}
                </button>
              ))}
            </div>

            {/* Channel list */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-sm">No se encontraron canales</div>
              ) : (
                filtered.map(ch => (
                  <button
                    key={ch.stream_id}
                    onClick={() => playChannel(ch)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2.5 border-b border-gray-800/50 transition-colors hover:bg-gray-800/50 ${currentChannel?.stream_id === ch.stream_id ? 'bg-red-900/20 border-l-2 border-l-red-500' : ''}`}
                  >
                    <div className="w-8 h-8 bg-gray-800 rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {ch.stream_icon
                        ? <img src={ch.stream_icon} alt={ch.name} className="w-full h-full object-contain p-0.5" onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
                        : null
                      }
                      <Tv size={14} className="text-gray-600" style={{ display: ch.stream_icon ? 'none' : 'block' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold line-clamp-1 ${currentChannel?.stream_id === ch.stream_id ? 'text-red-400' : 'text-white'}`}>
                        {ch.name}
                      </p>
                      {ch.category_name && <p className="text-gray-500 text-xs">{ch.category_name}</p>}
                    </div>
                    {currentChannel?.stream_id === ch.stream_id && (
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>

            <div className="px-3 py-2 border-t border-gray-800 text-gray-600 text-xs text-center">
              {filtered.length} canales {search || selectedCat !== 'all' ? 'filtrados' : 'totales'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
