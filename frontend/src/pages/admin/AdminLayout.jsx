import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Settings, LogOut, Menu, ChevronRight, Tv, CreditCard, Star, EyeOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const navGroups = [
  {
    label: 'General',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { to: '/admin/users', label: 'Usuarios', icon: Users },
    ],
  },
  {
    label: 'IPTV',
    items: [
      { to: '/admin/providers', label: 'Proveedores', icon: Tv },
      { to: '/admin/channels',  label: 'Visibilidad', icon: EyeOff },
    ],
  },
  {
    label: 'Suscripciones',
    items: [
      { to: '/admin/plans', label: 'Planes', icon: Star },
      { to: '/admin/subscriptions', label: 'Suscripciones', icon: CreditCard },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/admin/settings', label: 'Configuración', icon: Settings },
    ],
  },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (item) =>
    item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);


  const handleLogout = () => { logout(); navigate('/login'); };

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-gray-800">
        <Link to="/" className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-sm">SV</span>
          </div>
          <span className="text-white font-black text-lg">StreamVault</span>
        </Link>
        <p className="text-gray-500 text-xs">Panel de Administración</p>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto space-y-4">
        {navGroups.map(group => (
          <div key={group.label}>
            <p className="text-gray-600 text-xs font-semibold uppercase tracking-wider px-3 mb-1">{group.label}</p>
            {group.items.map(item => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? 'bg-accent text-white shadow-lg shadow-accent/30' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                >
                  <Icon size={17} />
                  <span className="flex-1">{item.label}</span>
                  {active && <ChevronRight size={13} />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">{user?.name?.[0]?.toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate">{user?.name}</p>
            <p className="text-gray-500 text-xs truncate">{user?.email}</p>
          </div>
        </div>
        <Link to="/" className="flex items-center gap-2 text-gray-400 hover:text-white text-sm px-2 py-2 rounded-lg hover:bg-gray-800 transition-colors mb-1">
          ← Volver al sitio
        </Link>
        <button onClick={handleLogout} className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm px-2 py-2 rounded-lg hover:bg-gray-800 transition-colors w-full">
          <LogOut size={16} />Cerrar Sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-gray-900 border-r border-gray-800 fixed top-0 left-0 bottom-0 z-30">
        <Sidebar />
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed top-0 left-0 bottom-0 w-64 bg-gray-900 border-r border-gray-800 z-50 flex flex-col lg:hidden">
            <Sidebar />
          </aside>
        </>
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <div className="lg:hidden bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white p-1">
            <Menu size={22} />
          </button>
          <span className="text-white font-bold">Panel Admin</span>
        </div>

        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
