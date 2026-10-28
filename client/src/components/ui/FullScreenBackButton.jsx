import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Minimize2 } from 'lucide-react';

export default function FullScreenBackButton() {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(typeof document !== 'undefined' && document.fullscreenElement));
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleChange);
    document.addEventListener('webkitfullscreenchange', handleChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      document.removeEventListener('webkitfullscreenchange', handleChange);
    };
  }, []);

  if (!isFullscreen) return null;

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/registrar/dashboard');
    }
  };

  const handleExit = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <aside
      className="fixed top-3 left-4 z-[99999] flex items-center gap-1.5 rounded-full border border-slate-300/90 bg-white/95 px-3 py-1.5 shadow-2xl backdrop-blur-md transition-all hover:bg-white ring-1 ring-slate-900/10"
      aria-label="Full screen controls"
    >
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 hover:text-brand-700 transition"
        title="Go back to previous page"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back</span>
      </button>
      <span className="h-3.5 w-px bg-slate-300" />
      <button
        type="button"
        onClick={handleExit}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 transition"
        title="Exit Fullscreen (Esc)"
      >
        <Minimize2 className="h-3 w-3" />
        <span>Exit</span>
      </button>
    </aside>
  );
}
