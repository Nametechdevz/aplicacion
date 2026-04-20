import React, { useState, useEffect } from 'react';
import { Save, Eye, EyeOff, CheckCircle, Wifi } from 'lucide-react';
import api from '../../lib/api';

export default function Settings() {
  const [settings, setSettings] = useState({
    site_name: '',
    tmdb_api_key: '',
    allow_register: 'true',
    accent_color: '#7c3aed',
    xtream_url: '',
    xtream_user: '',
    xtream_pass: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showXPass, setShowXPass] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testingIptv, setTestingIptv] = useState(false);
  const [iptvResult, setIptvResult] = useState(null);

  useEffect(() => {
    api.get('/admin/settings').then(r => { setSettings(s => ({ ...s, ...r.data })); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    try {
      await api.put('/admin/settings', settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError('Error al guardar configuración'); }
    finally { setSaving(false); }
  };

  const testTmdb = async () => {
    setTesting(true); setTestResult(null);
    try {
      await api.put('/admin/settings', { tmdb_api_key: settings.tmdb_api_key });
      const res = await api.get('/movies/popular');
      setTestResult({ ok: true, msg: `✓ API Key válida. ${res.data.results?.length || 0} películas encontradas.` });
    } catch (e) {
      setTestResult({ ok: false, msg: e.response?.data?.error || 'API Key inválida' });
    } finally { setTesting(false); }
  };

  const testIptv = async () => {
    setTestingIptv(true); setIptvResult(null);
    try {
      await api.put('/admin/settings', {
        xtream_url: settings.xtream_url,
        xtream_user: settings.xtream_user,
        xtream_pass: settings.xtream_pass,
      });
      const res = await api.get('/iptv/test');
      setIptvResult({ ok: true, msg: `✓ Conexión exitosa. ${res.data.categories} categorías encontradas.` });
    } catch (e) {
      setIptvResult({ ok: false, msg: e.response?.data?.error || 'Error de conexión IPTV' });
    } finally { setTestingIptv(false); }
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white">Configuración</h1>
        <p className="text-gray-400 mt-1">Gestiona la configuración de la plataforma</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* General */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-bold text-white mb-5 pb-3 border-b border-gray-800">General</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Nombre del sitio</label>
              <input className="input-field" value={settings.site_name} onChange={e => setSettings({ ...settings, site_name: e.target.value })} placeholder="StreamVault" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Color de acento</label>
              <div className="flex items-center gap-3">
                <input type="color" value={settings.accent_color} onChange={e => setSettings({ ...settings, accent_color: e.target.value })} className="w-12 h-10 rounded-lg border border-gray-700 bg-gray-800 cursor-pointer" />
                <input className="input-field flex-1" value={settings.accent_color} onChange={e => setSettings({ ...settings, accent_color: e.target.value })} placeholder="#7c3aed" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Registro de usuarios</label>
              <div className="flex gap-3">
                {[['true', 'Habilitado ✓'], ['false', 'Deshabilitado ✗']].map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setSettings({ ...settings, allow_register: val })}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all border ${settings.allow_register === val ? (val === 'true' ? 'bg-green-700/30 border-green-600 text-green-300' : 'bg-red-700/30 border-red-600 text-red-300') : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* TMDB */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-bold text-white mb-1">API de TMDB</h2>
          <p className="text-gray-500 text-sm mb-5 pb-3 border-b border-gray-800">
            Obtén tu API Key gratis en{' '}
            <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="text-accent-light hover:underline">themoviedb.org</a>
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">TMDB API Key (v3)</label>
            <div className="relative">
              <input type={showKey ? 'text' : 'password'} className="input-field pr-10" value={settings.tmdb_api_key} onChange={e => setSettings({ ...settings, tmdb_api_key: e.target.value })} placeholder="Tu API Key de TMDB" />
              <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1">
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button type="button" onClick={testTmdb} disabled={testing} className="mt-3 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm rounded-lg transition-colors flex items-center gap-2">
              {testing ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : '🔌'} Probar conexión
            </button>
            {testResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${testResult.ok ? 'bg-green-900/30 text-green-300 border border-green-800' : 'bg-red-900/30 text-red-300 border border-red-800'}`}>
                {testResult.msg}
              </div>
            )}
          </div>
        </div>

        {/* IPTV Xtream */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-1">
            <Wifi size={20} className="text-red-400" />
            <h2 className="text-lg font-bold text-white">IPTV — Xtream Codes</h2>
          </div>
          <p className="text-gray-500 text-sm mb-5 pb-3 border-b border-gray-800">
            Configura tu servidor IPTV para activar la sección <strong className="text-gray-300">TV en Vivo</strong>
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">URL del servidor</label>
              <input
                className="input-field"
                value={settings.xtream_url}
                onChange={e => setSettings({ ...settings, xtream_url: e.target.value })}
                placeholder="http://servidor.com:8080"
              />
              <p className="text-gray-600 text-xs mt-1">Incluye http:// y el puerto si aplica</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Usuario</label>
                <input
                  className="input-field"
                  value={settings.xtream_user}
                  onChange={e => setSettings({ ...settings, xtream_user: e.target.value })}
                  placeholder="usuario"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Contraseña</label>
                <div className="relative">
                  <input
                    type={showXPass ? 'text' : 'password'}
                    className="input-field pr-10"
                    value={settings.xtream_pass}
                    onChange={e => setSettings({ ...settings, xtream_pass: e.target.value })}
                    placeholder="••••••••"
                    autoComplete="off"
                  />
                  <button type="button" onClick={() => setShowXPass(!showXPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1">
                    {showXPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
            <button type="button" onClick={testIptv} disabled={testingIptv} className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-300 hover:text-red-200 border border-red-800/50 text-sm rounded-lg transition-colors flex items-center gap-2">
              {testingIptv ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Wifi size={14} />}
              Probar conexión IPTV
            </button>
            {iptvResult && (
              <div className={`p-3 rounded-lg text-sm ${iptvResult.ok ? 'bg-green-900/30 text-green-300 border border-green-800' : 'bg-red-900/30 text-red-300 border border-red-800'}`}>
                {iptvResult.msg}
              </div>
            )}
          </div>
        </div>

        {error && <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-lg p-3 text-sm">{error}</div>}
        {saved && (
          <div className="bg-green-900/30 border border-green-800 text-green-300 rounded-lg p-3 text-sm flex items-center gap-2">
            <CheckCircle size={16} />Configuración guardada exitosamente
          </div>
        )}

        <button type="submit" disabled={saving} className="btn-primary w-full justify-center py-3">
          {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Save size={18} />Guardar Todo</>}
        </button>
      </form>
    </div>
  );
}
