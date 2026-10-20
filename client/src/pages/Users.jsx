import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CircleCheck,
  Lock,
  LogOut,
  Mail,
  MailCheck,
  Mails,
  Pencil,
  RefreshCw,
  Trash2,
  UserCheck,
  UserPlus,
  UserRound,
  UserX,
  Users as UsersIcon,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { createUserSchema, editUserSchema, removeUserSchema, ASSIGNABLE_ROLES, emailField } from '../lib/validation';
import { useDebounced } from '../lib/useDebounced';
import { useAuth } from '../store/auth';
import { formatEthiopian } from '../lib/ethiopianDate';
import { initials, number, roleLabel } from '../lib/format';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Badge, { RoleBadge } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ExportMenu from '../components/ui/ExportMenu';
import Field from '../components/ui/Field';
import FilterTabs from '../components/ui/FilterTabs';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import RowMenu from '../components/ui/RowMenu';
import SearchInput from '../components/ui/SearchInput';
import StatCard from '../components/ui/StatCard';
import { SkeletonRows } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/StatePanel';

const STATUS = {
  active: { tone: 'success', label: 'Active' },
  pending: { tone: 'warning', label: 'Setup pending' },
  disabled: { tone: 'danger', label: 'Turned off' },
};

const ROLE_TABS = [
  { key: 'ALL', label: 'Everyone', dot: 'bg-slate-400' },
  { key: 'ADMIN', label: 'Admins', dot: 'bg-indigo-500' },
  { key: 'REGISTRAR', label: 'Registrars', dot: 'bg-emerald-500' },
  { key: 'TEACHER', label: 'Teachers', dot: 'bg-sky-500' },
  { key: 'ACCOUNTANT', label: 'Accountants', dot: 'bg-amber-500' },
];

const TEXT_SORTS = new Set(['name', 'email', 'role', 'status']);

