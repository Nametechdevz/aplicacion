import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import MovieCard from '../components/MovieCard';
import api from '../lib/api';

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [input, setInput] = useState(query);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!query) return;
    const search = async () => {
      setLoading(true);
      setSearched(true);
      try {
        const res = await api.get('/search', { params: { q: query, type: 'multi' } });
        setResults((res.data.results || []).filter(r => r.media_type !== 'person' && (r.poster_path || r.backdrop_path)));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    search();
  }, [query]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim()) setSearchParams({ q: input.trim() });
  };

  return (
    <div className="pt-24 px-4 md:px-8 pb-12">
      <div className="max-w-2xl mx-auto mb-10">
        <h1 className="text-3xl font-black text-white mb-6 text-center">Buscar contenido</h1>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Buscar películas, series..."
            className="input-field flex-1"
          />
          <button type="submit" className="btn-primary px-6">
            <SearchIcon size={18} />
            Buscar
          </button>
        </form>
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🔍</div>
          <p className="text-gray-400 text-lg">No se encontraron resultados para <span className="text-white font-semibold">"{query}"</span></p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <p className="text-gray-400 mb-6">{results.length} resultados para <span className="text-white font-semibold">"{query}"</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {results.map(item => (
              <MovieCard
                key={`${item.id}-${item.media_type}`}
                item={item}
                type={item.media_type === 'movie' ? 'movie' : 'series'}
              />
            ))}
          </div>
        </>
      )}

      {!searched && (
        <div className="text-center py-20">
          <div className="text-7xl mb-4">🎬</div>
          <p className="text-gray-500 text-lg">Escribe algo para buscar películas y series</p>
        </div>
      )}
    </div>
  );
}
