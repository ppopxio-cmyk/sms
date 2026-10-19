import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { homeFor } from '../lib/roles';

export function ProtectedRoute() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const location = useLocation();

  if (status === 'loading') return null; // App shows the splash screen instead
  if (status === 'guest') return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  // An account created by an administrator starts with a temporary password. Until
  // its owner picks their own, nothing else opens.
  if (user?.mustChangePassword && location.pathname !== '/set-password') {
    return <Navigate to="/set-password" replace />;
  }

  return <Outlet />;
}

export function GuestRoute() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);

  if (status === 'loading') return null;
  if (status === 'ready') return <Navigate to={homeFor(user?.role)} replace />;
  return <Outlet />;
}

// Each role area lives under its own prefix. Somebody who opens another role's pages is
// sent to their own home rather than shown a "forbidden" screen.
export function RequireRole({ roles }) {
  const user = useAuth((s) => s.user);

  if (!user || !roles.includes(user.role)) return <Navigate to={homeFor(user?.role)} replace />;
  return <Outlet />;
}