function SortHead({ label, column, sort, onSort }) {
  const active = sort.key === column;
  const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th scope="col" className="px-3 pb-1 text-left">
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-[11px] font-semibold uppercase tracking-wider transition ${
          active ? 'text-brand-600' : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

export default function Users() {
  const queryClient = useQueryClient();
  const me = useAuth((state) => state.user);
  const location = useLocation();

  const [search, setSearch] = useState(() => location.state?.search ?? '');
  const [role, setRole] = useState('ALL');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const debouncedSearch = useDebounced(search);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);

  useEffect(() => {
    if (typeof location.state?.search === 'string') {
      setSearch(location.state.search);
      setPage(1);
    }
  }, [location.state]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, role, status, limit]);

  const params = {
    search: debouncedSearch || undefined,
    role: role === 'ALL' ? undefined : role,
    status: status || undefined,
    page,
    limit,
    sort: sort.key,
    dir: sort.dir,
  };

  const exportParams = {
    search: debouncedSearch || undefined,
    role: role === 'ALL' ? undefined : role,
    status: status || undefined,
    sort: sort.key,
    dir: sort.dir,
  };

  const users = useQuery({
    queryKey: ['users', params],
    queryFn: async () => (await api.get('/admin/users', { params })).data,
  });

  const rows = users.data?.users ?? [];
  const counts = users.data?.counts;

  useEffect(() => {
    if (users.data && page > users.data.pages) setPage(users.data.pages);
  }, [page, users.data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
  };

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

  const resetLink = useMutation({
    mutationFn: (id) => api.post(`/admin/users/${id}/reset-link`),
    onSuccess: (res) => toast.success(res.data?.message || 'A reset link is on its way.'),
    onError: (err) => fail(err, 'We could not send a reset link.'),
  });

  const signOut = useMutation({
    mutationFn: (id) => api.post(`/admin/users/${id}/sign-out`),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Every device was signed out.');
      queryClient.invalidateQueries({ queryKey: ['admin-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    },
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

  const toggleSort = (column) => {
    setSort((current) => {
      if (current.key === column) return { key: column, dir: current.dir === 'asc' ? 'desc' : 'asc' };
      return { key: column, dir: TEXT_SORTS.has(column) ? 'asc' : 'desc' };
    });
    setPage(1);
  };

  const chooseSort = (value) => {
    const [key, dir] = value.split(':');
    setSort({ key, dir });
    setPage(1);
  };

  const actionsFor = (u) => {
    if (me?.id === u.id) return null;
    const setup = !u.emailVerified || u.mustChangePassword;

    return [
      { label: 'Edit account', icon: Pencil, onClick: () => setEditing(u) },
      {
        label: setup ? 'Resend setup link' : 'Send reset link',
        icon: setup ? Mails : MailCheck,
        onClick: () => (setup ? resend.mutate(u.id) : resetLink.mutate(u.id)),
      },
      {
        label: 'Sign out everywhere',
        icon: LogOut,
        onClick: () => signOut.mutate(u.id),
      },
      { separator: true },
      { label: 'Remove account', icon: Trash2, tone: 'danger', onClick: () => setRemoving(u) },
    ];
  };

  const roleTabs = ROLE_TABS.map((tab) => ({
    ...tab,
    count:
      tab.key === 'ALL'
        ? counts?.all
        : counts?.byRole?.[tab.key],
  }));

  const subtitle = users.isLoading
    ? 'Loading accounts…'
    : `${number(users.data?.total ?? 0)} account${users.data?.total === 1 ? '' : 's'}${role !== 'ALL' ? ` · ${roleLabel(role)}` : ''}`;

  return (
    <div className="space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{formatEthiopian(new Date())}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Users &amp; access</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Every account, the role it holds, and whether it can sign in. New people set their own name and password from the
            link sent to their inbox.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportMenu
            basePath="/admin/users/export"
            params={exportParams}
            filenamePrefix="accounts"
            disabled={users.isLoading || (users.data?.total ?? 0) === 0}
          />
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Add user
          </Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={UsersIcon}
          tone="indigo"
          label="All accounts"
          value={number(counts?.all ?? 0)}
          hint="Administrators, registrars, teachers and accountants"
          loading={users.isLoading}
        />
        <StatCard
          icon={UserCheck}
          tone="emerald"
          label="Active"
          value={number(counts?.byStatus?.active ?? 0)}
          hint="Finished setup and able to sign in"
          loading={users.isLoading}
        />
        <StatCard
          icon={Mail}
          tone="amber"
          label="Awaiting setup"
          value={number(counts?.byStatus?.pending ?? 0)}
          hint="Invitation sent, password not chosen yet"
          loading={users.isLoading}
        />
        <StatCard
          icon={UserX}
          tone="rose"
          label="Turned off"
          value={number(counts?.byStatus?.disabled ?? 0)}
          hint={counts?.locked ? `${number(counts.locked)} currently locked out` : 'No account is locked out'}
          loading={users.isLoading}
        />
      </section>

      <Card>
        <CardHeader
          icon={UserRound}
          title="Accounts"
          subtitle={subtitle}
          action={
            <Button variant="secondary" size="sm" onClick={() => users.refetch()} loading={users.isFetching}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          }
        />

        <CardBody className="space-y-4">
          <FilterTabs
            tabs={roleTabs}
            value={role}
            onChange={(value) => {
              setRole(value);
              setPage(1);
            }}
            label="Filter accounts by role"
          />

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchInput
              id="user-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search a name or an email"
              label="Search users"
              loading={users.isFetching && Boolean(debouncedSearch)}
              className="flex-1"
            />

            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter by status"
              className="focus-ring h-11 rounded-xl border border-slate-200 bg-white/85 px-3 text-sm text-slate-700"
            >
              <option value="">Every status</option>
              <option value="active">Active ({number(counts?.byStatus?.active ?? 0)})</option>
              <option value="pending">Setup pending ({number(counts?.byStatus?.pending ?? 0)})</option>
              <option value="disabled">Turned off ({number(counts?.byStatus?.disabled ?? 0)})</option>
            </select>

            <select
              value={`${sort.key}:${sort.dir}`}
              onChange={(event) => chooseSort(event.target.value)}
              aria-label="Sort accounts"
              className="focus-ring h-11 rounded-xl border border-slate-200 bg-white/85 px-3 text-sm text-slate-700"
            >
              <option value="createdAt:desc">Newest first</option>
              <option value="createdAt:asc">Oldest first</option>
              <option value="name:asc">Name A–Z</option>
              <option value="name:desc">Name Z–A</option>
              <option value="lastLoginAt:desc">Recently signed in</option>
              <option value="lastLoginAt:asc">Longest since sign-in</option>
            </select>
          </div>

          {users.isLoading ? (
            <SkeletonRows rows={7} />
          ) : users.isError ? (
            <ErrorState message={errorMessage(users.error)} onRetry={() => users.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="No accounts match"
              message={
                search || role !== 'ALL' || status
                  ? 'Try a different search, role or status.'
                  : 'Add the first account to get started.'
              }
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto pb-1 lg:block">
                <table className="w-full min-w-[900px] border-separate border-spacing-y-2 text-left">
                  <thead>
                    <tr>
                      <SortHead label="Person" column="name" sort={sort} onSort={toggleSort} />
                      <th scope="col" className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Role</th>
                      <th scope="col" className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status</th>
                      <th scope="col" className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Security</th>
                      <SortHead label="Added" column="createdAt" sort={sort} onSort={toggleSort} />
                      <SortHead label="Last sign-in" column="lastLoginAt" sort={sort} onSort={toggleSort} />
                      <th scope="col" className="px-3 pb-1 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((u, index) => {
                      const tone = STATUS[u.status] ?? STATUS.pending;
                      const isSelf = me?.id === u.id;
                      const label = u.name || u.email;

                      return (
                        <tr key={u.id} className="group animate-rise" style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
                          <td className="rounded-l-2xl border-y border-l border-slate-100 bg-white/75 px-4 py-3.5 transition group-hover:bg-white">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white">
                                {initials(label)}
                              </span>
                              <div className="min-w-0">
                                <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-800">
                                  <span className={u.name ? '' : 'text-slate-500'}>{u.name || 'Awaiting setup'}</span>
                                  {isSelf ? <Badge tone="brand">You</Badge> : null}
                                </p>
                                <p className="truncate text-xs text-slate-500">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="border-y border-slate-100 bg-white/75 px-4 py-3.5 transition group-hover:bg-white">
                            <RoleBadge role={u.role} />
                          </td>
                          <td className="border-y border-slate-100 bg-white/75 px-4 py-3.5 transition group-hover:bg-white">
                            <div className="flex flex-wrap gap-1.5">
                              <Badge tone={tone.tone}>{tone.label}</Badge>
                              {u.locked ? <Badge tone="danger">Locked</Badge> : null}
                            </div>
                          </td>
                          <td className="border-y border-slate-100 bg-white/75 px-4 py-3.5 transition group-hover:bg-white">
                            <div className="flex flex-wrap gap-1.5">
                              {u.twoStepEnabled ? <Badge tone="success">2-step on</Badge> : <Badge tone="neutral">Password only</Badge>}
                              {u.mustChangePassword ? <Badge tone="warning">No password</Badge> : null}
                            </div>
                          </td>
                          <td className="whitespace-nowrap border-y border-slate-100 bg-white/75 px-4 py-3.5 text-xs text-slate-500 transition group-hover:bg-white">
                            {formatEthiopian(u.createdAt)}
                          </td>
                          <td className="whitespace-nowrap border-y border-slate-100 bg-white/75 px-4 py-3.5 text-xs text-slate-500 transition group-hover:bg-white">
                            {u.lastLoginAt ? formatEthiopian(u.lastLoginAt, { time: true }) : 'Never'}
                          </td>
                          <td className="rounded-r-2xl border-y border-r border-slate-100 bg-white/75 px-4 py-3.5 transition group-hover:bg-white">
                            <div className="flex justify-end">
                              {isSelf ? (
                                <Badge tone="neutral">Your account</Badge>
                              ) : (
                                <RowMenu items={actionsFor(u)} label={`Actions for ${label}`} />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 lg:hidden">
                {rows.map((u, index) => {
                  const tone = STATUS[u.status] ?? STATUS.pending;
                  const isSelf = me?.id === u.id;
                  const label = u.name || u.email;

                  return (
                    <div
                      key={u.id}
                      className="animate-rise rounded-2xl border border-slate-100 bg-white/80 p-4"
                      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white">
                          {initials(label)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-800">
                            {u.name || 'Awaiting setup'}
                            {isSelf ? <Badge tone="brand">You</Badge> : null}
                          </p>
                          <p className="truncate text-xs text-slate-500">{u.email}</p>
                        </div>
                        {isSelf ? <Badge tone="neutral">Your account</Badge> : <RowMenu items={actionsFor(u)} label={`Actions for ${label}`} />}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <RoleBadge role={u.role} />
                        <Badge tone={tone.tone}>{tone.label}</Badge>
                        {u.locked ? <Badge tone="danger">Locked</Badge> : null}
                        {u.twoStepEnabled ? <Badge tone="success">2-step on</Badge> : null}
                        {u.mustChangePassword ? <Badge tone="warning">No password</Badge> : null}
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                        <p>
                          Added <span className="font-medium text-slate-600">{formatEthiopian(u.createdAt)}</span>
                        </p>
                        <p className="text-right">
                          Last in{' '}
                          <span className="font-medium text-slate-600">
                            {u.lastLoginAt ? formatEthiopian(u.lastLoginAt) : 'Never'}
                          </span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Pagination
                page={users.data?.page ?? page}
                pages={users.data?.pages ?? 1}
                total={users.data?.total ?? 0}
                limit={limit}
                onPage={setPage}
                onLimit={(value) => {
                  setLimit(value);
                  setPage(1);
                }}
              />
            </>
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
              {ASSIGNABLE_ROLES.map((roleValue) => (
                <option key={roleValue} value={roleValue}>
                  {roleLabel(roleValue)}
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
              <option value="active">Active</option>
              <option value="disabled">Turned off</option>
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
