import { Bell, Fingerprint, UserRound } from 'lucide-react';

// The personal pages. They are shared by the avatar dropdown in the header and by the
// mobile menu, so both stay in step.
export const PERSONAL_ITEMS = [
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/me', label: 'My profile', icon: UserRound },
  { to: '/me/devices', label: 'My devices', icon: Fingerprint },
];
