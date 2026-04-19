const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'streaming.json');

const defaultData = () => ({
  users: [],
  settings: {},
  watchlist: [],
  _lastUserId: 0,
  _lastWatchlistId: 0,
});

let data = defaultData();

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
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

// Seed default settings
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
  console.log('Default admin created: admin@streamvault.com / admin123');
}
save();

const normalizeEmail = (e) => (e || '').toLowerCase().trim();

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
};
