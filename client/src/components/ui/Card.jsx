export default function Card({ children, className = '', ...rest }) {
  return (
    <section className={`glass rounded-3xl ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, icon: Icon, action }) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-slate-100/80 px-6 py-5">
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Icon className="h-4.5 w-4.5" />
          </span>
        ) : null}
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </header>
  );
}

export function CardBody({ children, className = '' }) {
  return <div className={`px-6 py-5 ${className}`}>{children}</div>;
}
