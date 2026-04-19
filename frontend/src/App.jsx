import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import InstallPWA from './components/InstallPWA';
import Home from './pages/Home';
import Movies from './pages/Movies';
import Series from './pages/Series';
import Search from './pages/Search';
import MovieDetail from './pages/MovieDetail';
import SeriesDetail from './pages/SeriesDetail';
import Watch from './pages/Watch';
import Login from './pages/Login';
import Register from './pages/Register';
import Watchlist from './pages/Watchlist';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Users from './pages/admin/Users';
import Settings from './pages/admin/Settings';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>;
  return user ? children : <Navigate to="/login" replace />;
};

const AdminRoute = ({ children }) => {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
};

const Spinner = () => (
  <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
);

const Layout = ({ children }) => (
  <>
    <Navbar />
    <main className="min-h-screen">{children}</main>
  </>
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <InstallPWA />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<Layout><Home /></Layout>} />
          <Route path="/movies" element={<Layout><Movies /></Layout>} />
          <Route path="/series" element={<Layout><Series /></Layout>} />
          <Route path="/search" element={<Layout><Search /></Layout>} />
          <Route path="/movie/:id" element={<Layout><MovieDetail /></Layout>} />
          <Route path="/series/:id" element={<Layout><SeriesDetail /></Layout>} />
          <Route path="/watch/:type/:id" element={<PrivateRoute><Watch /></PrivateRoute>} />
          <Route path="/watchlist" element={<PrivateRoute><Layout><Watchlist /></Layout></PrivateRoute>} />
          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="users" element={<Users />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
