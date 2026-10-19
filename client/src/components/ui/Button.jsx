import Spinner from './Spinner';

const VARIANTS = {
  primary: 'brand-gradient text-white shadow-lg shadow-brand-600/25 hover:brightness-110',
  secondary: 'border border-slate-200 bg-white/80 text-slate-700 hover:bg-white',
  ghost: 'text-slate-600 hover:bg-white/70',
  danger: 'bg-rose-600 text-white shadow-lg shadow-rose-600/20 hover:bg-rose-500',
};

const SIZES = {
  sm: 'h-9 rounded-lg px-3 text-xs',
  md: 'h-11 rounded-xl px-5 text-sm',
  lg: 'h-12 rounded-xl px-6 text-sm',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`focus-ring inline-flex items-center justify-center gap-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}
