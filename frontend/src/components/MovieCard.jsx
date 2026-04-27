import React from 'react';
import { Link } from 'react-router-dom';
import { Star, Play } from 'lucide-react';
import { posterUrl } from '../lib/api';

export default function MovieCard({ item, type = 'movie' }) {
  const mediaType = type === 'movie' || item.title ? 'movie' : 'series';
  const title = item.title || item.name;
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const to = mediaType === 'movie' ? `/movie/${item.id}` : `/series/${item.id}`;

  return (
    <Link to={to} className="group block">
      <div className="relative overflow-hidden rounded-xl bg-gray-900 card-hover">
        <div className="aspect-[2/3] relative">
          {item.poster_path ? (
            <img
              src={posterUrl(item.poster_path)}
              alt={title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-gray-800 flex items-center justify-center">
              <span className="text-gray-600 text-4xl">🎬</span>
            </div>
          )}

          {/* Overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
            <div className="flex items-center gap-2 mb-2">
              <button className="flex items-center gap-1.5 bg-accent hover:bg-accent-dark text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors w-full justify-center">
                <Play size={12} className="fill-white" />
                Ver Ahora
              </button>
            </div>
            <p className="text-white font-semibold text-xs line-clamp-2">{title}</p>
          </div>

          {/* Rating badge */}
          {item.vote_average > 0 && (
            <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-yellow-400 text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1">
              <Star size={10} className="fill-yellow-400" />
              {item.vote_average.toFixed(1)}
            </div>
          )}
        </div>

        <div className="p-2.5">
          <h3 className="text-white text-sm font-semibold line-clamp-1">{title}</h3>
          <div className="flex items-center gap-2 mt-1">
            {year && <span className="text-gray-500 text-xs">{year}</span>}
            <span className={`badge text-xs ${mediaType === 'movie' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'}`}>
              {mediaType === 'movie' ? 'Película' : 'Serie'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
