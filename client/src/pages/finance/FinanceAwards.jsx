import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Trophy,
  Search,
  RefreshCw,
  Plus,
  X,
  Trash2,
  ChevronRight,
  Medal,
  Banknote,
  Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { formatEthiopian } from '../../lib/ethiopianDate';

const PLACES = [
  { value: '1st', label: '1st Place', tone: 'amber' },
  { value: '2nd', label: '2nd Place', tone: 'slate' },
  { value: '3rd', label: '3rd Place', tone: 'orange' },
  { value: '4th', label: '4th Place', tone: 'neutral' },
];

const placeTone = (p) => PLACES.find((x) => x.value === p)?.tone || 'neutral';
const placeLabel = (p) => PLACES.find((x) => x.value === p)?.label || p;

export default function FinanceAwards() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  // Competition filter
  const [competitionFilter, setCompetitionFilter] = useState('');

  // Create form
  const [createOpen, setCreateOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const [pickedStudent, setPickedStudent] = useState(null);
  const [form, setForm] = useState({
    competition: '',
    place: '1st',
    amount: '',
    method: 'cash',
    proofUrl: '',
    notes: '',
  });

  const [deleting, setDeleting] = useState(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['finance', 'awards', { competitionFilter, page }],
    queryFn: async () => {
      const res = await api.get('/finance/awards', {
        params: { competition: competitionFilter || undefined, page, limit: 25 },
      });
      return res.data;
    },
  });

  // Student search
  const studentResults = useQuery({
    queryKey: ['finance', 'studentSearch', studentQuery],
    queryFn: async () => {
      const res = await api.get('/finance/students/search', { params: { q: studentQuery } });
      return res.data?.students || [];
    },
    enabled: createOpen && studentQuery.trim().length >= 2,
  });

  const resetCreate = () => {
    setCreateOpen(false);
    setStudentQuery('');
    setPickedStudent(null);
    setForm({ competition: '', place: '1st', amount: '', method: 'cash', proofUrl: '', notes: '' });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const studentId = pickedStudent?._id || pickedStudent?.id;
      const res = await api.post('/finance/awards', {
        student: studentId,
        competition: form.competition,
        place: form.place,
        amount: Math.round(Number(form.amount) * 100),
        amountEtb: form.amount,
        method: form.method,
        proofUrl: form.proofUrl || undefined,
        notes: form.notes || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Award payment recorded.');
      resetCreate();
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not record the award.')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await api.delete(`/finance/awards/${id}`);
    },
    onSuccess: () => {
      toast.success('Award record deleted.');
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not delete the record.')),
  });

  const awards = data?.awards || [];
  const competitions = data?.competitions || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Award Payments"
        subtitle="Student competition prizes and awards — place, amount, and payment method (cash or bank transfer with proof)."
        icon={Trophy}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Competition filter */}
          <div className="flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => {
                setCompetitionFilter('');
                setPage(1);
              }}
              className={`border-r border-slate-200 px-4 py-2.5 text-xs font-bold transition ${
                !competitionFilter ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              All Competitions
            </button>
            {competitions.map((c) => (
              <button
                key={c?.name || c}
                type="button"
                onClick={() => {
                  setCompetitionFilter(c?.name || c);
                  setPage(1);
                }}
                title={c?.name ? `${c.count} award(s) • ${Number(c.totalAmountEtb || 0).toFixed(2)} ETB total` : undefined}
                className={`max-w-[240px] flex items-center gap-2 truncate border-r border-slate-200 px-4 py-2.5 text-xs font-bold transition last:border-r-0 ${
                  competitionFilter === (c?.name || c) ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="truncate">{typeof c === 'string' ? c : c?.name}</span>
                {typeof c === 'object' && (
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      competitionFilter === (c?.name || c) ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {c?.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          <span>Record Award</span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Awards table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-6">
              <SkeletonRows rows={6} />
            </div>
          ) : !awards.length ? (
            <div className="p-10">
              <EmptyState
                icon={Trophy}
                title="No award payments recorded"
                message="Use “Record Award” to log a student's competition prize."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 pl-6 pr-4">Student</th>
                    <th className="py-3.5 px-4">Competition</th>
                    <th className="py-3.5 px-4">Place</th>
                    <th className="py-3.5 px-4">Amount</th>
                    <th className="py-3.5 px-4">Method</th>
                    <th className="py-3.5 px-4">Proof</th>
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {awards.map((a) => (
                    <tr key={a.id} className="transition hover:bg-slate-50/70">
                      <td className="py-3.5 pl-6 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                            {a.photoUrl ? (
                              <img src={a.photoUrl} alt={a.studentName} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-amber-50 text-xs font-bold text-amber-700">
                                {(a.studentName || 'S')[0]}
                              </div>
                            )}
                          </div>
                          <div>
                            <Link
                              to={`/accountant/collections/students/${a.student?._id || a.student}`}
                              className="flex items-center font-semibold text-slate-800 hover:text-brand-600"
                            >
                              {a.studentName}
                            </Link>
                            <p className="font-mono text-xs text-slate-400">
                              {a.studentId || '—'} {a.programme ? `• ${a.programme}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-semibold text-slate-700">{a.competition}</td>
                      <td className="py-3.5 px-4">
                        <Badge tone={placeTone(a.place)}>{placeLabel(a.place)}</Badge>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{a.amountEtb} ETB</td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <Banknote className={`h-3.5 w-3.5 ${a.method === 'transfer' ? 'text-sky-500' : 'text-emerald-500'}`} />
                          {a.method === 'transfer' ? 'Bank Transfer' : 'Cash'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {a.proofUrl ? (
                          <a
                            href={a.proofUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-600 hover:underline"
                          >
                            <Link2 className="h-3.5 w-3.5" /> View
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">{formatEthiopian(a.awardedAt || a.createdAt)}</td>
                      <td className="py-3.5 pr-6 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-600 hover:bg-rose-50"
                          onClick={() => setDeleting(a)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {data?.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: data.pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                p === page ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* CREATE AWARD */}
      <Modal open={createOpen} onClose={resetCreate} title="Record Award Payment">
        <div className="space-y-4">
          {!pickedStudent ? (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Step 1 — Find the student
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  autoFocus
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder="Search by student ID or name…"
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none"
                />
              </div>
              {studentQuery.trim().length >= 2 && (
                <div className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                  {studentResults.isLoading ? (
                    <p className="p-3 text-xs text-slate-400">Searching…</p>
                  ) : !studentResults.data?.length ? (
                    <p className="p-3 text-xs text-slate-400">No students match.</p>
                  ) : (
                    studentResults.data.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setPickedStudent(s);
                          setStudentQuery('');
                        }}
                        className="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50"
                      >
                        <div className="h-9 w-9 overflow-hidden rounded-lg bg-slate-100">
                          {s.photoUrl ? (
                            <img src={s.photoUrl} alt={s.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-bold text-brand-700">
                              {(s.name || 'S')[0]}
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                          <p className="font-mono text-[11px] text-slate-400">
                            {s.studentId} • {s.programme || s.department || '—'}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 overflow-hidden rounded-lg bg-slate-100">
                    {pickedStudent.photoUrl ? (
                      <img src={pickedStudent.photoUrl} alt={pickedStudent.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-brand-700">
                        {(pickedStudent.name || 'S')[0]}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{pickedStudent.name}</p>
                    <p className="font-mono text-[11px] text-slate-400">{pickedStudent.studentId}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPickedStudent(null)}>
                  <X className="h-3.5 w-3.5" />
                  <span>Change</span>
                </Button>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">Competition name</label>
                <input
                  value={form.competition}
                  onChange={(e) => setForm({ ...form, competition: e.target.value })}
                  placeholder="e.g. National Mathematics Olympiad"
                  required
                  className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 text-sm text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">Place</label>
                <div className="mt-1 grid grid-cols-4 gap-2">
                  {PLACES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setForm({ ...form, place: p.value })}
                      className={`flex items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-bold transition ${
                        form.place === p.value
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <Medal className="h-3.5 w-3.5" />
                      {p.value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600">Amount (ETB)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    required
                    className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 font-mono text-sm text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600">Method</label>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {['cash', 'transfer'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setForm({ ...form, method: m })}
                        className={`rounded-xl border px-2 py-2 text-xs font-bold capitalize transition ${
                          form.method === m
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {form.method === 'transfer' && (
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600">
                    Proof of transfer (link/upload URL)
                  </label>
                  <input
                    value={form.proofUrl}
                    onChange={(e) => setForm({ ...form, proofUrl: e.target.value })}
                    placeholder="https://drive.google.com/…"
                    className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 text-sm text-slate-800"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">Notes (optional)</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 text-sm text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" type="button" onClick={resetCreate}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-amber-500 text-white hover:bg-amber-600"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? 'Recording…' : 'Record Award'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>

      {/* DELETE CONFIRM */}
      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete Award Record">
        {deleting && (
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              Delete the award record for <strong>{deleting.studentName}</strong> — <strong>{deleting.competition}</strong>{' '}
              ({placeLabel(deleting.place)}, {deleting.amountEtb} ETB)? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                className="bg-rose-600 text-white hover:bg-rose-700"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleting.id)}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete Record'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
