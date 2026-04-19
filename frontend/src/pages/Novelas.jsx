import React, { useState, useEffect } from 'react';
import MovieCard from '../components/MovieCard';
import api from '../lib/api';
import { Heart } from 'lucide-react';

// TMDB genre IDs for soap operas / telenovelas
// 10766 = Soap (telenovelas)
// 18 = Drama
// Combine both for best coverage

const CATEGORIES = [
  { label: 'Telenovelas', genreId: 10766 },
  { label: 'Drama', genreId: 18 },
  { label: 'Tendencias Drama', endpoint: '/series/trending', filter: 18 },
];

export default function Novelas() {
  const [category, setCategory] = useState(0);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setItems([]);
    setPage(1);
  }, [category]);

  useEffect(() => {
    if (search) return;
    const load = async () => {
      setLoading(true);
      try {
        const cat = CATEGORIES[category];
        let res;
        if (cat.endpoint) {
          res = await api.get(cat.endpoint, { params: { page } });
          const filtered = (res.data.results || []).filter(i =>
            i.genre_ids?.includes(cat.filter)
          );
          setItems(prev => page === 1 ? filtered : [...prev, ...filtered]);
        } else {
          res = await api.get(`/series/genre/${cat.genreId}`, { params: { page, sort_by: 'popularity.desc' } });
          setItems(prev => page === 1 ? res.data.results : [...prev, ...res.data.results]);
        }
        setTotalPages(res.data.total_pages || 1);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [category, page, search]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    try {
      const res = await api.get('/search', { params: { q: search, type: 'tv' } });
      setSearchResults(res.data.results || []);
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  };

  const displayItems = search ? searchResults : items;

  return (
    <div className="pt-20 px-4 md:px-8 pb-12">
      <div className="flex items-center gap-3 mb-6">
        <Heart size={28} className="text-pink-500" />
        <h1 className="text-3xl font-black text-white">Novelas & Telenovelas</h1>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-6 max-w-md">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar novela o serie..."
          className="input-field flex-1"
        />
        {search && (
          <button type="button" onClick={() => { setSearch(''); setSearchResults([]); }} className="px-4 py-2 bg-gray-800 rounded-lg text-gray-300 hover:bg-gray-700 transition-colors text-sm">
            ✕
          </button>
        )}
        <button type="submit" className="btn-primary">Buscar</button>
      </form>

      {/* Category tabs */}
      {!search && (
        <div className="flex flex-wrap gap-3 mb-6">
          {CATEGORIES.map((c, i) => (
            <button
              key={i}
              onClick={() => setCategory(i)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${category === i ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Info */}
      {!search && (
        <div className="glass-card p-4 mb-6 flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div>
            <p className="text-white text-sm font-semibold">¿Cómo buscar novelas específicas?</p>
            <p className="text-gray-400 text-xs mt-1">
              Usa la búsqueda para encontrar novelas por nombre exacto — ej: "Betty la fea", "Pasión de Gavilanes", "La reina del sur", "El señor de los cielos".
              TMDB tiene miles de telenovelas latinoamericanas catalogadas.
            </p>
          </div>
        </div>
      )}

      {/* Grid */}
      {searching ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {displayItems.map(item => (
            <MovieCard key={item.id} item={item} type="series" />
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center mt-8">
          <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && !search && page < Math.min(totalPages, 10) && (
        <div className="flex justify-center mt-8">
          <button onClick={() => setPage(p => p + 1)} className="bg-pink-600 hover:bg-pink-700 text-white font-semibold px-8 py-2.5 rounded-lg transition-colors">
            Cargar más
          </button>
        </div>
      )}
    </div>
  );
}
