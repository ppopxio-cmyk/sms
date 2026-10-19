import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';

export function ProtectedRoute() {
  const status = useAuth((s) => s.status);
  const location = useLocation();

  if (status === 'loading') return null; // App shows the splash screen instead
  if (status === 'guest') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function GuestRoute() {
  const status = useAuth((s) => s.status);

  if (status === 'loading') return null;
  if (status === 'ready') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function RequireRole({ roles }) {
  const user = useAuth((s) => s.user);

  if (!user || !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
