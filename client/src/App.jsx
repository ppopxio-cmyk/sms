import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store/auth';
import { GuestRoute, ProtectedRoute, RequireRole } from './components/guards';
import AppShell from './components/layout/AppShell';
import SplashScreen from './components/layout/SplashScreen';
import { SkeletonPage } from './components/ui/Skeleton';

// The first screens stay eager so they appear instantly. Everything behind the
// login — including anything chart-heavy later — is split out of the first
// download.
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Sessions = lazy(() => import('./pages/Sessions.jsx'));
const AdminSessions = lazy(() => import('./pages/AdminSessions.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

export default function App() {
  const status = useAuth((s) => s.status);
  const bootstrap = useAuth((s) => s.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (status === 'loading') return <SplashScreen />;

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <SkeletonPage cards={3} />
        </div>
      }
    >
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route element={<RequireRole roles={['ADMIN']} />}>
              <Route path="/admin/sessions" element={<AdminSessions />} />
            </Route>
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
