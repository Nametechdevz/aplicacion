import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const TMDB_IMAGE = 'https://image.tmdb.org/t/p';
export const posterUrl = (path, size = 'w500') => path ? `${TMDB_IMAGE}/${size}${path}` : '/no-poster.png';
export const backdropUrl = (path, size = 'w1280') => path ? `${TMDB_IMAGE}/${size}${path}` : '';

export default api;
