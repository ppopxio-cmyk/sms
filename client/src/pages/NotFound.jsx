import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Brand from '../components/ui/Brand';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <Brand size="lg" layout="col" />
      <p className="text-6xl font-bold tracking-tight text-brand-gradient">404</p>
      <div>
        <h1 className="text-xl font-bold text-slate-900">We could not find that page</h1>
        <p className="mt-1.5 text-sm text-slate-600">The link may be old, or the address may have a typo in it.</p>
      </div>
      <Link
        to="/"
        className="focus-ring brand-gradient inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:brightness-110"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to the dashboard
      </Link>
    </div>
  );
}
