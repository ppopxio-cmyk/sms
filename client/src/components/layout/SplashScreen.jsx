import Brand from '../ui/Brand';
import Spinner from '../ui/Spinner';

export default function SplashScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <div className="animate-rise flex flex-col items-center gap-4">
        <Brand size="lg" layout="col" />
        <span className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner className="h-4 w-4 text-brand-500" />
          Restoring your session
        </span>
      </div>
    </div>
  );
}
