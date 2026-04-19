import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Play, Star, Clock, Calendar, Bookmark, BookmarkCheck, ArrowLeft } from 'lucide-react';
import { posterUrl, backdropUrl } from '../lib/api';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import MovieCard from '../components/MovieCard';

export default function MovieDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [wlLoading, setWlLoading] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    setLoading(true);
    api.get(`/movie/${id}`).then(r => { setMovie(r.data); setLoading(false); }).catch(() => setLoading(false));
    if (user) {
      api.get('/watchlist').then(r => {
        setInWatchlist(r.data.some(w => w.tmdb_id === parseInt(id) && w.media_type === 'movie'));
      }).catch(() => {});
    }
  }, [id, user]);

  const toggleWatchlist = async () => {
    if (!user) return navigate('/login');
    setWlLoading(true);
    try {
      if (inWatchlist) {
        await api.delete(`/watchlist/${id}/movie`);
        setInWatchlist(false);
      } else {
        await api.post('/watchlist', { tmdb_id: id, media_type: 'movie', title: movie.title, poster_path: movie.poster_path });
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

  if (!movie) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400">Película no encontrada</p>
    </div>
  );

  const cast = movie.credits?.cast?.slice(0, 10) || [];
  const trailer = movie.videos?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
  const runtime = movie.runtime ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : null;

  return (
    <div className="min-h-screen">
      {/* Backdrop */}
      <div className="relative h-[50vh] md:h-[60vh]">
        {movie.backdrop_path && (
          <img src={backdropUrl(movie.backdrop_path)} alt={movie.title} className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/60 to-transparent" />
        <button onClick={() => navigate(-1)} className="absolute top-20 left-6 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full transition-colors">
          <ArrowLeft size={20} />
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 -mt-32 relative z-10 pb-12">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Poster */}
          <div className="flex-shrink-0">
            <img
              src={posterUrl(movie.poster_path)}
              alt={movie.title}
              className="w-48 md:w-64 rounded-2xl shadow-2xl mx-auto md:mx-0"
            />
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              {movie.genres?.map(g => (
                <span key={g.id} className="badge bg-accent/20 text-accent-light">{g.name}</span>
              ))}
            </div>

            <h1 className="text-3xl md:text-4xl font-black text-white mb-2">{movie.title}</h1>

            {movie.tagline && <p className="text-accent-light italic mb-4">"{movie.tagline}"</p>}

            <div className="flex flex-wrap items-center gap-4 mb-4 text-sm text-gray-400">
              {movie.vote_average > 0 && (
                <span className="flex items-center gap-1 text-yellow-400 font-bold">
                  <Star size={16} className="fill-yellow-400" />
                  {movie.vote_average.toFixed(1)} / 10
                </span>
              )}
              {runtime && <span className="flex items-center gap-1"><Clock size={14} />{runtime}</span>}
              {movie.release_date && <span className="flex items-center gap-1"><Calendar size={14} />{movie.release_date.slice(0, 4)}</span>}
            </div>

            <p className="text-gray-300 mb-6 leading-relaxed">{movie.overview}</p>

            <div className="flex flex-wrap gap-3 mb-8">
              <Link to={`/watch/movie/${movie.id}`} className="btn-primary">
                <Play size={18} className="fill-white" />
                Ver Película
              </Link>
              <button onClick={toggleWatchlist} disabled={wlLoading} className="btn-secondary">
                {inWatchlist ? <BookmarkCheck size={18} className="text-accent-light" /> : <Bookmark size={18} />}
                {inWatchlist ? 'En Mi Lista' : 'Mi Lista'}
              </button>
              {trailer && (
                <a href={`https://www.youtube.com/watch?v=${trailer.key}`} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                  ▶ Tráiler
                </a>
              )}
            </div>

            {/* Cast */}
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
                      <p className="text-gray-500 text-xs line-clamp-1">{actor.character}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Similar */}
        {movie.similar?.length > 0 && (
          <div className="mt-12">
            <h2 className="section-title">Películas similares</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {movie.similar.slice(0, 12).map(m => <MovieCard key={m.id} item={m} type="movie" />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
