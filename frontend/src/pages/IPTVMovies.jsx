import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Film, Search, X, ChevronDown, Loader, WifiOff, Settings, Play, Star, Calendar } from 'lucide-react';
import api from '../lib/api';

const POSTER_PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMzAwIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzFmMjkzNyIvPjxjaXJjbGUgY3g9IjEwMCIgY3k9IjEyMCIgcj0iMjAiIGZpbGw9IiM0YjU1NjMiLz48cmVjdCB4PSI1MCIgeT0iMTYwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjgiIHJ4PSI0IiBmaWxsPSIjNGI1NTYzIi8+PHJlY3QgeD0iNzAiIHk9IjE4MCIgd2lkdGg9IjYwIiBoZWlnaHQ9IjYiIHJ4PSIzIiBmaWxsPSIjMzc0MTUxIi8+PC9zdmc+';

const MovieCard = ({ m, onClick }) => (
  <button onClick={() => onClick(m)} className="group text-left relative">
    <div className="aspect-[2/3] rounded-xl overflow-hidden bg-gray-800 shadow-lg group-hover:shadow-accent/30 group-hover:scale-[1.04] transition-all duration-300 relative">
      <img
        src={m.stream_icon || POSTER_PLACEHOLDER}
        alt={m.name}
        loading="lazy"
        onError={e => { e.target.src = POSTER_PLACEHOLDER; }}
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
        <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center shadow-lg">
          <Play size={16} className="text-white ml-0.5" fill="white" />
        </div>
      </div>
      {m.rating && m.rating !== '0' && (
        <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-yellow-400 text-xs font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
          <Star size={10} fill="currentColor" />{Number(m.rating).toFixed(1)}
        </div>
      )}
    </div>
    <p className="text-white text-sm font-semibold mt-2 line-clamp-1">{m.name}</p>
    {m.year && <p className="text-gray-500 text-xs">{m.year}</p>}
  </button>
);

