# StreamVault — Plataforma de Streaming

## Requisitos
- Node.js 18+
- API Key gratuita de TMDB (themoviedb.org)

## Instalación rápida

```bash
# 1. Instalar dependencias
cd backend && npm install
cd ../frontend && npm install

# 2. Configurar variables del backend
# Edita backend/.env y pon tu API Key de TMDB:
#   TMDB_API_KEY=tu_api_key_aqui

# 3. Iniciar en desarrollo (dos terminales)
# Terminal 1:
cd backend && npm run dev

# Terminal 2:
cd frontend && npm run dev
```

## Producción

```bash
cd frontend && npm run build
cd ../backend && npm start
# El servidor sirve el frontend en http://localhost:3001
```

## Acceso por defecto

| Campo | Valor |
|-------|-------|
| Admin email | admin@streamvault.com |
| Admin password | admin123 |

## Características

### Para usuarios
- Explorar películas y series (TMDB)
- Hero slider con tendencias
- Filtrar por categoría y género
- Buscar películas y series
- Ver detalles, reparto, similares
- Reproductor con 4 servidores de embed
- Selector de temporada/episodio para series
- Lista personal (watchlist)

### Panel Admin (/admin)
- Dashboard con estadísticas
- Gestión completa de usuarios (crear, editar, eliminar, activar/desactivar)
- Configuración: nombre del sitio, API Key de TMDB, color de acento
- Habilitar/deshabilitar registro público

## Estructura

```
aplicacion/
├── backend/           Express API + SQLite
│   ├── routes/        auth, tmdb, admin
│   ├── middleware/    JWT auth
│   ├── database.js    SQLite setup
│   └── server.js
└── frontend/          React + Vite + TailwindCSS
    └── src/
        ├── pages/     Home, Movies, Series, Search, Detail, Watch
        ├── pages/admin/  Dashboard, Users, Settings
        └── components/   Navbar, HeroSlider, MovieCard, ContentRow
```
