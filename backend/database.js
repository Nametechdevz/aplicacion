const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'streaming.json');

const defaultData = () => ({
  users: [],
  settings: {},
  watchlist: [],
  iptv_providers: [],
  plans: [],
  subscriptions: [],
  _lastUserId: 0,
  _lastWatchlistId: 0,
  _lastProviderId: 0,
  _lastPlanId: 0,
  _lastSubscriptionId: 0,
});

let data = defaultData();

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const loaded = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      data = { ...defaultData(), ...loaded };
    }
  } catch (e) {
    console.error('Error loading DB, recreating:', e.message);
    data = defaultData();
  }
}

function save() {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

load();

// Seed default settings (xtream_* removed — now managed as providers)
const defaults = {
  site_name: process.env.SITE_NAME || 'StreamVault',
  tmdb_api_key: process.env.TMDB_API_KEY || '',
  allow_register: 'true',
  featured_movie: '',
  accent_color: '#7c3aed',
};
for (const [key, value] of Object.entries(defaults)) {
  if (!(key in data.settings)) data.settings[key] = value;
}

// Migrate legacy xtream_* settings to the providers table
if (data.settings.xtream_url && data.iptv_providers.length === 0) {
  data._lastProviderId++;
  data.iptv_providers.push({
    id: data._lastProviderId,
    name: 'Proveedor Principal',
    url: (data.settings.xtream_url || '').replace(/\/$/, ''),
    username: data.settings.xtream_user || '',
    password: data.settings.xtream_pass || '',
    active: true,
    hidden_live_categories: [],
    hidden_live_channels: [],
    hidden_vod_categories: [],
    hidden_series_categories: [],
    created_at: new Date().toISOString(),
  });
  delete data.settings.xtream_url;
  delete data.settings.xtream_user;
  delete data.settings.xtream_pass;
  console.log('[DB] Migrated legacy IPTV settings to providers table');
}

// Backfill hidden_* lists on existing providers
for (const p of data.iptv_providers) {
  if (!Array.isArray(p.hidden_live_categories))   p.hidden_live_categories = [];
  if (!Array.isArray(p.hidden_live_channels))     p.hidden_live_channels = [];
  if (!Array.isArray(p.hidden_vod_categories))    p.hidden_vod_categories = [];
  if (!Array.isArray(p.hidden_series_categories)) p.hidden_series_categories = [];
}

// Seed default plans
if (data.plans.length === 0) {
  const defaultPlans = [
    {
      name: 'Gratuito',
      description: 'Acceso básico a catálogo de películas y series',
      price: 0,
      duration_days: 0,
      color: '#6b7280',
      features: { iptv: false, hd: false, max_devices: 1, watchlist_limit: 10 },
      active: true,
    },
    {
      name: 'Básico',
      description: 'TV en Vivo + catálogo completo en SD',
      price: 4.99,
      duration_days: 30,
      color: '#3b82f6',
      features: { iptv: true, hd: false, max_devices: 1, watchlist_limit: 50 },
      active: true,
    },
    {
      name: 'Premium',
      description: 'TV en Vivo en HD + 2 dispositivos simultáneos',
      price: 9.99,
      duration_days: 30,
      color: '#7c3aed',
      features: { iptv: true, hd: true, max_devices: 2, watchlist_limit: 0 },
      active: true,
    },
    {
      name: 'VIP',
      description: 'Todo incluido sin límites + soporte prioritario',
      price: 19.99,
      duration_days: 30,
      color: '#f59e0b',
      features: { iptv: true, hd: true, max_devices: 5, watchlist_limit: 0 },
      active: true,
    },
  ];
  for (const plan of defaultPlans) {
    data._lastPlanId++;
    data.plans.push({ id: data._lastPlanId, ...plan, created_at: new Date().toISOString() });
  }
  console.log('[DB] Default plans seeded');
}

// Seed default admin
if (!data.users.some(u => u.role === 'admin')) {
  data._lastUserId++;
  data.users.push({
    id: data._lastUserId,
    name: 'Admin',
    email: 'admin@streamvault.com',
    password: bcrypt.hashSync('admin123', 10),
    role: 'admin',
    active: 1,
    created_at: new Date().toISOString(),
  });
  console.log('[DB] Default admin created: admin@streamvault.com / admin123');
}

save();

const normalizeEmail = (e) => (e || '').toLowerCase().trim();

const normalizePlanFeatures = (f = {}) => ({
  iptv: !!f.iptv,
  hd: !!f.hd,
  max_devices: Number(f.max_devices) || 1,
  watchlist_limit: Number(f.watchlist_limit) || 0,
});

module.exports = {
  users: {
    findById: (id) => data.users.find(u => u.id === Number(id)) || null,
    findByEmail: (email) => data.users.find(u => u.email === normalizeEmail(email)) || null,
    emailExists: (email, excludeId) =>
      data.users.some(u => u.email === normalizeEmail(email) && u.id !== Number(excludeId)),
    create: ({ name, email, password, role = 'user', active = 1 }) => {
      data._lastUserId++;
      const user = {
        id: data._lastUserId,
        name,
        email: normalizeEmail(email),
        password,
        role,
        active: active ? 1 : 0,
        created_at: new Date().toISOString(),
      };
      data.users.push(user);
      save();
      return user;
    },
    update: (id, updates) => {
      const user = data.users.find(u => u.id === Number(id));
      if (!user) return null;
      if (updates.email) updates.email = normalizeEmail(updates.email);
      if (updates.active !== undefined) updates.active = updates.active ? 1 : 0;
      Object.assign(user, updates);
      save();
      return user;
    },
    delete: (id) => {
      data.users = data.users.filter(u => u.id !== Number(id));
      data.watchlist = data.watchlist.filter(w => w.user_id !== Number(id));
      data.subscriptions = data.subscriptions.filter(s => s.user_id !== Number(id));
      save();
    },
    search: ({ query = '', page = 1, limit = 20 }) => {
      const q = query.toLowerCase();
      const filtered = data.users.filter(u =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
      const sorted = filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const paginated = sorted.slice((page - 1) * limit, page * limit);
      return {
        users: paginated.map(({ password, ...u }) => u),
        total: filtered.length,
        pages: Math.ceil(filtered.length / limit),
      };
    },
    count: (filter = {}) =>
      data.users.filter(u => {
        if (filter.active !== undefined && u.active !== filter.active) return false;
        if (filter.role && u.role !== filter.role) return false;
        return true;
      }).length,
    recent: (limit = 5) =>
      [...data.users]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, limit)
        .map(({ password, ...u }) => u),
  },

  settings: {
    get: (key) => data.settings[key],
    getAll: () => ({ ...data.settings }),
    setMany: (obj) => {
      for (const [k, v] of Object.entries(obj)) data.settings[k] = String(v);
      save();
    },
  },

  watchlist: {
    findByUser: (userId) =>
      data.watchlist
        .filter(w => w.user_id === Number(userId))
        .sort((a, b) => new Date(b.added_at) - new Date(a.added_at)),
    add: (userId, { tmdb_id, media_type, title, poster_path }) => {
      const exists = data.watchlist.find(
        w => w.user_id === Number(userId) && w.tmdb_id === Number(tmdb_id) && w.media_type === media_type
      );
      if (exists) return exists;
      data._lastWatchlistId++;
      const item = {
        id: data._lastWatchlistId,
        user_id: Number(userId),
        tmdb_id: Number(tmdb_id),
        media_type,
        title,
        poster_path,
        added_at: new Date().toISOString(),
      };
      data.watchlist.push(item);
      save();
      return item;
    },
    remove: (userId, tmdbId, mediaType) => {
      data.watchlist = data.watchlist.filter(
        w => !(w.user_id === Number(userId) && w.tmdb_id === Number(tmdbId) && w.media_type === mediaType)
      );
      save();
    },
  },

  providers: {
    getAll: () => [...data.iptv_providers],
    getActive: () => data.iptv_providers.filter(p => p.active),
    findById: (id) => data.iptv_providers.find(p => p.id === Number(id)) || null,
    create: ({ name, url, username = '', password = '', active = true }) => {
      data._lastProviderId++;
      const provider = {
        id: data._lastProviderId,
        name: name || 'Proveedor IPTV',
        url: (url || '').replace(/\/$/, ''),
        username,
        password,
        active: !!active,
        hidden_live_categories: [],
        hidden_live_channels: [],
        hidden_vod_categories: [],
        hidden_series_categories: [],
        created_at: new Date().toISOString(),
      };
      data.iptv_providers.push(provider);
      save();
      return provider;
    },
    update: (id, updates) => {
      const provider = data.iptv_providers.find(p => p.id === Number(id));
      if (!provider) return null;
      if (updates.url) updates.url = (updates.url || '').replace(/\/$/, '');
      if (updates.active !== undefined) updates.active = !!updates.active;
      Object.assign(provider, updates);
      save();
      return provider;
    },
    delete: (id) => {
      data.iptv_providers = data.iptv_providers.filter(p => p.id !== Number(id));
      save();
    },
    // Visibility helpers — all IDs stored as strings for consistent comparison
    setHidden: (id, field, list) => {
      const allowed = ['hidden_live_categories', 'hidden_live_channels', 'hidden_vod_categories', 'hidden_series_categories'];
      if (!allowed.includes(field)) return null;
      const provider = data.iptv_providers.find(p => p.id === Number(id));
      if (!provider) return null;
      provider[field] = Array.from(new Set((list || []).map(String)));
      save();
      return provider;
    },
    toggleHidden: (id, field, value) => {
      const allowed = ['hidden_live_categories', 'hidden_live_channels', 'hidden_vod_categories', 'hidden_series_categories'];
      if (!allowed.includes(field)) return null;
      const provider = data.iptv_providers.find(p => p.id === Number(id));
      if (!provider) return null;
      const v = String(value);
      const set = new Set((provider[field] || []).map(String));
      if (set.has(v)) set.delete(v); else set.add(v);
      provider[field] = Array.from(set);
      save();
      return provider;
    },
  },

  plans: {
    getAll: () => [...data.plans],
    getActive: () => data.plans.filter(p => p.active),
    findById: (id) => data.plans.find(p => p.id === Number(id)) || null,
    create: ({ name, description = '', price = 0, duration_days = 30, color = '#7c3aed', features = {}, active = true }) => {
      data._lastPlanId++;
      const plan = {
        id: data._lastPlanId,
        name,
        description,
        price: Number(price),
        duration_days: Number(duration_days),
        color,
        features: normalizePlanFeatures(features),
        active: !!active,
        created_at: new Date().toISOString(),
      };
      data.plans.push(plan);
      save();
      return plan;
    },
    update: (id, updates) => {
      const plan = data.plans.find(p => p.id === Number(id));
      if (!plan) return null;
      if (updates.price !== undefined) updates.price = Number(updates.price);
      if (updates.duration_days !== undefined) updates.duration_days = Number(updates.duration_days);
      if (updates.active !== undefined) updates.active = !!updates.active;
      if (updates.features) updates.features = normalizePlanFeatures(updates.features);
      Object.assign(plan, updates);
      save();
      return plan;
    },
    delete: (id) => {
      data.plans = data.plans.filter(p => p.id !== Number(id));
      save();
    },
  },

  subscriptions: {
    getAll: () => {
      const now = new Date();
      return data.subscriptions.map(s => ({
        ...s,
        status: !s.expires_at || new Date(s.expires_at) > now ? 'active' : 'expired',
      }));
    },
    findByUser: (userId) => {
      const now = new Date();
      return data.subscriptions
        .filter(s => s.user_id === Number(userId))
        .map(s => ({ ...s, status: !s.expires_at || new Date(s.expires_at) > now ? 'active' : 'expired' }));
    },
    findActive: (userId) => {
      const now = new Date();
      return data.subscriptions.find(s =>
        s.user_id === Number(userId) &&
        (!s.expires_at || new Date(s.expires_at) > now)
      ) || null;
    },
    findById: (id) => data.subscriptions.find(s => s.id === Number(id)) || null,
    create: ({ user_id, plan_id, starts_at, expires_at = null, notes = '' }) => {
      data._lastSubscriptionId++;
      const sub = {
        id: data._lastSubscriptionId,
        user_id: Number(user_id),
        plan_id: Number(plan_id),
        starts_at: starts_at || new Date().toISOString(),
        expires_at: expires_at || null,
        notes,
        created_at: new Date().toISOString(),
      };
      data.subscriptions.push(sub);
      save();
      return sub;
    },
    update: (id, updates) => {
      const sub = data.subscriptions.find(s => s.id === Number(id));
      if (!sub) return null;
      Object.assign(sub, updates);
      save();
      return sub;
    },
    delete: (id) => {
      data.subscriptions = data.subscriptions.filter(s => s.id !== Number(id));
      save();
    },
    countActive: () => {
      const now = new Date();
      return data.subscriptions.filter(s => !s.expires_at || new Date(s.expires_at) > now).length;
    },
  },
};
