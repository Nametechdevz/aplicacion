import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, RotateCcw, MonitorPlay } from 'lucide-react';
import api from '../lib/api';

const SOURCES = [
  {
    label: 'Servidor 1',
    movieUrl: (id) => `https://vidsrc.xyz/embed/movie?tmdb=${id}`,
    tvUrl: (id, s, e) => `https://vidsrc.xyz/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    label: 'Servidor 2',
    movieUrl: (id) => `https://vidsrc.to/embed/movie/${id}`,
    tvUrl: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
  },
  {
    label: 'Servidor 3',
    movieUrl: (id) => `https://2embed.org/embed/movie/${id}`,
    tvUrl: (id, s, e) => `https://2embed.org/embed/tv/${id}/${s}/${e}`,
  },
  {
    label: 'Servidor 4',
    movieUrl: (id) => `https://player.autoembed.cc/embed/movie/${id}`,
    tvUrl: (id, s, e) => `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`,
  },
];

export default function Watch() {
  const { type, id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const season = parseInt(searchParams.get('season') || '1');
  const episode = parseInt(searchParams.get('episode') || '1');

  const [source, setSource] = useState(0);
  const [info, setInfo] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (type === 'movie') {
      api.get(`/movie/${id}`).then(r => setInfo(r.data)).catch(() => {});
    } else {
      api.get(`/series/${id}`).then(r => {
        setInfo(r.data);
        setSeasons((r.data.seasons || []).filter(s => s.season_number > 0));
      }).catch(() => {});
    }
  }, [type, id]);

  useEffect(() => {
    if (type !== 'tv' || !season) return;
    api.get(`/series/${id}/season/${season}`).then(r => setEpisodes(r.data.episodes || [])).catch(() => {});
  }, [type, id, season]);

  const embedUrl = type === 'movie'
    ? SOURCES[source].movieUrl(id)
    : SOURCES[source].tvUrl(id, season, episode);

  const title = info?.title || info?.name || '';

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Top bar */}
      <div className="bg-gray-900/95 border-b border-gray-800 px-4 py-3 flex items-center gap-4 flex-wrap">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm truncate">{title}</p>
          {type === 'tv' && (
            <p className="text-gray-400 text-xs">T{season} · E{episode}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-gray-400 text-xs hidden sm:block">Servidor:</span>
          {SOURCES.map((s, i) => (
            <button
              key={i}
              onClick={() => { setSource(i); setKey(k => k + 1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${source === i ? 'bg-accent text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {s.label}
            </button>
          ))}
          <button onClick={() => setKey(k => k + 1)} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors" title="Recargar">
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* Player */}
      <div className="flex-1 flex flex-col lg:flex-row">
        <div className="flex-1 bg-black">
          <div className="w-full" style={{ aspectRatio: '16/9' }}>
            <iframe
              key={`${source}-${id}-${season}-${episode}-${key}`}
              src={embedUrl}
              className="w-full h-full"
              allowFullScreen
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              referrerPolicy="origin"
            />
          </div>
        </div>

        {/* Episode sidebar (TV only) */}
        {type === 'tv' && (
          <div className="lg:w-80 bg-gray-900 border-l border-gray-800 flex flex-col">
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-center gap-2 mb-3">
                <MonitorPlay size={16} className="text-accent" />
                <span className="text-white font-semibold text-sm">Episodios</span>
              </div>
              <select
                value={season}
                onChange={e => setSearchParams({ season: e.target.value, episode: '1' })}
                className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                {seasons.map(s => (
                  <option key={s.id} value={s.season_number}>Temporada {s.season_number}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto">
              {episodes.map(ep => (
                <button
                  key={ep.id}
                  onClick={() => setSearchParams({ season, episode: ep.episode_number })}
                  className={`w-full text-left p-3 border-b border-gray-800/50 flex items-start gap-3 transition-colors hover:bg-gray-800/50 ${ep.episode_number === episode ? 'bg-accent/10 border-l-2 border-l-accent' : ''}`}
                >
                  <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${ep.episode_number === episode ? 'bg-accent text-white' : 'bg-gray-800 text-gray-400'}`}>
                    {ep.episode_number}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold line-clamp-1 ${ep.episode_number === episode ? 'text-accent-light' : 'text-white'}`}>{ep.name}</p>
                    <p className="text-gray-500 text-xs line-clamp-2 mt-0.5">{ep.overview}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Info bar */}
      {info && (
        <div className="bg-gray-900/95 border-t border-gray-800 px-4 py-3">
          <p className="text-gray-400 text-xs">
            Si el video no carga, prueba otro servidor. Los servidores son servicios externos de terceros.
          </p>
        </div>
      )}
    </div>
  );
}
