import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, Menu, X, ChevronDown, User, LogOut, Settings, Shield, Bookmark } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setSearchOpen(false);
    }
  };

  const navLinks = [
    { to: '/', label: 'Inicio' },
    { to: '/movies', label: 'Películas' },
    { to: '/series', label: 'Series' },
    { to: '/novelas', label: '💕 Novelas' },
    { to: '/live', label: '📡 TV en Vivo' },
    { to: '/iptv/movies', label: '🎬 Pelis IPTV' },
    { to: '/iptv/series', label: '📺 Series IPTV' },
  ];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-gray-950/95 backdrop-blur-md shadow-lg shadow-black/50' : 'bg-gradient-to-b from-black/70 to-transparent'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-sm">SV</span>
            </div>
            <span className="text-white font-black text-xl hidden sm:block">StreamVault</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(l => (
              <Link
                key={l.to}
                to={l.to}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === l.to ? 'text-white bg-white/10' : 'text-gray-300 hover:text-white hover:bg-white/5'}`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              {searchOpen ? (
                <form onSubmit={handleSearch} className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Buscar..."
                    className="bg-gray-800/90 border border-gray-700 text-white placeholder-gray-400 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-accent w-56"
                  />
                  <button type="button" onClick={() => setSearchOpen(false)} className="text-gray-400 hover:text-white p-2">
                    <X size={18} />
                  </button>
                </form>
              ) : (
                <button onClick={() => setSearchOpen(true)} className="text-gray-300 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors">
                  <Search size={20} />
                </button>
              )}
            </div>

            {user ? (
              <>
                <Link to="/watchlist" className="hidden md:flex text-gray-300 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors" title="Mi Lista">
                  <Bookmark size={20} />
                </Link>
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 transition-colors"
                  >
                    <div className="w-7 h-7 bg-accent rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-xs">{user.name?.[0]?.toUpperCase()}</span>
                    </div>
                    <span className="text-white text-sm font-medium hidden sm:block max-w-24 truncate">{user.name}</span>
                    <ChevronDown size={14} className={`text-gray-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-52 glass-card shadow-xl shadow-black/50 py-1 z-50">
                      <div className="px-4 py-2 border-b border-gray-800">
                        <p className="text-white font-semibold text-sm truncate">{user.name}</p>
                        <p className="text-gray-400 text-xs truncate">{user.email}</p>
                        {isAdmin && <span className="badge bg-accent/20 text-accent-light mt-1 inline-block">Admin</span>}
                      </div>
                      {isAdmin && (
                        <Link to="/admin" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors">
                          <Shield size={16} />Panel Admin
                        </Link>
                      )}
                      <Link to="/watchlist" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors">
                        <Bookmark size={16} />Mi Lista
                      </Link>
                      <button onClick={() => { logout(); setUserMenuOpen(false); navigate('/login'); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors w-full">
                        <LogOut size={16} />Cerrar Sesión
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors">
                  Iniciar Sesión
                </Link>
                <Link to="/register" className="bg-accent hover:bg-accent-dark text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
                  Registrarse
                </Link>
              </div>
            )}

            {/* Mobile menu toggle */}
            <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden text-gray-300 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors">
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-gray-950/98 backdrop-blur-md border-t border-gray-800 px-4 py-3">
          {navLinks.map(l => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setMobileOpen(false)}
              className={`block px-4 py-3 rounded-lg text-sm font-medium mb-1 transition-colors ${location.pathname === l.to ? 'text-white bg-white/10' : 'text-gray-300 hover:text-white hover:bg-white/5'}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
