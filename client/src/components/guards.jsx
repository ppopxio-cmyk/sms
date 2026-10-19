import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { homeFor } from '../lib/roles';

export function ProtectedRoute() {
  const status = useAuth((s) => s.status);

  if (status === 'loading') return null; // App shows the splash screen instead
  if (status === 'guest') return <GuestRedirect />;

  return <Outlet />;
}

// Kept separate so the location is only read when somebody actually has to be sent away.
function GuestRedirect() {
  const location = useLocation();
  return <Navigate to="/login" replace state={{ from: location.pathname }} />;
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
