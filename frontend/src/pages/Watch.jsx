import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw, MonitorPlay, Server } from 'lucide-react';
import api from '../lib/api';

const SOURCES = [
  {
    label: 'VidSrc 1',
    movieUrl: (id) => `https://vidsrc.xyz/embed/movie?tmdb=${id}`,
    tvUrl: (id, s, e) => `https://vidsrc.xyz/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    label: 'VidSrc 2',
    movieUrl: (id) => `https://vidsrc.to/embed/movie/${id}`,
    tvUrl: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
  },
  {
    label: 'VidLink',
    movieUrl: (id) => `https://vidlink.pro/movie/${id}?primaryColor=7c3aed`,
    tvUrl: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=7c3aed`,
  },
  {
    label: 'SuperEmbed',
    movieUrl: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
    tvUrl: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  },
  {
    label: 'EmbedSu',
    movieUrl: (id) => `https://embed.su/embed/movie/${id}`,
    tvUrl: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`,
  },
  {
    label: 'Rive',
    movieUrl: (id) => `https://rive.show/embed/movie/${id}`,
    tvUrl: (id, s, e) => `https://rive.show/embed/tv/${id}?season=${s}&episode=${e}`,
  },
  {
    label: '2Embed',
    movieUrl: (id) => `https://www.2embed.cc/embed/${id}`,
    tvUrl: (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
  },
  {
    label: 'AutoEmbed',
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
  const [showSources, setShowSources] = useState(false);

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

  const switchSource = (i) => {
    setSource(i);
    setKey(k => k + 1);
    setShowSources(false);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Top bar */}
      <div className="bg-gray-900/95 border-b border-gray-800 px-4 py-3 flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white transition-colors p-1">
          <ArrowLeft size={22} />
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm truncate">{title}</p>
          {type === 'tv' && (
            <p className="text-gray-400 text-xs">Temporada {season} · Episodio {episode}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Source selector */}
          <div className="relative">
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
            >
              <Server size={14} className="text-accent-light" />
              {SOURCES[source].label}
              <span className="text-gray-500">▾</span>
            </button>

            {showSources && (
              <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 py-1 min-w-40">
                <p className="text-gray-500 text-xs px-3 py-1.5 border-b border-gray-800">Cambiar servidor</p>
                {SOURCES.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => switchSource(i)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${i === source ? 'text-accent-light bg-accent/10' : 'text-gray-300 hover:text-white hover:bg-gray-800'}`}
                  >
                    {s.label}
                    {i === source && <span className="text-accent text-xs">●</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setKey(k => k + 1)}
            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors"
            title="Recargar"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* Player + Sidebar */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Player */}
        <div className="flex-1 bg-black flex items-start">
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

        {/* Episode sidebar */}
        {type === 'tv' && (
          <div className="lg:w-80 bg-gray-900 border-l border-gray-800 flex flex-col max-h-screen lg:sticky lg:top-0">
            <div className="p-4 border-b border-gray-800 flex-shrink-0">
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
                  <option key={s.id} value={s.season_number}>
                    Temporada {s.season_number} {s.episode_count ? `(${s.episode_count} eps)` : ''}
                  </option>
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
                  <div className="min-w-0 flex-1">
                    {ep.still_path && (
                      <img
                        src={`https://image.tmdb.org/t/p/w300${ep.still_path}`}
                        alt={ep.name}
                        className="w-full h-16 object-cover rounded-lg mb-1.5"
                      />
                    )}
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
      <div className="bg-gray-900/80 border-t border-gray-800 px-4 py-2 flex items-center gap-4 flex-wrap">
        <p className="text-gray-500 text-xs flex-1">
          Si el video no carga, cambia de servidor con el botón <span className="text-gray-300 font-semibold">"{SOURCES[source].label}"</span> arriba.
          Los servidores son servicios externos de terceros.
        </p>
        <div className="flex gap-1">
          {SOURCES.map((_, i) => (
            <button
              key={i}
              onClick={() => switchSource(i)}
              className={`w-2 h-2 rounded-full transition-all ${i === source ? 'bg-accent w-4' : 'bg-gray-700 hover:bg-gray-500'}`}
              title={SOURCES[i].label}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
