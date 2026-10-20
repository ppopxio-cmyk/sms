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
// Public pages: they must open for anyone, including a reviewer or a visitor who is
// not signed in, so they sit outside both the guest and the protected groups.
import Privacy from './pages/Privacy.jsx';
import Terms from './pages/Terms.jsx';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const Sessions = lazy(() => import('./pages/Sessions.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const AdminSessions = lazy(() => import('./pages/AdminSessions.jsx'));
const AuditLogs = lazy(() => import('./pages/AuditLogs.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const Me = lazy(() => import('./pages/Me.jsx'));
const AdminAnnouncements = lazy(() => import('./pages/AdminAnnouncements.jsx'));
const AdminSettings = lazy(() => import('./pages/AdminSettings.jsx'));
const AdminExportCenter = lazy(() => import('./pages/AdminExportCenter.jsx'));
const AdminAccount = lazy(() => import('./pages/AdminAccount.jsx'));
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

        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            {/* The same pages for every role: the person, not the job. */}
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/me" element={<Me />} />
            <Route path="/me/devices" element={<Sessions />} />

            <Route element={<RequireRole roles={['ADMIN']} />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<Users />} />
              <Route path="/admin/sessions" element={<AdminSessions />} />
              <Route path="/admin/audit-logs" element={<AuditLogs />} />
              <Route path="/admin/audit" element={<Navigate to="/admin/audit-logs" replace />} />
              <Route path="/admin/announcements" element={<AdminAnnouncements />} />
              <Route path="/admin/notifications" element={<Notifications />} />
              <Route path="/admin/export" element={<AdminExportCenter />} />
              <Route path="/admin/exports" element={<Navigate to="/admin/export" replace />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
              <Route path="/admin/system-settings" element={<Navigate to="/admin/settings" replace />} />
              <Route path="/admin/account" element={<AdminAccount />} />
              <Route path="/admin/my-account" element={<Navigate to="/admin/account" replace />} />
              <Route path="/admin/devices" element={<Sessions />} />
              <Route path="/admin/my-devices" element={<Navigate to="/admin/devices" replace />} />
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
