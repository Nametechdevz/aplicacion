import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MovieCard from './MovieCard';
import { Link } from 'react-router-dom';

export default function ContentRow({ title, items = [], type = 'movie', viewAllLink }) {
  const rowRef = useRef(null);

  const scroll = (dir) => {
    const el = rowRef.current;
    if (el) el.scrollBy({ left: dir * 300, behavior: 'smooth' });
  };

  if (!items.length) return null;

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4 px-4 md:px-8">
        <h2 className="section-title">{title}</h2>
        {viewAllLink && (
          <Link to={viewAllLink} className="text-accent-light hover:text-white text-sm font-medium transition-colors">
            Ver todo →
          </Link>
        )}
      </div>
      <div className="relative group">
        <button
          onClick={() => scroll(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/80 hover:bg-black text-white p-2 rounded-r-xl opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
        >
          <ChevronLeft size={24} />
        </button>
        <div
          ref={rowRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide px-4 md:px-8 pb-2"
        >
          {items.map(item => (
            <div key={item.id} className="flex-shrink-0 w-36 sm:w-44">
              <MovieCard item={item} type={type} />
            </div>
          ))}
        </div>
        <button
          onClick={() => scroll(1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/80 hover:bg-black text-white p-2 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
        >
          <ChevronRight size={24} />
        </button>
      </div>
    </section>
  );
}
