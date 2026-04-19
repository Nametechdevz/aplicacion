import React, { useState, useEffect } from 'react';
import { Bookmark } from 'lucide-react';
import MovieCard from '../components/MovieCard';
import api from '../lib/api';

export default function Watchlist() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/watchlist').then(r => { setItems(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="pt-24 px-4 md:px-8 pb-12">
      <div className="flex items-center gap-3 mb-8">
        <Bookmark size={28} className="text-accent" />
        <h1 className="text-3xl font-black text-white">Mi Lista</h1>
        <span className="badge bg-accent/20 text-accent-light ml-2">{items.length}</span>
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="text-center py-20">
          <div className="text-7xl mb-4">📋</div>
          <h2 className="text-xl font-bold text-white mb-2">Tu lista está vacía</h2>
          <p className="text-gray-400">Agrega películas y series para verlas más tarde</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map(item => (
            <MovieCard
              key={`${item.tmdb_id}-${item.media_type}`}
              item={{ id: item.tmdb_id, title: item.title, name: item.title, poster_path: item.poster_path }}
              type={item.media_type === 'movie' ? 'movie' : 'series'}
            />
          ))}
        </div>
      )}
    </div>
  );
}
