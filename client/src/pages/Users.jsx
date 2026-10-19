import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  CircleCheck, KeyRound, Lock, LogOut, MailCheck, Mails, RefreshCw, Search, ShieldCheck, Trash2, TriangleAlert, UserPlus, UserRound,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { createUserSchema, updateUserSchema, tempPasswordSchema, ROLES, ASSIGNABLE_ROLES, nameField, emailField } from '../lib/validation';
import { formatEthiopian } from '../lib/ethiopianDate';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Badge, { RoleBadge } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import Modal from '../components/ui/Modal';
import PasswordMeter from '../components/ui/PasswordMeter';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/StatePanel';

const STATUS = {
  active: { tone: 'success', label: 'active' },
  pending: { tone: 'warning', label: 'email not confirmed' },
  disabled: { tone: 'danger', label: 'turned off' },
};

const initials = (name) =>
  (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || 'U';

// Typing in the search box should not fire a request per keystroke.
function useDebounced(value, delay = 300) {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setOut(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return out;
}

export default function Users() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const debouncedSearch = useDebounced(search);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [tempFor, setTempFor] = useState(null);
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
    defaultValues: { name: '', email: '', role: 'TEACHER', password: '', confirm: '' },
  });
  const editForm = useForm({
    resolver: zodResolver(updateUserSchema),
    mode: 'onTouched',
    defaultValues: { name: '', role: 'TEACHER', status: 'active', twoStepEnabled: false },
  });
  const tempForm = useForm({
    resolver: zodResolver(tempPasswordSchema),
    mode: 'onTouched',
    defaultValues: { password: '', confirm: '' },
  });

  const createName = useWatch({ control: createForm.control, name: 'name' }) ?? '';
  const createEmail = useWatch({ control: createForm.control, name: 'email' }) ?? '';
  const createPassword = useWatch({ control: createForm.control, name: 'password' }) ?? '';
  const createConfirm = useWatch({ control: createForm.control, name: 'confirm' }) ?? '';
  const tempPassword = useWatch({ control: tempForm.control, name: 'password' }) ?? '';
  const tempConfirm = useWatch({ control: tempForm.control, name: 'confirm' }) ?? '';

  useEffect(() => {
    if (!editing) return;
    editForm.reset({
      name: editing.name,
      role: editing.role,
      status: editing.status === 'disabled' ? 'disabled' : 'active',
      twoStepEnabled: !!editing.twoStepEnabled,
    });
  }, [editing, editForm]);

  const create = useMutation({
    mutationFn: (values) =>
      api.post('/admin/users', { name: values.name, email: values.email, role: values.role, password: values.password }),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Account created.');
      toast.info('Give them the temporary password. A confirmation link is already in their inbox.');
      setCreateOpen(false);
      createForm.reset();
      refresh();
    },
    onError: (err) => fail(err, 'We could not create that account.'),
  });

  const update = useMutation({
    mutationFn: ({ id, values }) => api.patch(`/admin/users/${id}`, values),
    onSuccess: () => {
      toast.success('Account updated.');
      setEditing(null);
      refresh();
    },
    onError: (err) => fail(err, 'We could not update that account.'),
  });

  const resend = useMutation({
    mutationFn: (id) => api.post(`/admin/users/${id}/resend-verification`),
    onSuccess: (res) => toast.success(res.data?.message || 'A new confirmation link is on its way.'),
    onError: (err) => fail(err, 'We could not send a new link.'),
  });

  // For somebody who confirmed their email but lost access. No password is ever handed
  // out once the email is confirmed: they choose their own from the link.
  const resetLink = useMutation({
    mutationFn: (id) => api.post(`/admin/users/${id}/reset-link`),
    onSuccess: (res) => toast.success(res.data?.message || 'A reset link is on its way.'),
    onError: (err) => fail(err, 'We could not send a reset link.'),
  });

  const setTemp = useMutation({
    mutationFn: ({ id, password }) => api.post(`/admin/users/${id}/password`, { password }),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Temporary password set.');
      setTempFor(null);
      tempForm.reset();
      refresh();
    },
    onError: (err) => fail(err, 'We could not set that password.'),
  });

  const signOut = useMutation({
    mutationFn: (id) => api.post(`/admin/users/${id}/sign-out`),
    onSuccess: (res) => toast.success(res.data?.message || 'Every device was signed out.'),
    onError: (err) => fail(err, 'We could not sign that account out.'),
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/admin/users/${id}`),
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

  const createNameOk = createName.length > 0 && nameField.safeParse(createName).success;
  const createEmailOk = createEmail.length > 0 && emailField.safeParse(createEmail).success;
  const createMatches = createConfirm.length > 0 && createPassword === createConfirm;
  const tempMatches = tempConfirm.length > 0 && tempPassword === tempConfirm;

  return (
    <div className="space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Users</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Create the account, hand over the temporary password, and they confirm their email with the link we send. After that
            only they can choose a password.
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
                return (
                  <div key={u.id} className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white/70 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 gap-3.5">
                      <span className="brand-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white">
                        {initials(u.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                          {u.name}
                          <RoleBadge role={u.role} />
                          <Badge tone={tone.tone}>{tone.label}</Badge>
                          {u.twoStepEnabled ? <Badge tone="brand">2-step on</Badge> : null}
                          {u.mustChangePassword ? <Badge tone="warning">temporary password</Badge> : null}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{u.email}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          Added {formatEthiopian(u.createdAt)}
                          {u.lastLoginAt ? ` · last signed in ${formatEthiopian(u.lastLoginAt, { time: true })}` : ' · never signed in'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setEditing(u)}>
                        Edit
                      </Button>
                      {!u.emailVerified ? (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => resend.mutate(u.id)}
                            loading={resend.isPending && resend.variables === u.id}
                          >
                            <Mails className="h-3.5 w-3.5" />
                            Resend link
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => { tempForm.reset(); setTempFor(u); }}>
                            <KeyRound className="h-3.5 w-3.5" />
                            New password
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => resetLink.mutate(u.id)}
                          loading={resetLink.isPending && resetLink.variables === u.id}
                        >
                          <MailCheck className="h-3.5 w-3.5" />
                          Send reset link
                        </Button>
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
                      <Button variant="danger" size="sm" onClick={() => setRemoving(u)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
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
        subtitle="They get a temporary password from you and a link in their inbox to confirm their email."
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
            label="Full name"
            icon={UserRound}
            placeholder="Haile Michael"
            status={createNameOk ? 'ok' : undefined}
            hint="First name and last name."
            error={createForm.formState.errors.name?.message}
            {...createForm.register('name')}
          />
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
          <Field
            label="Temporary password"
            type="password"
            icon={Lock}
            autoComplete="new-password"
            placeholder="Choose a temporary password"
            error={createForm.formState.errors.password?.message}
            {...createForm.register('password')}
          >
            <PasswordMeter value={createPassword} className="mt-3" />
          </Field>
          <Field
            label="Repeat temporary password"
            type="password"
            icon={Lock}
            autoComplete="new-password"
            placeholder="Type it again"
            error={createConfirm.length === 0 ? createForm.formState.errors.confirm?.message : undefined}
            {...createForm.register('confirm')}
          >
            {createConfirm.length > 0 ? (
              <p className={`animate-rise mt-1.5 flex items-center gap-1.5 text-xs font-semibold ${createMatches ? 'text-emerald-600' : 'text-rose-500'}`}>
                {createMatches ? <CircleCheck className="animate-pop h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
                {createMatches ? 'Passwords match' : 'Passwords do not match'}
              </p>
            ) : null}
          </Field>
        </form>
      </Modal>

      {/* Edit a user */}
      <Modal
        open={!!editing}
        title={editing ? `Edit ${editing.name}` : 'Edit'}
        subtitle={editing?.email}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-user-form"
              loading={update.isPending}
              disabled={!editForm.formState.isDirty}
            >
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
          <Field
            label="Full name"
            icon={UserRound}
            placeholder="Haile Michael"
            error={editForm.formState.errors.name?.message}
            {...editForm.register('name')}
          />
          <div>
            <label htmlFor="edit-role" className="mb-1.5 block text-sm font-medium text-slate-700">
              Role
            </label>
            {editing?.role === 'ADMIN' ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                administrator — there is only one, and it stays that way.
              </p>
            ) : (
              <select
                id="edit-role"
                className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm text-slate-800"
                {...editForm.register('role')}
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.toLowerCase()}
                  </option>
                ))}
              </select>
            )}
          </div>
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
            <p className="mt-1.5 text-xs text-slate-400">Turning an account off signs it out everywhere at once.</p>
          </div>
          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
            <input type="checkbox" className="focus-ring mt-0.5 h-4 w-4 rounded" {...editForm.register('twoStepEnabled')} />
            <span className="text-sm text-slate-700">
              <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                <ShieldCheck className="h-4 w-4 text-brand-500" />
                Ask for a code at every sign-in
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                A new browser always asks for one, whether this is on or off.
              </span>
            </span>
          </label>
        </form>
      </Modal>

      {/* Hand out a new temporary password */}
      <Modal
        open={!!tempFor}
        title="Set a temporary password"
        subtitle={tempFor ? `For ${tempFor.name}. They choose their own at the next sign-in. Every device is signed out.` : ''}
        onClose={() => setTempFor(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTempFor(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="temp-password-form"
              loading={setTemp.isPending}
              disabled={!tempMatches}
            >
              Set password
            </Button>
          </>
        }
      >
        <form
          id="temp-password-form"
          onSubmit={tempForm.handleSubmit((values) => setTemp.mutate({ id: tempFor.id, password: values.password }))}
          className="space-y-4"
          noValidate
        >
          <Field
            label="Temporary password"
            type="password"
            icon={Lock}
            autoComplete="new-password"
            placeholder="Choose a temporary password"
            error={tempForm.formState.errors.password?.message}
            {...tempForm.register('password')}
          >
            <PasswordMeter value={tempPassword} className="mt-3" />
          </Field>
          <Field
            label="Repeat temporary password"
            type="password"
            icon={Lock}
            autoComplete="new-password"
            placeholder="Type it again"
            error={tempConfirm.length === 0 ? tempForm.formState.errors.confirm?.message : undefined}
            {...tempForm.register('confirm')}
          >
            {tempConfirm.length > 0 ? (
              <p className={`animate-rise mt-1.5 flex items-center gap-1.5 text-xs font-semibold ${tempMatches ? 'text-emerald-600' : 'text-rose-500'}`}>
                {tempMatches ? <CircleCheck className="animate-pop h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
                {tempMatches ? 'Passwords match' : 'Passwords do not match'}
              </p>
            ) : null}
          </Field>
        </form>
      </Modal>

      {/* Remove a user */}
      <Modal
        open={!!removing}
        title="Remove this account?"
        subtitle={removing ? `${removing.name} (${removing.email}) stops working right away.` : ''}
        onClose={() => setRemoving(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={() => remove.mutate(removing.id)} loading={remove.isPending}>
              Remove account
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-slate-600">
          The account is kept in the records, so the history stays readable, but the email stays reserved and nobody can sign in
          with it again.
        </p>
      </Modal>
    </div>
  );
}
