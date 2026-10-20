import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Fingerprint, Pencil } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { deviceSubtitle, deviceTitle, modelBadge, placeLine } from '../lib/deviceName';
import { formatEthiopian, timeAgo } from '../lib/ethiopianDate';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import CodeInput from '../components/ui/CodeInput';
import DeviceIcon from '../components/ui/DeviceIcon';
import Field from '../components/ui/Field';
import Modal from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/StatePanel';
import { useAuth } from '../store/auth';

export default function Sessions() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = useAuth((s) => s.logout);

  const [target, setTarget] = useState(null);
  const [code, setCode] = useState('');
  const [shake, setShake] = useState(0);
  const [naming, setNaming] = useState(null);
  const [label, setLabel] = useState('');

  const sessions = useQuery({
    queryKey: ['my-sessions'],
    queryFn: async () => (await api.get('/auth/sessions')).data,
  });

  // Signing one of your own devices out asks for a code first, so a borrowed laptop
  // cannot quietly kick your other devices off.
  const askCode = useMutation({
    mutationFn: (id) => api.post(`/auth/sessions/${id}/code`),
    onSuccess: (res) => toast.success(res.data?.message || 'We emailed you a code.'),
    onError: (err) => toast.error(errorMessage(err, 'We could not send a code.')),
  });

  const terminate = useMutation({
    mutationFn: (values) => api.post(`/auth/sessions/${values.id}/terminate`, { code: values.code }),
    onSuccess: () => {
      toast.success('That device was signed out.');
      setTarget(null);
      setCode('');
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'We could not sign that device out.'));
      if (err?.response?.data?.code === 'CODE_WRONG') {
        setCode('');
        setShake((n) => n + 1);
      }
    },
  });

  const startSignOut = (session) => {
    setTarget(session);
    setCode('');
    askCode.mutate(session.id);
  };

  // A laptop never tells a website its model, so a person can name their own browser
  // instead. The name is theirs: it is shown here and on the administrator's device list.
  const rename = useMutation({
    mutationFn: (values) => api.patch(`/auth/sessions/${values.id}/name`, { label: values.label }),
    onSuccess: () => {
      toast.success('Device named.');
      setNaming(null);
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'We could not save that name.')),
  });

  const startNaming = (session) => {
    setNaming(session);
    setLabel(session.deviceLabel || '');
  };

  const signOutThisDevice = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const rows = sessions.data?.sessions ?? [];

  return (
    <div className="space-y-6">
      <header className="animate-rise">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">My devices</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Every device signed in to your account. If you see something you do not recognise, sign it out and change your password.
        </p>
        <p className="mt-1.5 text-xs text-slate-500">
          A place comes from this device when you allow it, otherwise from the network and only approximately.
          A laptop’s model cannot be detected — give it a name you will recognise.
        </p>
      </header>

      <Card>
        <CardHeader
          icon={Fingerprint}
          title="Active devices"
          subtitle={sessions.isLoading ? 'Checking where you are signed in…' : `${rows.length} active`}
          action={
            <Button variant="secondary" size="sm" onClick={() => sessions.refetch()} loading={sessions.isFetching}>
              Refresh
            </Button>
          }
        />
        <CardBody className="space-y-3">
          {sessions.isLoading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : sessions.isError ? (
            <ErrorState message={errorMessage(sessions.error)} onRetry={() => sessions.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="No active devices" message="Nothing is signed in with this account right now." />
          ) : (
            rows.map((s) => {
              const badge = modelBadge(s);
              const sub = deviceSubtitle(s);
              return (
                <div
                  key={s.id}
                  className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 gap-3.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                      <DeviceIcon type={s.deviceType} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                        {deviceTitle(s)}
                        {s.current ? <Badge tone="success">This device</Badge> : null}
                        {badge ? <Badge tone={badge.tone}>{badge.text}</Badge> : null}
                      </p>
                      {sub ? <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p> : null}
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {s.ip} · {placeLine(s)} · last active {timeAgo(s.lastSeenAt)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">Signed in {formatEthiopian(s.createdAt, { time: true })}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => startNaming(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Name
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => (s.current ? signOutThisDevice() : startSignOut(s))}
                      loading={!s.current && askCode.isPending && askCode.variables === s.id}
                    >
                      {s.current ? 'Sign this one out' : 'Sign out'}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardBody>
      </Card>

      <Modal
        open={!!target}
        title="Confirm this sign-out"
        subtitle={target ? `We emailed a 6-digit code to confirm signing out ${target.browser} on ${target.os}.` : ''}
        onClose={() => {
          setTarget(null);
          setCode('');
        }}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setTarget(null);
                setCode('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={terminate.isPending}
              disabled={code.length !== 6}
              onClick={() => terminate.mutate({ id: target.id, code })}
            >
              Sign that device out
            </Button>
          </>
        }
      >
        <CodeInput value={code} onChange={setCode} disabled={terminate.isPending} shake={shake} />
        <div className="mt-4 text-center text-sm text-slate-500">
          {askCode.isPending ? (
            <span>Sending a code…</span>
          ) : (
            <button
              type="button"
              onClick={() => askCode.mutate(target.id)}
              className="focus-ring rounded-lg font-semibold text-brand-600 hover:text-brand-700"
            >
              Send another code
            </button>
          )}
        </div>
      </Modal>

      <Modal
        open={!!naming}
        title="Name this device"
        subtitle="No website can read the model of a laptop. This name is shown to you and to your administrator, next to this sign-in."
        onClose={() => setNaming(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNaming(null)}>
              Cancel
            </Button>
            <Button
              loading={rename.isPending}
              disabled={label.trim().length < 2}
              onClick={() => rename.mutate({ id: naming.id, label: label.trim() })}
            >
              Save name
            </Button>
          </>
        }
      >
        <Field
          label="Device name"
          placeholder="HP EliteBook 830 G8"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={40}
          hint="For example the make and model printed on the lid."
          autoFocus
        />
      </Modal>
    </div>
  );
}
