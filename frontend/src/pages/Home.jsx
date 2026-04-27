import React, { useEffect, useState } from 'react';
import HeroSlider from '../components/HeroSlider';
import ContentRow from '../components/ContentRow';
import api from '../lib/api';

export default function Home() {
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [trendingSeries, setTrendingSeries] = useState([]);
  const [popularMovies, setPopularMovies] = useState([]);
  const [popularSeries, setPopularSeries] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [nowPlaying, setNowPlaying] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [tm, ts, pm, ps, tr, np] = await Promise.all([
          api.get('/movies/trending'),
          api.get('/series/trending'),
          api.get('/movies/popular'),
          api.get('/series/popular'),
          api.get('/movies/top-rated'),
          api.get('/movies/now-playing'),
        ]);
        setTrendingMovies(tm.data.results || []);
        setTrendingSeries(ts.data.results || []);
        setPopularMovies(pm.data.results || []);
        setPopularSeries(ps.data.results || []);
        setTopRated(tr.data.results || []);
        setNowPlaying(np.data.results || []);
      } catch (e) {
        setError(e.response?.data?.error || 'Error cargando contenido. Verifica la API Key en el panel admin.');
      }
    };
    load();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card p-8 max-w-lg text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-white mb-2">Error de configuración</h2>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-0">
      <HeroSlider items={trendingMovies} type="movie" />
      <div className="mt-6">
        <ContentRow title="🔥 Tendencias — Películas" items={trendingMovies} type="movie" viewAllLink="/movies" />
        <ContentRow title="📺 Tendencias — Series" items={trendingSeries} type="series" viewAllLink="/series" />
        <ContentRow title="🎬 En Cines Ahora" items={nowPlaying} type="movie" />
        <ContentRow title="⭐ Mejor Valoradas" items={topRated} type="movie" />
        <ContentRow title="🔥 Series Populares" items={popularSeries} type="series" viewAllLink="/series" />
        <ContentRow title="🎭 Películas Populares" items={popularMovies} type="movie" viewAllLink="/movies" />
      </div>
    </div>
  );
}
