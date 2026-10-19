import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, Bell, KeyRound, LogIn, MailCheck, ShieldCheck, X } from 'lucide-react';

const ICONS = {
  login: LogIn,
  user_login: ShieldCheck,
  email_verified: MailCheck,
  user_verified: MailCheck,
  password_changed: KeyRound,
  user_password_changed: KeyRound,
};

// A notice that arrives while somebody is using the portal floats in at the top corner,
// on every page and for every role, without interrupting what they were doing. It is the
// same card for the bell and the notice page; only the framing is different.
export default function NoticeToast({ id, notice }) {
  const navigate = useNavigate();
  const Icon = ICONS[notice?.type] ?? Bell;

  const open = () => {
    toast.dismiss(id);
    navigate('/notifications');
  };

  return (
    <div className="animate-rise flex w-full items-start gap-3 rounded-2xl border border-slate-100 bg-white/95 px-4 py-3.5 shadow-2xl backdrop-blur">
      <span className="brand-gradient mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white">
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-slate-800">{notice?.title}</p>
        {notice?.body ? <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">{notice.body}</p> : null}
        <button
          type="button"
          onClick={open}
          className="focus-ring mt-2 inline-flex items-center gap-1 rounded-lg text-xs font-semibold text-brand-600 hover:text-brand-700"
        >
          View
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => toast.dismiss(id)}
        aria-label="Dismiss this notice"
        className="focus-ring rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