export default function IPTVMovies() {
  const [providers, setProviders]   = useState([]);
  const [activeProvider, setActiveProvider] = useState(null);
  const [categories, setCategories] = useState([]);
  const [movies, setMovies]         = useState([]);
  const [selectedCat, setSelectedCat] = useState('all');
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [movieInfo, setMovieInfo]   = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [playing, setPlaying]       = useState(false);
  const [streamUrl, setStreamUrl]   = useState(null);
  const [streamFallback, setStreamFallback] = useState(null);
  const videoRef = useRef(null);
  const searchTimer = useRef(null);

  // Providers
  useEffect(() => {
    api.get('/iptv/providers').then(r => {
      setProviders(r.data || []);
      if (r.data?.length) setActiveProvider(r.data[0]);
    }).catch(() => setError('No hay proveedores IPTV disponibles'));
  }, []);

  const pid = activeProvider?.id ? `&p=${activeProvider.id}` : '';
  const pidQ = activeProvider?.id ? `?p=${activeProvider.id}` : '';

  // Categories (depends on provider)
  useEffect(() => {
    if (!activeProvider) return;
    api.get(`/iptv/vod/categories${pidQ}`).then(r => setCategories(r.data || [])).catch(() => {});
  }, [activeProvider?.id]);

  // Movies list
  const loadMovies = useCallback(async () => {
    if (!activeProvider) return;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page, limit: 60 });
      if (selectedCat !== 'all') params.set('category_id', selectedCat);
      if (search.trim()) params.set('q', search.trim());
      if (activeProvider.id) params.set('p', activeProvider.id);
      const r = await api.get(`/iptv/vod/movies?${params}`);
      setMovies(r.data.results || []);
      setTotalPages(r.data.pages || 1);
    } catch (e) {
      setError(e.response?.data?.error || 'Error cargando películas');
    } finally {
      setLoading(false);
    }
  }, [activeProvider?.id, selectedCat, search, page]);

  useEffect(() => { loadMovies(); }, [loadMovies]);

  // Debounced search
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(1); loadMovies(); }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [search]); // eslint-disable-line

  const openMovie = async (m) => {
    setSelectedMovie(m);
    setMovieInfo(null);
    setPlaying(false);
    setLoadingInfo(true);
    try {
      const r = await api.get(`/iptv/vod/info/${m.stream_id}${pidQ}`);
      setMovieInfo(r.data);
    } catch {
      setMovieInfo({ movie_data: { name: m.name }, info: {} });
    } finally {
      setLoadingInfo(false);
    }
  };

  const closeModal = () => {
    setSelectedMovie(null);
    setMovieInfo(null);
    setPlaying(false);
    setStreamUrl(null);
    setStreamFallback(null);
    if (videoRef.current) {
      try { videoRef.current.pause(); videoRef.current.removeAttribute('src'); videoRef.current.load(); } catch {}
    }
  };

  const playMovie = async () => {
    const m = selectedMovie;
    if (!m) return;
    setPlaying(true);
    const ext = movieInfo?.movie_data?.container_extension || 'mp4';
    const provParam = activeProvider?.id ? `?ext=${ext}&p=${activeProvider.id}` : `?ext=${ext}`;
    try {
      const r = await api.get(`/iptv/vod/stream/${m.stream_id}${provParam}`);
      setStreamUrl(r.data.direct);
      setStreamFallback(r.data.proxy);
    } catch {
      setStreamUrl(`/api/iptv/vod/proxy/${m.stream_id}.${ext}${pidQ}`);
      setStreamFallback(null);
    }
    setTimeout(() => { videoRef.current?.play().catch(() => {}); }, 200);
  };

  const handleVideoError = () => {
    if (streamFallback && videoRef.current?.src !== streamFallback) {
      setStreamUrl(streamFallback);
      setStreamFallback(null);
    }
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

  // streamUrl + streamFallback are set dynamically via playMovie()

  return (
    <div className="pt-20 px-4 md:px-6 lg:px-8 max-w-7xl mx-auto min-h-screen pb-10">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
            <Film size={20} className="text-accent-light" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-white">Películas IPTV</h1>
            <p className="text-gray-500 text-sm">Catálogo VOD desde tu proveedor</p>
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
            placeholder="Buscar película..."
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
          <button onClick={loadMovies} className="btn-primary justify-center">Reintentar</button>
        </div>
      ) : movies.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <Film size={42} className="text-gray-600 mx-auto mb-3" />
          <p className="text-white font-bold">Sin películas</p>
          <p className="text-gray-500 text-sm mt-1">No se encontraron resultados en este proveedor.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {movies.map(m => <MovieCard key={m.stream_id} m={m} onClick={openMovie} />)}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-4 py-2 bg-gray-900 text-gray-400 text-sm rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed">Anterior</button>
              <span className="text-gray-400 text-sm px-3">Página <span className="text-white font-bold">{page}</span> de {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-4 py-2 bg-gray-900 text-gray-400 text-sm rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed">Siguiente</button>
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      {selectedMovie && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={closeModal}>
          <div className="glass-card w-full max-w-4xl my-6 overflow-hidden" onClick={e => e.stopPropagation()}>
            {playing ? (
              <div className="aspect-video bg-black relative">
                {streamUrl ? (
                  <video ref={videoRef} src={streamUrl} controls autoPlay playsInline onError={handleVideoError} className="w-full h-full" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="w-10 h-10 border-4 border-accent/30 rounded-full relative">
                      <div className="absolute inset-0 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                  </div>
                )}
                <button onClick={closeModal} className="absolute top-3 right-3 bg-black/70 hover:bg-black text-white p-2 rounded-full z-10"><X size={18} /></button>
              </div>
            ) : (
              <div className="relative">
                {selectedMovie.stream_icon && (
                  <div className="absolute inset-0 opacity-20 bg-cover bg-center" style={{ backgroundImage: `url(${selectedMovie.stream_icon})`, filter: 'blur(40px)' }} />
                )}
                <button onClick={closeModal} className="absolute top-3 right-3 bg-black/70 hover:bg-black text-white p-2 rounded-full z-10"><X size={18} /></button>
                <div className="relative p-6 flex flex-col md:flex-row gap-6">
                  <img src={selectedMovie.stream_icon || POSTER_PLACEHOLDER} onError={e => { e.target.src = POSTER_PLACEHOLDER; }}
                    alt={selectedMovie.name} className="w-48 md:w-56 aspect-[2/3] rounded-xl object-cover shadow-2xl flex-shrink-0 mx-auto md:mx-0" />
                  <div className="flex-1 min-w-0">
                    <h2 className="text-2xl md:text-3xl font-black text-white mb-2">{movieInfo?.info?.name || selectedMovie.name}</h2>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400 mb-4">
                      {movieInfo?.info?.releasedate && <span className="flex items-center gap-1"><Calendar size={12} />{movieInfo.info.releasedate}</span>}
                      {movieInfo?.info?.duration && <span>{movieInfo.info.duration}</span>}
                      {movieInfo?.info?.genre && <span className="text-accent-light">{movieInfo.info.genre}</span>}
                      {movieInfo?.info?.rating && movieInfo.info.rating !== '0' && (
                        <span className="flex items-center gap-1 text-yellow-400"><Star size={12} fill="currentColor" />{movieInfo.info.rating}</span>
                      )}
                    </div>
                    {loadingInfo ? (
                      <div className="flex items-center gap-2 text-gray-500 text-sm"><Loader size={14} className="animate-spin" /> Cargando detalles…</div>
                    ) : (
                      <p className="text-gray-300 text-sm leading-relaxed mb-5 line-clamp-6">
                        {movieInfo?.info?.plot || movieInfo?.info?.description || 'Sin descripción disponible.'}
                      </p>
                    )}
                    <button onClick={playMovie} className="btn-primary text-base px-6 py-3">
                      <Play size={18} fill="white" /> Reproducir
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
