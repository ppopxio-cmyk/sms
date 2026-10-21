import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ExternalLink, FolderOpen, Link2, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { formatEthiopian } from '../../lib/ethiopianDate';
import { classTitle, statusLabel } from '../../lib/teacher';
import { useDebounced } from '../../lib/useDebounced';
import ClassSelect from '../../components/teacher/ClassSelect';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card, { CardBody } from '../../components/ui/Card';
import FilterTabs from '../../components/ui/FilterTabs';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';
import { EmptyState, ErrorState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';

const EMPTY_FORM = {
  assignmentId: '',
  kind: 'note',
  title: '',
  description: '',
  content: '',
  url: '',
  visibility: 'draft',
};
const inputClass =
  'focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/85 px-3.5 text-sm text-slate-800 transition placeholder:text-slate-400';

export default function TeacherMaterials() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [visibility, setVisibility] = useState('all');
  const [assignmentId, setAssignmentId] = useState(params.get('assignmentId') || '');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const debounced = useDebounced(search);
  const queryClient = useQueryClient();

  const classes = useQuery({
    queryKey: ['teacher', 'classes', 'options'],
    queryFn: async () => (await api.get('/teacher/courses', { params: { status: 'all', limit: 100 } })).data,
  });

  const query = useQuery({
    queryKey: ['teacher', 'materials', { search: debounced, kind, visibility, assignmentId, page, limit }],
    queryFn: async () =>
      (
        await api.get('/teacher/materials', {
          params: {
            search: debounced || undefined,
            kind,
            visibility,
            assignmentId: assignmentId || undefined,
            page,
            limit,
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const assignments = classes.data?.assignments ?? [];
  const activeClasses = assignments.filter((row) => ['open', 'in_progress'].includes(row.status));
  const activeIds = useMemo(() => new Set(activeClasses.map((row) => row.id)), [activeClasses]);
  const materials = query.data?.materials ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0 };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['teacher', 'materials'] });
    queryClient.invalidateQueries({ queryKey: ['teacher', 'dashboard'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        kind: form.kind,
        title: form.title.trim(),
        description: form.description.trim(),
        content: form.kind === 'note' ? form.content.trim() : '',
        url: form.kind === 'link' ? form.url.trim() : '',
        visibility: form.visibility,
      };
      if (editingId) return (await api.patch(`/teacher/materials/${editingId}`, payload)).data;
      return (await api.post('/teacher/materials', { assignmentId: form.assignmentId, ...payload })).data;
    },
    onSuccess: () => {
      toast.success(editingId ? 'Material updated.' : 'Material saved.');
      setFormOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not save this material.')),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => (await api.delete(`/teacher/materials/${deleteTarget.id}`)).data,
    onSuccess: () => {
      toast.success('Material removed.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not remove this material.')),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      assignmentId: activeClasses.some((row) => row.id === assignmentId) ? assignmentId : activeClasses[0]?.id || '',
    });
    setFormOpen(true);
  };

  const openEdit = (material) => {
    setEditingId(material.id);
    setForm({
      assignmentId: material.assignmentId,
      kind: material.kind,
      title: material.title,
      description: material.description,
      content: material.content,
      url: material.url,
      visibility: material.visibility,
    });
    setFormOpen(true);
  };

  const submit = (event) => {
    event.preventDefault();
    if (!editingId && !form.assignmentId) return toast.error('Choose a class first.');
    if (form.title.trim().length < 2) return toast.error('Give this material a title.');
    if (form.kind === 'note' && !form.content.trim()) return toast.error('Write the note before saving it.');
    if (form.kind === 'link') {
      try {
        const parsed = new URL(form.url);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
      } catch {
        return toast.error('Use a complete http or https link.');
      }
    }
    return saveMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        eyebrow="Teaching"
        title="Materials"
        subtitle="Share a written note or a link with your classes. File uploads are not supported."
        actions={
          <Button onClick={openCreate} disabled={!activeClasses.length}>
            <Plus className="h-4 w-4" />
            New material
          </Button>
        }
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
            <SearchInput
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search title or description"
              loading={query.isFetching}
            />
            <ClassSelect
              assignments={assignments}
              value={assignmentId}
              allLabel="All my classes"
              label="Class"
              onChange={(value) => {
                setAssignmentId(value);
                setPage(1);
                if (value) setParams({ assignmentId: value });
                else setParams({});
              }}
            />
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <FilterTabs
              label="Material kind"
              value={kind}
              onChange={(next) => {
                setKind(next);
                setPage(1);
              }}
              tabs={[
                { key: 'all', label: 'All' },
                { key: 'note', label: 'Notes' },
                { key: 'link', label: 'Links' },
              ]}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="material-visibility">
                Visibility
              </label>
              <select
                id="material-visibility"
                value={visibility}
                onChange={(event) => {
                  setVisibility(event.target.value);
                  setPage(1);
                }}
                className="focus-ring h-10 rounded-xl border border-slate-200 bg-white/85 px-3 text-sm text-slate-700"
              >
                <option value="all">All visibility</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          {query.isError ? (
            <ErrorState message="We could not load materials." onRetry={query.refetch} />
          ) : query.isLoading ? (
            <SkeletonRows rows={5} />
          ) : !materials.length ? (
            <EmptyState
              icon={FolderOpen}
              title={search || kind !== 'all' || visibility !== 'all' || assignmentId ? 'No materials match these filters' : 'No materials yet'}
              message={
                activeClasses.length
                  ? 'Add a short note or a useful link for one of your classes.'
                  : 'Materials can be added once the registrar assigns you an active class.'
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {materials.map((material) => {
                const editable = activeIds.has(material.assignmentId);
                return (
                  <article key={material.id} className="flex flex-col rounded-2xl border border-slate-100 bg-white/70 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          material.kind === 'note' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'
                        }`}
                      >
                        {material.kind === 'note' ? <StickyNote className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}
                      </span>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Badge tone={material.kind === 'note' ? 'warning' : 'brand'}>{material.kind === 'note' ? 'Note' : 'Link'}</Badge>
                        <Badge tone={material.visibility === 'published' ? 'success' : 'neutral'}>{statusLabel(material.visibility)}</Badge>
                      </div>
                    </div>
                    <h2 className="mt-3 text-base font-semibold text-slate-900">{material.title}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {classTitle(material)}
                      {material.academicYear ? ` · ${material.academicYear}` : ''}
                    </p>
                    {material.description ? <p className="mt-2 text-sm leading-relaxed text-slate-600">{material.description}</p> : null}
                    {material.kind === 'note' ? (
                      <p className="thin-scroll mt-3 max-h-48 overflow-y-auto whitespace-pre-line rounded-xl bg-slate-50 px-3.5 py-3 text-sm leading-relaxed text-slate-600">
                        {material.content}
                      </p>
                    ) : (
                      <a
                        href={material.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="focus-ring mt-3 inline-flex items-center gap-1.5 break-all rounded-lg text-sm font-medium text-brand-600 hover:text-brand-800"
                      >
                        <ExternalLink className="h-4 w-4 shrink-0" />
                        <span className="truncate">{material.url}</span>
                      </a>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <p className="text-[11px] text-slate-400">
                        {material.updatedAt ? formatEthiopian(new Date(material.updatedAt)) : ''}
                      </p>
                      {editable ? (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(material)}
                            aria-label={`Edit ${material.title}`}
                            className="focus-ring rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(material)}
                            aria-label={`Remove ${material.title}`}
                            className="focus-ring rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <Badge tone="neutral">Read-only class</Badge>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {materials.length ? (
            <Pagination
              page={pagination.page}
              pages={pagination.pages}
              total={pagination.total}
              limit={limit}
              onPage={setPage}
              onLimit={(value) => {
                setLimit(value);
                setPage(1);
              }}
            />
          ) : null}
        </CardBody>
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit material' : 'New material'}
        subtitle={editingId ? classTitle(materials.find((row) => row.id === editingId)) : 'A note stays in the app; a link opens in a new tab.'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saveMutation.isPending}>
              {editingId ? 'Save changes' : 'Save material'}
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={submit}>
          {!editingId ? (
            <ClassSelect
              assignments={activeClasses}
              value={form.assignmentId}
              onChange={(value) => setForm((current) => ({ ...current, assignmentId: value }))}
              label="Class"
            />
          ) : null}
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Kind</p>
            <div className="flex gap-2">
              {[
                { key: 'note', label: 'Written note', icon: StickyNote },
                { key: 'link', label: 'Web link', icon: Link2 },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, kind: item.key }))}
                  className={`focus-ring inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition ${
                    form.kind === item.key
                      ? 'border-brand-200 bg-brand-50 text-brand-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="material-title">
              Title
            </label>
            <input
              id="material-title"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              maxLength={160}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="material-description">
              Short description (optional)
            </label>
            <textarea
              id="material-description"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              maxLength={1000}
              rows={2}
              className="focus-ring w-full rounded-xl border border-slate-200 bg-white/85 px-3.5 py-3 text-sm text-slate-800"
            />
          </div>
          {form.kind === 'note' ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="material-content">
                Note
              </label>
              <textarea
                id="material-content"
                value={form.content}
                onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                maxLength={5000}
                rows={6}
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white/85 px-3.5 py-3 text-sm text-slate-800"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="material-url">
                Link
              </label>
              <input
                id="material-url"
                type="url"
                value={form.url}
                onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                placeholder="https://"
                maxLength={2000}
                className={inputClass}
              />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="material-state">
              Visibility
            </label>
            <select
              id="material-state"
              value={form.visibility}
              onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value }))}
              className={inputClass}
            >
              <option value="draft">Draft — not shared yet</option>
              <option value="published">Published — shared with the class</option>
            </select>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Remove this material?"
        subtitle={deleteTarget?.title}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => deleteMutation.mutate()} loading={deleteMutation.isPending}>
              Remove material
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-slate-600">
          The material will disappear from your list. This is a soft delete, so no student record or mark is affected.
        </p>
      </Modal>
    </div>
  );
}
