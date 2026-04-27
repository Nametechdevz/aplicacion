import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Clapperboard, Search, X, Loader, WifiOff, Settings, Play, Star, Calendar, ChevronRight, Tv2 } from 'lucide-react';
import api from '../lib/api';

const POSTER_PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMzAwIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzFmMjkzNyIvPjxjaXJjbGUgY3g9IjEwMCIgY3k9IjEyMCIgcj0iMjAiIGZpbGw9IiM0YjU1NjMiLz48L3N2Zz4=';

const SeriesCard = ({ s, onClick }) => (
  <button onClick={() => onClick(s)} className="group text-left relative">
    <div className="aspect-[2/3] rounded-xl overflow-hidden bg-gray-800 shadow-lg group-hover:shadow-accent/30 group-hover:scale-[1.04] transition-all duration-300 relative">
      <img
        src={s.cover || POSTER_PLACEHOLDER}
        alt={s.name}
        loading="lazy"
        onError={e => { e.target.src = POSTER_PLACEHOLDER; }}
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
        <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center shadow-lg">
          <Play size={16} className="text-white ml-0.5" fill="white" />
        </div>
      </div>
      {s.rating && s.rating !== '0' && (
        <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-yellow-400 text-xs font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
          <Star size={10} fill="currentColor" />{Number(s.rating).toFixed(1)}
        </div>
      )}
    </div>
    <p className="text-white text-sm font-semibold mt-2 line-clamp-1">{s.name}</p>
    {s.year && <p className="text-gray-500 text-xs">{s.year}</p>}
  </button>
);

