import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store/auth';
import { homeFor } from './lib/roles';
import { GuestRoute, ProtectedRoute, RequireRole } from './components/guards';
import AppShell from './components/layout/AppShell';
import SplashScreen from './components/layout/SplashScreen';
import { SkeletonPage } from './components/ui/Skeleton';

// The first screens stay eager so they appear instantly. Everything behind the
// login — including anything chart-heavy later — is split out of the first
// download.
import Login from './pages/Login.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Sessions = lazy(() => import('./pages/Sessions.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const AdminSessions = lazy(() => import('./pages/AdminSessions.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const Me = lazy(() => import('./pages/Me.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

// The roles whose own area exists so far. ADMIN has the real screens; the rest land on
// their dashboard under their own prefix, ready for their tools.
const OTHER_ROLES = ['REGISTRAR', 'TEACHER', 'ACCOUNTANT'];

function Home() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);

  if (status === 'loading') return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homeFor(user.role)} replace />;
}

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
        {/* There is no sign-up page on purpose: an administrator creates every account. */}
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>

        {/* Opened from an email, often on a device that is not signed in, so this one
            is public. Without a token it sends the visitor to the sign-in page. */}
        <Route path="/verify-email" element={<VerifyEmail />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            {/* The same pages for every role: the person, not the job. */}
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/me" element={<Me />} />
            <Route path="/me/devices" element={<Sessions />} />

            <Route element={<RequireRole roles={['ADMIN']} />}>
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/users" element={<Users />} />
              <Route path="/admin/sessions" element={<AdminSessions />} />
            </Route>

            {OTHER_ROLES.map((role) => (
              <Route key={role} element={<RequireRole roles={[role]} />}>
                <Route path={`/${role.toLowerCase()}`} element={<Dashboard />} />
              </Route>
            ))}
          </Route>
        </Route>

        <Route path="/" element={<Home />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
