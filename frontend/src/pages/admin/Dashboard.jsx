import React, { useState, useEffect } from 'react';
import { Users, UserCheck, Shield, TrendingUp, CreditCard, Star, Tv, Link as LinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';

const StatCard = ({ icon: Icon, label, value, color, to }) => {
  const inner = (
    <div className="glass-card p-6 hover:border-gray-700 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <span className="text-gray-400 text-sm font-medium">{label}</span>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
      <p className="text-3xl font-black text-white">{value ?? '—'}</p>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/stats').then(r => { setStats(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">Resumen de la plataforma</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <StatCard icon={Users}      label="Total Usuarios"     value={stats?.totalUsers}          color="bg-blue-600"    to="/admin/users" />
        <StatCard icon={UserCheck}  label="Activos"            value={stats?.activeUsers}         color="bg-green-600"   to="/admin/users" />
        <StatCard icon={Shield}     label="Admins"             value={stats?.adminUsers}          color="bg-accent"      to="/admin/users" />
        <StatCard icon={CreditCard} label="Suscripciones"      value={stats?.activeSubscriptions} color="bg-emerald-600" to="/admin/subscriptions" />
        <StatCard icon={Star}       label="Planes Activos"     value={stats?.totalPlans}          color="bg-amber-500"   to="/admin/plans" />
        <StatCard icon={Tv}         label="Proveedores IPTV"   value={stats?.totalProviders}      color="bg-red-600"     to="/admin/providers" />
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <TrendingUp size={20} className="text-accent" />
            Usuarios Recientes
          </h2>
          <Link to="/admin/users" className="text-accent-light hover:text-white text-sm font-medium transition-colors">
            Ver todos →
          </Link>
        </div>

        {stats?.recentUsers?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider pb-3">Usuario</th>
                  <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider pb-3 hidden sm:table-cell">Email</th>
                  <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider pb-3">Rol</th>
                  <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider pb-3 hidden md:table-cell">Registrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {stats.recentUsers.map(u => (
                  <tr key={u.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-xs">{u.name?.[0]?.toUpperCase()}</span>
                        </div>
                        <span className="text-white text-sm font-medium">{u.name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-gray-400 text-sm hidden sm:table-cell">{u.email}</td>
                    <td className="py-3">
                      <span className={`badge ${u.role === 'admin' ? 'bg-accent/20 text-accent-light' : 'bg-gray-700 text-gray-300'}`}>
                        {u.role === 'admin' ? 'Admin' : 'Usuario'}
                      </span>
                    </td>
                    <td className="py-3 text-gray-400 text-xs hidden md:table-cell">
                      {new Date(u.created_at).toLocaleDateString('es-ES')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No hay usuarios registrados</p>
        )}
      </div>
    </div>
  );
}
