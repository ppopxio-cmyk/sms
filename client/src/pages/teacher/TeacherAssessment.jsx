import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  Award,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  LockKeyhole,
  Pencil,
  Save,
  Send,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import {
  assessmentTypeLabel,
  classTitle,
  displayDate,
  errorCode,
  statusLabel,
  statusTone,
} from '../../lib/teacher';
import { useDebounced } from '../../lib/useDebounced';
import EthiopianDateField from '../../components/teacher/EthiopianDateField';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import TeacherAssessmentPortal from '../../components/teacher/TeacherAssessmentPortal';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import FilterTabs from '../../components/ui/FilterTabs';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';
import { EmptyState, ErrorState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';
import StatCard from '../../components/ui/StatCard';

const TYPES = ['quiz', 'assignment', 'project', 'midterm', 'final', 'practical', 'presentation', 'other'];
const inputClass =
  'focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/85 px-3.5 text-sm text-slate-800 transition placeholder:text-slate-400';

const gradeValue = (value) => (value === null || value === undefined ? '' : String(value));
const round = (value) => (value === null || value === undefined ? '—' : Math.round(Number(value) * 100) / 100);

export default function TeacherAssessment() {
  const { assessmentId } = useParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [draft, setDraft] = useState({ key: '', values: {} });
  const [confirmAction, setConfirmAction] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [tab, setTab] = useState('marks');
  const debounced = useDebounced(search);
  const queryClient = useQueryClient();

  const queryKey = ['teacher', 'gradebook', assessmentId, { search: debounced, page, limit }];
  const query = useQuery({
    queryKey,
    queryFn: async () =>
      (
        await api.get(`/teacher/assessments/${assessmentId}/grades`, {
          params: { search: debounced || undefined, page, limit },
        })
      ).data,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const rows = useMemo(() => query.data?.rows ?? [], [query.data?.rows]);
  const assessment = query.data?.assessment;
  const summary = query.data?.summary ?? {};
  const baseScores = useMemo(
    () => Object.fromEntries(rows.map((row) => [row.id, gradeValue(row.score)])),
    [rows],
  );
  const dataKey = useMemo(() => rows.map((row) => `${row.id}:${row.score ?? ''}`).join('|'), [rows]);
  const scores = draft.key === dataKey ? draft.values : baseScores;
  const dirty = useMemo(
    () => rows.some((row) => (scores[row.id] ?? '') !== baseScores[row.id]),
    [rows, scores, baseScores],
  );

  const enteredNow = useMemo(
    () => rows.filter((row) => scores[row.id] !== '' && scores[row.id] !== undefined && scores[row.id] !== null).length,
    [rows, scores],
  );

  const changePage = (next) => {
    if (dirty) {
      toast.info('Save or discard your marks before leaving this page.');
      return;
    }
    setPage(next);
  };

  const saveMutation = useMutation({
    mutationFn: async () =>
      (
        await api.put(`/teacher/assessments/${assessmentId}/grades`, {
          results: rows
            .filter((row) => (scores[row.id] ?? '') !== '' || baseScores[row.id] !== '')
            .map((row) => ({
              studentId: row.id,
              score: scores[row.id] === '' || scores[row.id] === undefined ? null : Number(scores[row.id]),
              feedback: '',
            })),
        })
      ).data,
    onSuccess: async (data) => {
      toast.success(`Marks saved. ${data.missing} still missing.`);
      setDraft({ key: '', values: {} });
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'gradebook', assessmentId] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'assessments'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'dashboard'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not save these marks.')),
  });

  const actionMutation = useMutation({
    mutationFn: async (action) => (await api.post(`/teacher/assessments/${assessmentId}/${action}`)).data,
    onSuccess: async (data, action) => {
      setConfirmAction('');
      toast.success(
        action === 'publish'
          ? 'Assessment published. You can now enter and submit marks.'
          : action === 'close'
            ? 'Assessment closed for changes.'
            : 'Marks submitted. This assessment is now locked.',
      );
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'gradebook', assessmentId] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'assessments'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'class', data.assignmentId] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'dashboard'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not complete that action.')),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: editForm.title.trim(),
        type: editForm.type,
        weight: Number(editForm.weight || 0),
        dueDate: editForm.dueDate || null,
        instructions: editForm.instructions.trim(),
      };
      if (assessment?.status === 'draft') payload.maxScore = Number(editForm.maxScore);
      return (await api.patch(`/teacher/assessments/${assessmentId}`, payload)).data;
    },
    onSuccess: async () => {
      setEditOpen(false);
      toast.success('Assessment updated.');
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'gradebook', assessmentId] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'assessments'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not update this assessment.')),
  });

  const setScore = (studentId, value) => {
    setDraft((current) => {
      const values = current.key === dataKey ? current.values : baseScores;
      return { key: dataKey, values: { ...values, [studentId]: value } };
    });
  };

  const save = () => {
    for (const row of rows) {
      const value = scores[row.id];
      if (value === '' || value === undefined || value === null) continue;
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > assessment.maxScore) {
        toast.error(`Enter a score between 0 and ${assessment.maxScore} for ${row.name}.`);
        return;
      }
      if (Math.abs(numeric * 100 - Math.round(numeric * 100)) > 1e-9) {
        toast.error('Use at most two decimal places.');
        return;
      }
    }
    saveMutation.mutate();
  };

  const openEdit = () => {
    setEditForm({
      title: assessment.title,
      type: assessment.type,
      maxScore: String(assessment.maxScore),
      weight: String(assessment.weight),
      dueDate: assessment.dueDate ? String(assessment.dueDate).slice(0, 10) : '',
      instructions: assessment.instructions || '',
    });
    setEditOpen(true);
  };

  if (query.isLoading) return <SkeletonRows rows={8} />;

  if (query.isError) {
    const competency = errorCode(query.error) === 'COMPETENCY_CONFIG_REQUIRED';
    return (
      <div className="space-y-6">
        <TeacherPageHeader backTo="/teacher/assessments" eyebrow="Assessment" title={competency ? 'Competency assessment' : 'Gradebook'} />
        {competency ? (
          <Alert tone="warning" title="Configuration required">
            This class uses competency assessment. The institution has not configured its competency scales or passing rules, so raw marks cannot be
            entered here.
          </Alert>
        ) : (
          <Card>
            <ErrorState
              message={query.error?.response?.data?.message || 'We could not load this assessment.'}
              onRetry={query.refetch}
            />
          </Card>
        )}
      </div>
    );
  }

  const canEdit = Boolean(assessment.canEdit);
  const canSubmit = canEdit && !dirty && ['published', 'closed'].includes(assessment.status) && assessment.missing === 0;
  const submitted = assessment.status === 'submitted';
  const actionCopy = {
    publish: {
      title: 'Publish this assessment?',
      body: 'Publishing opens the mark column for entering and saving scores. The maximum score is fixed after publishing.',
      button: 'Publish assessment',
    },
    close: {
      title: 'Close this assessment?',
      body: 'Closing marks the assessment as finished. You can still enter missing marks and submit it afterwards.',
      button: 'Close assessment',
    },
    submit: {
      title: 'Submit these marks?',
      body: 'Every student has a score. Submitting locks this assessment and its marks permanently in your workspace.',
      button: 'Submit marks',
    },
  }[confirmAction];
  const tabBar = (
    <FilterTabs
      label="Assessment workspace"
      value={tab}
      onChange={setTab}
      tabs={[
        { key: 'marks', label: 'Marks' },
        { key: 'portal', label: 'Public portal' },
        { key: 'submissions', label: 'Student submissions', count: assessment.submissionCount || undefined },
      ]}
    />
  );

  if (tab !== 'marks') {
    return (
      <div className="space-y-6">
        <TeacherPageHeader
          backTo="/teacher/assessments"
          eyebrow="Assessment"
          title={assessment.title}
          subtitle={`${classTitle(assessment)}${assessment.academicYear ? ` · ${assessment.academicYear}` : ''}`}
        />
        {tabBar}
        <TeacherAssessmentPortal assessmentId={assessmentId} maxScore={assessment.maxScore} section={tab} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        backTo="/teacher/assessments"
        eyebrow="Assessment"
        title={assessment.title}
        subtitle={`${classTitle(assessment)}${assessment.academicYear ? ` · ${assessment.academicYear}` : ''}${assessment.term ? ` · ${assessment.term}` : ''}`}
        actions={
          <>
            {canEdit && !submitted ? (
              <Button variant="secondary" onClick={openEdit}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            ) : null}
            {canEdit && assessment.status === 'draft' ? (
              <Button variant="secondary" onClick={() => setConfirmAction('publish')}>
                Publish
              </Button>
            ) : null}
            {canEdit && assessment.status === 'published' ? (
              <Button variant="secondary" onClick={() => setConfirmAction('close')}>
                Close
              </Button>
            ) : null}
            {canEdit && ['published', 'closed'].includes(assessment.status) ? (
              <Button onClick={() => setConfirmAction('submit')} disabled={!canSubmit}>
                <Send className="h-4 w-4" />
                Submit marks
              </Button>
            ) : null}
          </>
        }
      />

      {tabBar}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(assessment.status)}>{statusLabel(assessment.status)}</Badge>
        <Badge tone="neutral">{assessmentTypeLabel(assessment.type)}</Badge>
        <Badge tone="neutral">Max {assessment.maxScore}</Badge>
        <Badge tone="neutral">Weight {assessment.weight}%</Badge>
        {assessment.dueDate ? <Badge tone="brand">Due {displayDate(String(assessment.dueDate).slice(0, 10))}</Badge> : null}
        {submitted ? (
          <Badge tone="success">
            <LockKeyhole className="h-3.5 w-3.5" />
            Locked
          </Badge>
        ) : null}
      </div>

      {canEdit && ['published', 'closed'].includes(assessment.status) && assessment.missing > 0 ? (
        <p className="text-xs font-medium text-amber-700">
          {assessment.missing} student{assessment.missing === 1 ? '' : 's'} still have no score. Enter every score before submitting.
        </p>
      ) : null}
      {canEdit && ['published', 'closed'].includes(assessment.status) && dirty ? (
        <p className="text-xs font-medium text-amber-700">Save or discard your unsaved marks before submitting.</p>
      ) : null}

      {assessment.instructions ? (
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Instructions</p>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">{assessment.instructions}</p>
          </CardBody>
        </Card>
      ) : null}

      {submitted ? (
        <Alert tone="success" title="These marks are submitted">
          The assessment is locked. Submitted raw scores are available in Reports and cannot be edited from this workspace.
        </Alert>
      ) : !canEdit ? (
        <Alert tone="info" title="This class is read-only">
          The registrar has closed this class for changes, so its marks can be viewed but not edited.
        </Alert>
      ) : assessment.status === 'draft' ? (
        <Alert tone="info" title="This assessment is still a draft">
          You can enter scores now, but publish the assessment before submitting its marks.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ClipboardCheck} label="Marks entered" value={summary.entered ?? 0} hint={`of ${summary.total ?? 0} students`} tone="emerald" />
        <StatCard icon={TriangleAlert} label="Missing" value={summary.missing ?? 0} tone="amber" />
        <StatCard icon={Award} label="Average raw score" value={round(summary.average)} hint={`out of ${assessment.maxScore}`} tone="violet" />
        <StatCard icon={CheckCircle2} label="Highest" value={round(summary.highest)} tone="indigo" />
      </div>

      <Card>
        <CardHeader
          title="Gradebook"
          subtitle="Raw scores only. The total is not converted into a GPA, letter grade or pass mark."
          icon={ClipboardList}
          action={
            <div className="w-56 max-w-full">
              <SearchInput
                value={search}
                onChange={(event) => {
                  if (dirty) {
                    toast.info('Save or discard your marks before searching.');
                    return;
                  }
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Find a student"
                loading={query.isFetching}
                id="gradebook-search"
              />
            </div>
          }
        />
        <CardBody className="space-y-4">
          {!rows.length ? (
            <EmptyState
              icon={ClipboardList}
              title={search ? 'No students match that search' : 'No students registered'}
              message={search ? 'Try another name or student ID.' : 'The registrar has not registered any students in this class.'}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="pb-3 pr-4">Student</th>
                      <th className="pb-3 pr-4">Student ID</th>
                      <th className="pb-3 pr-4">Programme</th>
                      <th className="pb-3 text-right">Score / {assessment.maxScore}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td className="py-2.5 pr-4">
                          <Link to={`/teacher/students/${row.id}`} className="font-medium text-slate-800 hover:text-brand-700">
                            {row.name}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-xs text-slate-500">{row.studentNumber || '—'}</td>
                        <td className="py-2.5 pr-4 text-xs text-slate-500">{row.program || '—'}</td>
                        <td className="py-2.5 text-right">
                          <input
                            type="number"
                            aria-label={`Score for ${row.name}`}
                            value={scores[row.id] ?? ''}
                            disabled={!canEdit}
                            min="0"
                            max={assessment.maxScore}
                            step="0.01"
                            onChange={(event) => setScore(row.id, event.target.value)}
                            placeholder="—"
                            className="focus-ring h-9 w-28 rounded-lg border border-slate-200 bg-white px-2.5 text-right font-mono text-sm text-slate-800 disabled:bg-slate-50 disabled:text-slate-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="space-y-2 md:hidden">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white/70 p-3.5">
                    <div className="min-w-0">
                      <Link to={`/teacher/students/${row.id}`} className="truncate text-sm font-semibold text-slate-800">
                        {row.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">{row.studentNumber || 'No student ID'}</p>
                    </div>
                    <input
                      type="number"
                      aria-label={`Score for ${row.name}`}
                      value={scores[row.id] ?? ''}
                      disabled={!canEdit}
                      min="0"
                      max={assessment.maxScore}
                      step="0.01"
                      onChange={(event) => setScore(row.id, event.target.value)}
                      placeholder="—"
                      className="focus-ring h-10 w-24 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-right font-mono text-sm disabled:bg-slate-50"
                    />
                  </li>
                ))}
              </ul>
            </>
          )}

          <Pagination
            page={query.data.pagination.page}
            pages={query.data.pagination.pages}
            total={query.data.pagination.total}
            limit={limit}
            onPage={changePage}
            onLimit={(value) => {
              if (dirty) {
                toast.info('Save or discard your marks before changing the page size.');
                return;
              }
              setLimit(value);
              setPage(1);
            }}
          />

          {canEdit && rows.length ? (
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                {dirty ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-amber-600">
                    <TriangleAlert className="h-3.5 w-3.5" />
                    Unsaved changes on this page
                  </span>
                ) : (
                  `${enteredNow} of ${rows.length} scores on this page are filled.`
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={!dirty || saveMutation.isPending}
                  onClick={() => {
                    setDraft({ key: '', values: {} });
                    toast.info('Unsaved changes discarded.');
                  }}
                >
                  <Undo2 className="h-4 w-4" />
                  Discard
                </Button>
                <Button onClick={save} loading={saveMutation.isPending} disabled={!dirty}>
                  <Save className="h-4 w-4" />
                  Save marks
                </Button>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Modal
        open={Boolean(confirmAction)}
        onClose={() => setConfirmAction('')}
        title={actionCopy?.title}
        subtitle={assessment.title}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmAction('')}>
              Cancel
            </Button>
            <Button
              onClick={() => actionMutation.mutate(confirmAction)}
              loading={actionMutation.isPending}
              variant={confirmAction === 'submit' ? 'primary' : 'secondary'}
            >
              {actionCopy?.button}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-slate-600">{actionCopy?.body}</p>
        {confirmAction === 'submit' ? (
          <p className="mt-3 text-xs font-medium text-slate-500">
            {summary.total} student{summary.total === 1 ? '' : 's'} · {summary.entered} score{summary.entered === 1 ? '' : 's'} entered
          </p>
        ) : null}
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit assessment"
        subtitle="The server will reject a title that already has marks under it."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => editMutation.mutate()} loading={editMutation.isPending}>
              Save changes
            </Button>
          </>
        }
      >
        {editForm ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              editMutation.mutate();
            }}
          >
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="edit-assessment-title">
                Title
              </label>
              <input
                id="edit-assessment-title"
                value={editForm.title}
                onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                className={inputClass}
                maxLength={160}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="edit-assessment-type">
                  Type
                </label>
                <select
                  id="edit-assessment-type"
                  value={editForm.type}
                  onChange={(event) => setEditForm((current) => ({ ...current, type: event.target.value }))}
                  className={inputClass}
                >
                  {TYPES.map((value) => (
                    <option key={value} value={value}>
                      {assessmentTypeLabel(value)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="edit-assessment-max">
                  Maximum score
                </label>
                <input
                  id="edit-assessment-max"
                  type="number"
                  min="0.01"
                  max="1000"
                  step="0.01"
                  value={editForm.maxScore}
                  disabled={assessment.status !== 'draft'}
                  onChange={(event) => setEditForm((current) => ({ ...current, maxScore: event.target.value }))}
                  className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`}
                />
                {assessment.status !== 'draft' ? <p className="mt-1 text-[11px] text-slate-400">Fixed after publishing.</p> : null}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="edit-assessment-weight">
                  Weight (%)
                </label>
                <input
                  id="edit-assessment-weight"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={editForm.weight}
                  onChange={(event) => setEditForm((current) => ({ ...current, weight: event.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            <EthiopianDateField
              label="Due date (optional)"
              value={editForm.dueDate}
              max={null}
              allowEmpty
              onChange={(value) => setEditForm((current) => ({ ...current, dueDate: value }))}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="edit-assessment-instructions">
                Instructions (optional)
              </label>
              <textarea
                id="edit-assessment-instructions"
                value={editForm.instructions}
                onChange={(event) => setEditForm((current) => ({ ...current, instructions: event.target.value }))}
                maxLength={2000}
                rows={3}
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white/85 px-3.5 py-3 text-sm text-slate-800"
              />
            </div>
          </form>
        ) : null}
      </Modal>

      <p className="text-xs text-slate-400">
        Looking for another assessment?{' '}
        <Link to="/teacher/assessments" className="font-semibold text-brand-600 hover:text-brand-800">
          Back to assessments
        </Link>
      </p>
    </div>
  );
}
