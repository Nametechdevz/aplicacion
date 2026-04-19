import React, { useState, useEffect } from 'react';
import MovieCard from '../components/MovieCard';
import api from '../lib/api';
import { Tv } from 'lucide-react';

const CATEGORIES = [
  { label: 'Populares', endpoint: '/series/popular' },
  { label: 'Tendencias', endpoint: '/series/trending' },
  { label: 'Mejor Valoradas', endpoint: '/series/top-rated' },
];

export default function Series() {
  const [category, setCategory] = useState(0);
  const [series, setSeries] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [genres, setGenres] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState('');

  useEffect(() => {
    api.get('/genres/series').then(r => setGenres(r.data.genres || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setSeries([]);
    setPage(1);
  }, [category, selectedGenre]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        let res;
        if (selectedGenre) {
          res = await api.get(`/series/genre/${selectedGenre}`, { params: { page } });
        } else {
          res = await api.get(CATEGORIES[category].endpoint, { params: { page } });
        }
        setSeries(prev => page === 1 ? res.data.results : [...prev, ...res.data.results]);
        setTotalPages(res.data.total_pages || 1);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [category, page, selectedGenre]);

  return (
    <div className="pt-20 px-4 md:px-8 pb-12">
      <div className="flex items-center gap-3 mb-6">
        <Tv size={28} className="text-accent" />
        <h1 className="text-3xl font-black text-white">Series</h1>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        {!selectedGenre && CATEGORIES.map((c, i) => (
          <button
            key={i}
            onClick={() => { setCategory(i); setSelectedGenre(''); }}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${category === i && !selectedGenre ? 'bg-accent text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            {c.label}
          </button>
        ))}
        <select
          value={selectedGenre}
          onChange={e => setSelectedGenre(e.target.value)}
          className="bg-gray-800 text-gray-300 border border-gray-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-accent"
        >
          <option value="">Por Género...</option>
          {genres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        {selectedGenre && (
          <button onClick={() => setSelectedGenre('')} className="px-4 py-2 rounded-full text-sm bg-red-900/40 text-red-300 hover:bg-red-900/60">
            ✕ Limpiar filtro
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {series.map(s => <MovieCard key={s.id} item={s} type="series" />)}
      </div>

      {loading && (
        <div className="flex justify-center mt-8">
          <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && page < Math.min(totalPages, 10) && (
        <div className="flex justify-center mt-8">
          <button onClick={() => setPage(p => p + 1)} className="btn-primary px-8">Cargar más</button>
        </div>
      )}
    </div>
  );
}
