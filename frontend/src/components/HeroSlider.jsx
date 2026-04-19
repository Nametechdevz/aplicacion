import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Info, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { backdropUrl } from '../lib/api';

export default function HeroSlider({ items = [], type = 'movie' }) {
  const [current, setCurrent] = useState(0);
  const featured = items.slice(0, 6);

  useEffect(() => {
    if (featured.length < 2) return;
    const t = setInterval(() => setCurrent(c => (c + 1) % featured.length), 7000);
    return () => clearInterval(t);
  }, [featured.length]);

  if (!featured.length) return <div className="h-[70vh] bg-gray-900 animate-pulse" />;

  const item = featured[current];
  const title = item.title || item.name;
  const mediaType = type === 'movie' ? 'movie' : 'series';
  const detailPath = mediaType === 'movie' ? `/movie/${item.id}` : `/series/${item.id}`;
  const watchPath = `/watch/${mediaType === 'movie' ? 'movie' : 'tv'}/${item.id}`;

  return (
    <div className="relative h-[70vh] md:h-[80vh] overflow-hidden">
      {/* Backdrop */}
      {featured.map((f, i) => (
        <div
          key={f.id}
          className={`absolute inset-0 transition-opacity duration-1000 ${i === current ? 'opacity-100' : 'opacity-0'}`}
        >
          <img
            src={backdropUrl(f.backdrop_path)}
            alt={f.title || f.name}
            className="w-full h-full object-cover"
          />
        </div>
      ))}

      {/* Gradients */}
      <div className="absolute inset-0 hero-gradient" />
      <div className="absolute bottom-0 left-0 right-0 h-40 hero-bottom-gradient" />

      {/* Content */}
      <div className="absolute inset-0 flex items-end pb-20 px-6 md:px-16">
        <div className="max-w-lg">
          <h1 className="text-3xl md:text-5xl font-black text-white mb-3 leading-tight">{title}</h1>

          <div className="flex items-center gap-3 mb-3">
            {item.vote_average > 0 && (
              <span className="flex items-center gap-1 text-yellow-400 font-bold text-sm">
                <Star size={14} className="fill-yellow-400" />
                {item.vote_average.toFixed(1)}
              </span>
            )}
            <span className="text-gray-400 text-sm">
              {(item.release_date || item.first_air_date || '').slice(0, 4)}
            </span>
          </div>

          <p className="text-gray-300 text-sm md:text-base line-clamp-3 mb-6">{item.overview}</p>

          <div className="flex items-center gap-3 flex-wrap">
            <Link to={watchPath} className="btn-primary">
              <Play size={18} className="fill-white" />
              Ver Ahora
            </Link>
            <Link to={detailPath} className="btn-secondary">
              <Info size={18} />
              Más Info
            </Link>
          </div>
        </div>
      </div>

      {/* Arrows */}
      {featured.length > 1 && (
        <>
          <button
            onClick={() => setCurrent(c => (c - 1 + featured.length) % featured.length)}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white p-2 rounded-full transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={() => setCurrent(c => (c + 1) % featured.length)}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white p-2 rounded-full transition-colors"
          >
            <ChevronRight size={24} />
          </button>
          <div className="absolute bottom-6 right-6 flex gap-2">
            {featured.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-2 h-2 rounded-full transition-all ${i === current ? 'bg-accent w-6' : 'bg-white/40'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