export default function IPTVSeries() {
  const [providers, setProviders]   = useState([]);
  const [activeProvider, setActiveProvider] = useState(null);
  const [categories, setCategories] = useState([]);
  const [seriesList, setSeriesList] = useState([]);
  const [selectedCat, setSelectedCat] = useState('all');
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  // Series detail state
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [seriesInfo, setSeriesInfo] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [activeSeason, setActiveSeason] = useState(null);
  const [playingEpisode, setPlayingEpisode] = useState(null);
  const [episodeStreamUrl, setEpisodeStreamUrl] = useState(null);
  const [episodeStreamFallback, setEpisodeStreamFallback] = useState(null);
  const videoRef = useRef(null);
  const searchTimer = useRef(null);

  useEffect(() => {
    api.get('/iptv/providers').then(r => {
      setProviders(r.data || []);
      if (r.data?.length) setActiveProvider(r.data[0]);
    }).catch(() => setError('No hay proveedores IPTV'));
  }, []);

  const pidQ = activeProvider?.id ? `?p=${activeProvider.id}` : '';

  useEffect(() => {
    if (!activeProvider) return;
    api.get(`/iptv/series/categories${pidQ}`).then(r => setCategories(r.data || [])).catch(() => {});
  }, [activeProvider?.id]);

  const loadSeries = useCallback(async () => {
    if (!activeProvider) return;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page, limit: 60 });
      if (selectedCat !== 'all') params.set('category_id', selectedCat);
      if (search.trim()) params.set('q', search.trim());
      if (activeProvider.id) params.set('p', activeProvider.id);
      const r = await api.get(`/iptv/series?${params}`);
      setSeriesList(r.data.results || []);
      setTotalPages(r.data.pages || 1);
    } catch (e) {
      setError(e.response?.data?.error || 'Error cargando series');
    } finally {
      setLoading(false);
    }
  }, [activeProvider?.id, selectedCat, search, page]);

  useEffect(() => { loadSeries(); }, [loadSeries]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(1); loadSeries(); }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [search]); // eslint-disable-line

  const openSeries = async (s) => {
    setSelectedSeries(s);
    setSeriesInfo(null);
    setActiveSeason(null);
    setPlayingEpisode(null);
    setLoadingInfo(true);
    try {
      const r = await api.get(`/iptv/series/${s.series_id}${pidQ}`);
      setSeriesInfo(r.data);
      const keys = Object.keys(r.data?.episodes || {});
      if (keys.length) setActiveSeason(keys[0]);
    } catch {
      setSeriesInfo({ info: { name: s.name }, episodes: {} });
    } finally {
      setLoadingInfo(false);
    }
  };

  const closeModal = () => {
    setSelectedSeries(null);
    setSeriesInfo(null);
    setActiveSeason(null);
    setPlayingEpisode(null);
    setEpisodeStreamUrl(null);
    setEpisodeStreamFallback(null);
    if (videoRef.current) {
      try { videoRef.current.pause(); videoRef.current.removeAttribute('src'); videoRef.current.load(); } catch {}
    }
  };

  const handleEpisodeError = () => {
    if (episodeStreamFallback && videoRef.current?.src !== episodeStreamFallback) {
      setEpisodeStreamUrl(episodeStreamFallback);
      setEpisodeStreamFallback(null);
    }
  };

  const playEpisode = async (ep) => {
    setPlayingEpisode(ep);
    setEpisodeStreamUrl(null);
    setEpisodeStreamFallback(null);
    const ext = ep.container_extension || 'mp4';
    const provParam = activeProvider?.id ? `?ext=${ext}&p=${activeProvider.id}` : `?ext=${ext}`;
    try {
      const r = await api.get(`/iptv/episode/stream/${ep.id}${provParam}`);
      setEpisodeStreamUrl(r.data.direct);
      setEpisodeStreamFallback(r.data.proxy);
    } catch {
      setEpisodeStreamUrl(`/api/iptv/episode/proxy/${ep.id}.${ext}${pidQ}`);
    }
    setTimeout(() => { videoRef.current?.play().catch(() => {}); }, 200);
  };

  if (!loading && providers.length === 0 && error) return (
    <div className="pt-24 flex items-center justify-center min-h-screen px-4">
      <div className="glass-card p-8 max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-900/30 flex items-center justify-center mx-auto mb-4 border border-red-800/40">
          <WifiOff size={28} className="text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Sin proveedores IPTV</h2>
        <p className="text-gray-400 text-sm mb-5">Configura un proveedor IPTV en el panel de administración.</p>
        <Link to="/admin/providers" className="btn-primary justify-center"><Settings size={16} /> Configurar</Link>
      </div>
    </div>
  );

  return (
    <div className="pt-20 px-4 md:px-6 lg:px-8 max-w-7xl mx-auto min-h-screen pb-10">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
            <Clapperboard size={20} className="text-accent-light" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-white">Series IPTV</h1>
            <p className="text-gray-500 text-sm">Catálogo de series desde tu proveedor</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {providers.length > 1 && (
          <select
            value={activeProvider?.id || ''}
            onChange={e => { const p = providers.find(x => x.id === Number(e.target.value)); setActiveProvider(p); setPage(1); setSelectedCat('all'); setSearch(''); }}
            className="bg-gray-900 border border-gray-800 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent"
          >
            {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}

        <select
          value={selectedCat}
          onChange={e => { setSelectedCat(e.target.value); setPage(1); }}
          className="bg-gray-900 border border-gray-800 text-white text-sm rounded-lg px-3 py-2 max-w-56 truncate focus:outline-none focus:border-accent"
        >
          <option value="all">Todas las categorías</option>
          {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
        </select>

        <div className="relative flex-1 min-w-56">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar serie..."
            className="w-full bg-gray-900 border border-gray-800 text-white placeholder-gray-600 text-sm rounded-lg pl-9 pr-9 py-2 focus:outline-none focus:border-accent"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"><X size={14} /></button>}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : error ? (
        <div className="glass-card p-10 text-center">
          <p className="text-red-300 mb-4">{error}</p>
          <button onClick={loadSeries} className="btn-primary justify-center">Reintentar</button>
        </div>
      ) : seriesList.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <Clapperboard size={42} className="text-gray-600 mx-auto mb-3" />
          <p className="text-white font-bold">Sin series</p>
          <p className="text-gray-500 text-sm mt-1">No se encontraron resultados en este proveedor.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {seriesList.map(s => <SeriesCard key={s.series_id} s={s} onClick={openSeries} />)}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-4 py-2 bg-gray-900 text-gray-400 text-sm rounded-lg hover:bg-gray-800 disabled:opacity-40">Anterior</button>
              <span className="text-gray-400 text-sm px-3">Página <span className="text-white font-bold">{page}</span> de {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-4 py-2 bg-gray-900 text-gray-400 text-sm rounded-lg hover:bg-gray-800 disabled:opacity-40">Siguiente</button>
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      {selectedSeries && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={closeModal}>
          <div className="glass-card w-full max-w-5xl my-6 overflow-hidden" onClick={e => e.stopPropagation()}>
            <button onClick={closeModal} className="absolute top-3 right-3 bg-black/70 hover:bg-black text-white p-2 rounded-full z-20"><X size={18} /></button>

            {playingEpisode ? (
              <div className="aspect-video bg-black relative">
                {episodeStreamUrl ? (
                  <video ref={videoRef} src={episodeStreamUrl} controls autoPlay playsInline onError={handleEpisodeError} className="w-full h-full" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="w-10 h-10 border-4 border-accent/30 rounded-full relative">
                      <div className="absolute inset-0 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                  </div>
                )}
                <button onClick={() => { setPlayingEpisode(null); setEpisodeStreamUrl(null); }} className="absolute top-3 left-3 bg-black/70 hover:bg-black text-white text-xs px-3 py-1.5 rounded-full z-10">← Episodios</button>
              </div>
            ) : (
              <div className="relative">
                {selectedSeries.cover && (
                  <div className="absolute inset-0 opacity-20 bg-cover bg-center" style={{ backgroundImage: `url(${selectedSeries.cover})`, filter: 'blur(40px)' }} />
                )}
                <div className="relative p-6 flex flex-col md:flex-row gap-6">
                  <img src={seriesInfo?.info?.cover || selectedSeries.cover || POSTER_PLACEHOLDER}
                    onError={e => { e.target.src = POSTER_PLACEHOLDER; }}
                    alt={selectedSeries.name}
                    className="w-40 md:w-48 aspect-[2/3] rounded-xl object-cover shadow-2xl flex-shrink-0 mx-auto md:mx-0" />
                  <div className="flex-1 min-w-0">
                    <h2 className="text-2xl md:text-3xl font-black text-white mb-2">{seriesInfo?.info?.name || selectedSeries.name}</h2>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400 mb-3">
                      {seriesInfo?.info?.releaseDate && <span className="flex items-center gap-1"><Calendar size={12} />{seriesInfo.info.releaseDate}</span>}
                      {seriesInfo?.info?.genre && <span className="text-accent-light">{seriesInfo.info.genre}</span>}
                      {seriesInfo?.info?.rating && seriesInfo.info.rating !== '0' && (
                        <span className="flex items-center gap-1 text-yellow-400"><Star size={12} fill="currentColor" />{seriesInfo.info.rating}</span>
                      )}
                    </div>
                    {loadingInfo ? (
                      <div className="flex items-center gap-2 text-gray-500 text-sm"><Loader size={14} className="animate-spin" /> Cargando episodios…</div>
                    ) : (
                      <p className="text-gray-300 text-sm leading-relaxed line-clamp-5">
                        {seriesInfo?.info?.plot || 'Sin descripción disponible.'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Seasons + Episodes */}
            {!playingEpisode && seriesInfo?.episodes && (
              <div className="border-t border-gray-800">
                <div className="flex gap-2 px-5 py-3 border-b border-gray-800 overflow-x-auto">
                  {Object.keys(seriesInfo.episodes).sort((a, b) => Number(a) - Number(b)).map(season => (
                    <button key={season} onClick={() => setActiveSeason(season)}
                      className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${activeSeason === season ? 'bg-accent text-white shadow shadow-accent/30' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                      Temporada {season}
                    </button>
                  ))}
                </div>
                <div className="max-h-96 overflow-y-auto divide-y divide-gray-800/60">
                  {(seriesInfo.episodes[activeSeason] || []).map(ep => (
                    <button key={ep.id} onClick={() => playEpisode(ep)}
                      className="w-full text-left flex items-start gap-4 px-5 py-3 hover:bg-gray-800/30 transition-colors">
                      <div className="w-28 aspect-video rounded-lg bg-gray-800 overflow-hidden flex-shrink-0 relative">
                        {ep.info?.movie_image ? (
                          <img src={ep.info.movie_image} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                        ) : <div className="w-full h-full flex items-center justify-center"><Tv2 size={24} className="text-gray-600" /></div>}
                        <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center">
                            <Play size={14} fill="white" className="text-white ml-0.5" />
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold">
                          <span className="text-gray-600 mr-2">E{ep.episode_num}</span>
                          {ep.title || ep.name || `Episodio ${ep.episode_num}`}
                        </p>
                        {ep.info?.plot && <p className="text-gray-500 text-xs mt-1 line-clamp-2">{ep.info.plot}</p>}
                        {ep.info?.duration && <p className="text-gray-600 text-xs mt-1">{ep.info.duration}</p>}
                      </div>
                      <ChevronRight size={16} className="text-gray-600 flex-shrink-0 mt-2" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
