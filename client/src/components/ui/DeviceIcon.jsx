import { Monitor, Smartphone, Tablet } from 'lucide-react';

const MAP = { mobile: Smartphone, tablet: Tablet, desktop: Monitor };

export default function DeviceIcon({ type, className = 'h-4 w-4' }) {
  const Icon = MAP[type] ?? Monitor;
  return <Icon className={className} />;
}
