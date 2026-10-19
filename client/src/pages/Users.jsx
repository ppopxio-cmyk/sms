import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  CircleCheck, Lock, LogOut, MailCheck, Mails, RefreshCw, Search, Trash2, UserPlus, UserRound,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { createUserSchema, editUserSchema, removeUserSchema, ROLES, ASSIGNABLE_ROLES, emailField } from '../lib/validation';
import { useDebounced } from '../lib/useDebounced';
import { useAuth } from '../store/auth';
import { formatEthiopian } from '../lib/ethiopianDate';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Badge, { RoleBadge } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import Modal from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/StatePanel';

const STATUS = {
  active: { tone: 'success', label: 'active' },
  pending: { tone: 'warning', label: 'email not confirmed' },
  disabled: { tone: 'danger', label: 'turned off' },
};

const initials = (value) =>
  (value || '')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || 'U';

// Typing in the search box should not fire a request per keystroke.
export default function Users() {
  const queryClient = useQueryClient();
  const me = useAuth((s) => s.user);
  const location = useLocation();

  // The header search can hand a term straight to this page, so opening somebody from
  // there lands on the row already filtered.
  const [search, setSearch] = useState(() => location.state?.search ?? '');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const debouncedSearch = useDebounced(search);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);

  const users = useQuery({
    queryKey: ['users', { search: debouncedSearch, role, status }],
    queryFn: async () =>
      (
        await api.get('/admin/users', {
          params: { search: debouncedSearch || undefined, role: role || undefined, status: status || undefined, limit: 100 },
        })
      ).data,
  });

  const rows = users.data?.users ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });
  const fail = (err, fallback) => toast.error(errorMessage(err, fallback));

  const createForm = useForm({
    resolver: zodResolver(createUserSchema),
    mode: 'onTouched',
    defaultValues: { email: '', role: 'TEACHER' },
  });
  const editForm = useForm({
    resolver: zodResolver(editUserSchema),
    mode: 'onTouched',
    defaultValues: { status: 'active', password: '' },
  });
  const removeForm = useForm({
    resolver: zodResolver(removeUserSchema),
    mode: 'onTouched',
    defaultValues: { password: '' },
  });

  const createEmail = useWatch({ control: createForm.control, name: 'email' }) ?? '';
  const createEmailOk = createEmail.length > 0 && emailField.safeParse(createEmail).success;

  useEffect(() => {
    if (!editing) return;
    editForm.reset({ status: editing.status === 'disabled' ? 'disabled' : 'active', password: '' });
  }, [editing, editForm]);

  useEffect(() => {
    if (!removing) return;
    removeForm.reset({ password: '' });
  }, [removing, removeForm]);

  const create = useMutation({
    mutationFn: (values) => api.post('/admin/users', values),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Account created.');
      setCreateOpen(false);
      createForm.reset();
      refresh();
    },
    onError: (err) => fail(err, 'We could not create that account.'),
  });

  const update = useMutation({
    mutationFn: ({ id, values }) => api.patch(`/admin/users/${id}`, values),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Account updated.');
      setEditing(null);
      refresh();
    },
    onError: (err) => fail(err, 'We could not update that account.'),
  });

  const resend = useMutation({
    mutationFn: (id) => api.post(`/admin/users/${id}/resend-verification`),
    onSuccess: (res) => toast.success(res.data?.message || 'A new link is on its way.'),
    onError: (err) => fail(err, 'We could not send a new link.'),
  });

  // For somebody whose account is finished but who lost access. No password is ever
  // handed out: they choose their own from the link.
  const resetLink = useMutation({
    mutationFn: (id) => api.post(`/admin/users/${id}/reset-link`),
    onSuccess: (res) => toast.success(res.data?.message || 'A reset link is on its way.'),
    onError: (err) => fail(err, 'We could not send a reset link.'),
  });

  const signOut = useMutation({
    mutationFn: (id) => api.post(`/admin/users/${id}/sign-out`),
    onSuccess: (res) => toast.success(res.data?.message || 'Every device was signed out.'),
    onError: (err) => fail(err, 'We could not sign that account out.'),
  });

  const remove = useMutation({
    mutationFn: ({ id, password }) => api.delete(`/admin/users/${id}`, { data: { password } }),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'That account was removed.');
      setRemoving(null);
      refresh();
    },
    onError: (err) => fail(err, 'We could not remove that account.'),
  });

  const closeCreate = () => {
    setCreateOpen(false);
    createForm.reset();
  };

  return (
    <div className="space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Users</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Add an account with an email address and a role. The person opens the link we email them, confirms the address, and
            chooses their own full name and password. Nobody but them ever knows that password.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Add user
        </Button>
      </header>

      <Card>
        <CardHeader
          icon={UserRound}
          title="Accounts"
          subtitle={users.isLoading ? 'Loading accounts…' : `${users.data?.total ?? 0} account${users.data?.total === 1 ? '' : 's'}`}
          action={
            <Button variant="secondary" size="sm" onClick={() => users.refetch()} loading={users.isFetching}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          }
        />

        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search a name or an email"
                aria-label="Search users"
                className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/80 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400"
              />
            </div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-label="Filter by role"
              className="focus-ring h-11 rounded-xl border border-slate-200 bg-white/80 px-3 text-sm text-slate-700"
            >
              <option value="">Every role</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.toLowerCase()}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter by status"
              className="focus-ring h-11 rounded-xl border border-slate-200 bg-white/80 px-3 text-sm text-slate-700"
            >
              <option value="">Every status</option>
              <option value="active">active</option>
              <option value="pending">email not confirmed</option>
              <option value="disabled">turned off</option>
            </select>
          </div>

          {users.isLoading ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : users.isError ? (
            <ErrorState message={errorMessage(users.error)} onRetry={() => users.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No accounts match"
              message={search || role || status ? 'Try a different search or filter.' : 'Add the first account to get started.'}
            />
          ) : (
            <div className="space-y-3">
              {rows.map((u) => {
                const tone = STATUS[u.status] ?? STATUS.pending;
                const isSelf = me?.id === u.id;
                const label = u.name || u.email;
                return (
                  <div key={u.id} className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white/70 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 gap-3.5">
                      <span className="brand-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white">
                        {initials(label)}
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                          <span className={u.name ? '' : 'text-slate-500'}>{label}</span>
                          <RoleBadge role={u.role} />
                          <Badge tone={tone.tone}>{tone.label}</Badge>
                          {u.twoStepEnabled ? <Badge tone="brand">2-step on</Badge> : null}
                          {u.mustChangePassword ? <Badge tone="warning">waiting to set up</Badge> : null}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{u.email}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          Added {formatEthiopian(u.createdAt)}
                          {u.lastLoginAt ? ` · last signed in ${formatEthiopian(u.lastLoginAt, { time: true })}` : ' · never signed in'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isSelf ? (
                        <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                          This is your account
                        </span>
                      ) : (
                        <>
                          <Button variant="secondary" size="sm" onClick={() => setEditing(u)}>
                            Edit
                          </Button>
                          {u.emailVerified && !u.mustChangePassword ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => resetLink.mutate(u.id)}
                              loading={resetLink.isPending && resetLink.variables === u.id}
                            >
                              <MailCheck className="h-3.5 w-3.5" />
                              Send reset link
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => resend.mutate(u.id)}
                              loading={resend.isPending && resend.variables === u.id}
                            >
                              <Mails className="h-3.5 w-3.5" />
                              Resend link
                            </Button>
                          )}
                          <Button variant="danger" size="sm" onClick={() => setRemoving(u)}>
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </Button>
                        </>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => signOut.mutate(u.id)}
                        loading={signOut.isPending && signOut.variables === u.id}
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign out
                      </Button>
                    </div>
                  </div>
                );
              })}

              {(users.data?.total ?? 0) > rows.length ? (
                <p className="pt-1 text-center text-xs text-slate-400">
                  Showing the first {rows.length} of {users.data.total}. Narrow the search to see the rest.
                </p>
              ) : null}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Add a user */}
      <Modal
        open={createOpen}
        title="Add a user"
        subtitle="Only the email address and the role. They set their own name and password from the link we send."
        onClose={closeCreate}
        footer={
          <>
            <Button variant="secondary" onClick={closeCreate}>
              Cancel
            </Button>
            <Button type="submit" form="create-user-form" loading={create.isPending}>
              Create account
            </Button>
          </>
        }
      >
        <form id="create-user-form" onSubmit={createForm.handleSubmit((values) => create.mutate(values))} className="space-y-4" noValidate>
          <Field
            label="Gmail address"
            type="email"
            icon={Mails}
            placeholder="you@gmail.com"
            status={createEmailOk ? 'ok' : undefined}
            hint="Must end with @gmail.com"
            error={createForm.formState.errors.email?.message}
            {...createForm.register('email')}
          />
          <div>
            <label htmlFor="role-select" className="mb-1.5 block text-sm font-medium text-slate-700">
              Role
            </label>
            <select
              id="role-select"
              className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm text-slate-800"
              {...createForm.register('role')}
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.toLowerCase()}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-400">
              There is a single administrator account, so it is not something you can add here.
            </p>
          </div>
          <div className="rounded-2xl border border-brand-100 bg-brand-50/60 px-4 py-3">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-brand-800">
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              A link goes to their inbox straight away. They confirm the address, choose their full name and password, and only
              then can they sign in. No password is ever shared with you.
            </p>
          </div>
        </form>
      </Modal>

      {/* Edit a user: turn the account on or off */}
      <Modal
        open={!!editing}
        title={editing ? `Edit ${editing.name || editing.email}` : 'Edit'}
        subtitle={editing?.email}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-user-form" loading={update.isPending}>
              Save changes
            </Button>
          </>
        }
      >
        <form
          id="edit-user-form"
          onSubmit={editForm.handleSubmit((values) => update.mutate({ id: editing.id, values }))}
          className="space-y-4"
          noValidate
        >
          <div>
            <label htmlFor="edit-status" className="mb-1.5 block text-sm font-medium text-slate-700">
              Account
            </label>
            <select
              id="edit-status"
              className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm text-slate-800"
              {...editForm.register('status')}
            >
              <option value="active">active</option>
              <option value="disabled">turned off</option>
            </select>
            <p className="mt-1.5 text-xs text-slate-400">
              Turning an account off signs it out on every device at once. No email is sent.
            </p>
          </div>
          <Field
            label="Your password"
            type="password"
            icon={Lock}
            autoComplete="current-password"
            placeholder="Confirm with your password"
            hint="Both changes here are confirmed with your own password."
            error={editForm.formState.errors.password?.message}
            {...editForm.register('password')}
          />
        </form>
      </Modal>

      {/* Remove a user */}
      <Modal
        open={!!removing}
        title="Remove this account?"
        subtitle={removing ? `${removing.name || removing.email} (${removing.email}) stops working right away.` : ''}
        onClose={() => setRemoving(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button type="submit" form="remove-user-form" variant="danger" loading={remove.isPending}>
              Remove account
            </Button>
          </>
        }
      >
        <form
          id="remove-user-form"
          onSubmit={removeForm.handleSubmit((values) => remove.mutate({ id: removing.id, password: values.password }))}
          className="space-y-4"
          noValidate
        >
          <p className="text-sm leading-relaxed text-slate-600">
            The account is kept in the records, so the history stays readable, but the email stays reserved and nobody can sign in
            with it again. Every device is signed out, and no email is sent.
          </p>
          <Field
            label="Your password"
            type="password"
            icon={Lock}
            autoComplete="current-password"
            placeholder="Confirm with your password"
            error={removeForm.formState.errors.password?.message}
            {...removeForm.register('password')}
          />
        </form>
      </Modal>
    </div>
  );
}
