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
import Maintenance from './pages/Maintenance.jsx';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const AdminAnalytics = lazy(() => import('./pages/AdminAnalytics.jsx'));
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
const TeacherDashboard = lazy(() => import('./pages/teacher/TeacherDashboard.jsx'));
const TeacherClasses = lazy(() => import('./pages/teacher/TeacherClasses.jsx'));
const TeacherClass = lazy(() => import('./pages/teacher/TeacherClass.jsx'));
const TeacherStudents = lazy(() => import('./pages/teacher/TeacherStudents.jsx'));
const TeacherStudent = lazy(() => import('./pages/teacher/TeacherStudent.jsx'));
const TeacherAttendance = lazy(() => import('./pages/teacher/TeacherAttendance.jsx'));
const TeacherAttendanceMark = lazy(() => import('./pages/teacher/TeacherAttendanceMark.jsx'));
const TeacherAssessments = lazy(() => import('./pages/teacher/TeacherAssessments.jsx'));
const TeacherAssessment = lazy(() => import('./pages/teacher/TeacherAssessment.jsx'));
const TeacherMaterials = lazy(() => import('./pages/teacher/TeacherMaterials.jsx'));
const TeacherReports = lazy(() => import('./pages/teacher/TeacherReports.jsx'));
const RegistrarDashboard = lazy(() => import('./pages/registrar/RegistrarDashboard.jsx'));
const RegistrarStudents = lazy(() => import('./pages/registrar/RegistrarStudents.jsx'));
const RegistrarStudent = lazy(() => import('./pages/registrar/RegistrarStudent.jsx'));
const RegistrarEnrollments = lazy(() => import('./pages/registrar/RegistrarEnrollments.jsx'));
const RegistrarAcademicStructure = lazy(() => import('./pages/registrar/RegistrarAcademicStructure.jsx'));
const RegistrarCalendar = lazy(() => import('./pages/registrar/RegistrarCalendar.jsx'));
const RegistrarBatches = lazy(() => import('./pages/registrar/RegistrarBatches.jsx'));
const RegistrarCurriculum = lazy(() => import('./pages/registrar/RegistrarCurriculum.jsx'));
const RegistrarOfferings = lazy(() => import('./pages/registrar/RegistrarOfferings.jsx'));
const RegistrarCourseRegistration = lazy(() => import('./pages/registrar/RegistrarCourseRegistration.jsx'));
const RegistrarAttendance = lazy(() => import('./pages/registrar/RegistrarAttendance.jsx'));
const RegistrarResults = lazy(() => import('./pages/registrar/RegistrarResults.jsx'));
const RegistrarGpa = lazy(() => import('./pages/registrar/RegistrarGpa.jsx'));
const RegistrarGraduation = lazy(() => import('./pages/registrar/RegistrarGraduation.jsx'));
const RegistrarTranscripts = lazy(() => import('./pages/registrar/RegistrarTranscripts.jsx'));
const RegistrarCertificates = lazy(() => import('./pages/registrar/RegistrarCertificates.jsx'));
const RegistrarReports = lazy(() => import('./pages/registrar/RegistrarReports.jsx'));
const RegistrarAnnouncements = lazy(() => import('./pages/registrar/RegistrarAnnouncements.jsx'));
const RegistrarNotifications = lazy(() => import('./pages/registrar/RegistrarNotifications.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

// The accountant's generic dashboard still lives under its own prefix. The Registrar
// workspace has explicit routes below.
const OTHER_ROLES = ['ACCOUNTANT'];

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
        <Route path="/maintenance" element={<Maintenance />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            {/* The same pages for every role: the person, not the job. */}
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/me" element={<Me />} />
            <Route path="/me/devices" element={<Sessions />} />

            <Route element={<RequireRole roles={['ADMIN']} />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/analytics" element={<AdminAnalytics />} />
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

            <Route element={<RequireRole roles={['TEACHER']} />}>
              <Route path="/teacher" element={<Navigate to="/teacher/dashboard" replace />} />
              <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
              <Route path="/teacher/classes" element={<TeacherClasses />} />
              <Route path="/teacher/classes/:assignmentId" element={<TeacherClass />} />
              <Route path="/teacher/students" element={<TeacherStudents />} />
              <Route path="/teacher/students/:studentId" element={<TeacherStudent />} />
              <Route path="/teacher/attendance" element={<TeacherAttendance />} />
              <Route path="/teacher/attendance/:assignmentId" element={<TeacherAttendanceMark />} />
              <Route path="/teacher/assessments" element={<TeacherAssessments />} />
              <Route path="/teacher/assessments/:assessmentId" element={<TeacherAssessment />} />
              <Route path="/teacher/materials" element={<TeacherMaterials />} />
              <Route path="/teacher/reports" element={<TeacherReports />} />
            </Route>

            <Route element={<RequireRole roles={['REGISTRAR']} />}>
              <Route path="/registrar" element={<Navigate to="/registrar/dashboard" replace />} />
              <Route path="/registrar/dashboard" element={<RegistrarDashboard />} />
              <Route path="/registrar/students" element={<RegistrarStudents />} />
              <Route path="/registrar/students/:studentId" element={<RegistrarStudent />} />
              <Route path="/registrar/enrollments" element={<RegistrarEnrollments />} />
              <Route path="/registrar/academic-structure" element={<RegistrarAcademicStructure />} />
              <Route path="/registrar/academic-calendar" element={<RegistrarCalendar />} />
              <Route path="/registrar/batches" element={<RegistrarBatches />} />
              <Route path="/registrar/curriculum" element={<RegistrarCurriculum />} />
              <Route path="/registrar/course-offerings" element={<RegistrarOfferings />} />
              <Route path="/registrar/course-registration" element={<RegistrarCourseRegistration />} />
              <Route path="/registrar/attendance" element={<RegistrarAttendance />} />
              <Route path="/registrar/results" element={<RegistrarResults />} />
              <Route path="/registrar/gpa-cgpa" element={<RegistrarGpa />} />
              <Route path="/registrar/graduation-eligibility" element={<RegistrarGraduation />} />
              <Route path="/registrar/transcripts" element={<RegistrarTranscripts />} />
              <Route path="/registrar/certificates" element={<RegistrarCertificates />} />
              <Route path="/registrar/reports" element={<RegistrarReports />} />
              <Route path="/registrar/announcements" element={<RegistrarAnnouncements />} />
              <Route path="/registrar/notifications" element={<RegistrarNotifications />} />
              <Route path="/registrar/my-account" element={<Me />} />
              <Route path="/registrar/my-devices" element={<Sessions />} />
              <Route path="/registrar/account" element={<Navigate to="/registrar/my-account" replace />} />
              <Route path="/registrar/devices" element={<Navigate to="/registrar/my-devices" replace />} />
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
