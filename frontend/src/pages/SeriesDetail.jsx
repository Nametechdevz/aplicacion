import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Play, Star, Calendar, Bookmark, BookmarkCheck, ArrowLeft, ChevronDown } from 'lucide-react';
import { posterUrl, backdropUrl } from '../lib/api';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import MovieCard from '../components/MovieCard';

export default function SeriesDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonData, setSeasonData] = useState(null);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [wlLoading, setWlLoading] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    setLoading(true);
    api.get(`/series/${id}`).then(r => {
      setSeries(r.data);
      setLoading(false);
      const s = r.data.seasons?.find(s => s.season_number > 0);
      if (s) setSelectedSeason(s.season_number);
    }).catch(() => setLoading(false));
    if (user) {
      api.get('/watchlist').then(r => {
        setInWatchlist(r.data.some(w => w.tmdb_id === parseInt(id) && w.media_type === 'tv'));
      }).catch(() => {});
    }
  }, [id, user]);

  useEffect(() => {
    if (!selectedSeason) return;
    api.get(`/series/${id}/season/${selectedSeason}`).then(r => setSeasonData(r.data)).catch(() => {});
  }, [id, selectedSeason]);

  const toggleWatchlist = async () => {
    if (!user) return navigate('/login');
    setWlLoading(true);
    try {
      if (inWatchlist) {
        await api.delete(`/watchlist/${id}/tv`);
        setInWatchlist(false);
      } else {
        await api.post('/watchlist', { tmdb_id: id, media_type: 'tv', title: series.name, poster_path: series.poster_path });
        setInWatchlist(true);
      }
    } finally {
      setWlLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!series) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400">Serie no encontrada</p>
    </div>
  );

  const cast = series.credits?.cast?.slice(0, 10) || [];
  const seasons = (series.seasons || []).filter(s => s.season_number > 0);
  const episodes = seasonData?.episodes || [];

  return (
    <div className="min-h-screen">
      <div className="relative h-[50vh] md:h-[60vh]">
        {series.backdrop_path && (
          <img src={backdropUrl(series.backdrop_path)} alt={series.name} className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/60 to-transparent" />
        <button onClick={() => navigate(-1)} className="absolute top-20 left-6 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full transition-colors">
          <ArrowLeft size={20} />
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 -mt-32 relative z-10 pb-12">
        <div className="flex flex-col md:flex-row gap-8">
          <div className="flex-shrink-0">
            <img src={posterUrl(series.poster_path)} alt={series.name} className="w-48 md:w-64 rounded-2xl shadow-2xl mx-auto md:mx-0" />
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap gap-2 mb-2">
              {series.genres?.map(g => <span key={g.id} className="badge bg-purple-500/20 text-purple-300">{g.name}</span>)}
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-white mb-2">{series.name}</h1>

            <div className="flex flex-wrap gap-4 mb-4 text-sm text-gray-400">
              {series.vote_average > 0 && (
                <span className="flex items-center gap-1 text-yellow-400 font-bold">
                  <Star size={16} className="fill-yellow-400" />
                  {series.vote_average.toFixed(1)}
                </span>
              )}
              {series.first_air_date && <span className="flex items-center gap-1"><Calendar size={14} />{series.first_air_date.slice(0, 4)}</span>}
              {series.number_of_seasons && <span>{series.number_of_seasons} Temporada{series.number_of_seasons !== 1 ? 's' : ''}</span>}
              {series.number_of_episodes && <span>{series.number_of_episodes} Episodios</span>}
            </div>

            <p className="text-gray-300 mb-6 leading-relaxed">{series.overview}</p>

            <div className="flex flex-wrap gap-3 mb-8">
              <Link to={`/watch/tv/${series.id}?season=${selectedSeason}&episode=1`} className="btn-primary">
                <Play size={18} className="fill-white" />
                Ver Serie
              </Link>
              <button onClick={toggleWatchlist} disabled={wlLoading} className="btn-secondary">
                {inWatchlist ? <BookmarkCheck size={18} className="text-accent-light" /> : <Bookmark size={18} />}
                {inWatchlist ? 'En Mi Lista' : 'Mi Lista'}
              </button>
            </div>

            {cast.length > 0 && (
              <div>
                <h3 className="text-white font-bold mb-3">Reparto principal</h3>
                <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
                  {cast.map(actor => (
                    <div key={actor.id} className="flex-shrink-0 w-20 text-center">
                      <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-800 mx-auto mb-1">
                        {actor.profile_path
                          ? <img src={posterUrl(actor.profile_path, 'w185')} alt={actor.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-2xl">👤</div>
                        }
                      </div>
                      <p className="text-white text-xs font-medium line-clamp-2">{actor.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Episodes */}
        {seasons.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center gap-4 mb-6">
              <h2 className="section-title">Episodios</h2>
              <select
                value={selectedSeason}
                onChange={e => setSelectedSeason(Number(e.target.value))}
                className="bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                {seasons.map(s => (
                  <option key={s.id} value={s.season_number}>Temporada {s.season_number}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              {episodes.map(ep => (
                <Link
                  key={ep.id}
                  to={`/watch/tv/${series.id}?season=${selectedSeason}&episode=${ep.episode_number}`}
                  className="flex items-center gap-4 glass-card p-3 hover:border-accent/50 transition-all group"
                >
                  <div className="flex-shrink-0 w-8 h-8 bg-accent/20 rounded-full flex items-center justify-center text-accent-light font-bold text-sm group-hover:bg-accent group-hover:text-white transition-colors">
                    {ep.episode_number}
                  </div>
                  {ep.still_path && (
                    <img src={posterUrl(ep.still_path, 'w300')} alt={ep.name} className="w-24 h-14 object-cover rounded-lg flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm line-clamp-1">{ep.name}</p>
                    <p className="text-gray-400 text-xs line-clamp-2 mt-0.5">{ep.overview}</p>
                  </div>
                  <Play size={18} className="text-gray-500 group-hover:text-accent flex-shrink-0 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {series.similar?.length > 0 && (
          <div className="mt-12">
            <h2 className="section-title">Series similares</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {series.similar.slice(0, 12).map(s => <MovieCard key={s.id} item={s} type="series" />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
