import { Bell, Fingerprint, UserRound } from 'lucide-react';

// The personal pages. They are shared by the avatar dropdown in the header and by the
// mobile menu, so both stay in step.
export const PERSONAL_ITEMS = [
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/me', label: 'My profile', icon: UserRound },
  { to: '/me/devices', label: 'My devices', icon: Fingerprint },
];

// The Registrar workspace keeps its personal pages under its own prefix so every link in
// the avatar menu stays inside the role the person is working in.
export const personalItems = (role) =>
  role === 'REGISTRAR'
    ? [
        { to: '/registrar/notifications', label: 'Notifications', icon: Bell },
        { to: '/registrar/my-account', label: 'My Account', icon: UserRound },
        { to: '/registrar/my-devices', label: 'My Devices', icon: Fingerprint },
      ]
    : PERSONAL_ITEMS;
