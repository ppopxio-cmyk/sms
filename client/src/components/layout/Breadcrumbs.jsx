import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const LABELS = {
  registrar: 'Registrar',
  dashboard: 'Dashboard',
  students: 'Students',
  enrollments: 'Enrollments',
  'academic-structure': 'Academic structure',
  'academic-calendar': 'Academic calendar',
  batches: 'Batches',
  curriculum: 'Curriculum',
  'course-registration': 'Course registration',
  attendance: 'Attendance',
  results: 'Results',
  'gpa-cgpa': 'GPA & CGPA',
  'graduation-eligibility': 'Graduation eligibility',
  transcripts: 'Transcripts',
  certificates: 'Certificates',
  reports: 'Reports & exports',
  announcements: 'Announcements',
  notifications: 'Notifications',
  'my-account': 'My account',
  'my-devices': 'My devices',
};

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  if (!pathname.startsWith('/registrar')) return null;

  const segments = pathname.split('/').filter(Boolean);
  const crumbs = segments.map((segment, index) => {
    const parent = segments[index - 1];
    const label =
      LABELS[segment] ||
      (parent === 'students' ? 'Student record' : LABELS[parent] || segment.replaceAll('-', ' '));
    const href = `/${segments.slice(0, index + 1).join('/')}`;
    return { label, href };
  });

  return (
    <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
      <Link
        to="/registrar/dashboard"
        className="focus-ring inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-medium transition hover:text-brand-700"
      >
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Registrar home</span>
      </Link>
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-slate-300" aria-hidden="true" />
            {last ? (
              <span aria-current="page" className="font-semibold capitalize text-slate-600">
                {crumb.label}
              </span>
            ) : (
              <Link to={crumb.href} className="focus-ring rounded-md px-1 py-0.5 capitalize transition hover:text-brand-700">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
