import { TriangleAlert, Inbox } from 'lucide-react';
import Button from './Button';

const TONES = {
  neutral: 'text-slate-400',
  danger: 'text-rose-500',
};

export function StatePanel({ icon: Icon, title, message, action, tone = 'neutral' }) {
  return (
    <div className="animate-fade flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 ${TONES[tone]}`}>
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      {message ? <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">{message}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ title, message, icon = Inbox, actionLabel, onAction }) {
  return (
    <StatePanel
      icon={icon}
      title={title}
      message={message}
      action={actionLabel ? <Button variant="secondary" onClick={onAction}>{actionLabel}</Button> : null}
    />
  );
}

export function ErrorState({ message = 'We could not load this just now.', onRetry }) {
  return (
    <StatePanel
      icon={TriangleAlert}
      tone="danger"
      title="Something went wrong"
      message={message}
      action={onRetry ? <Button variant="secondary" onClick={onRetry}>Try again</Button> : null}
    />
  );
}
