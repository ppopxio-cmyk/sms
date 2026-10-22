import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Eye, History, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { REGISTRAR, displayDateTime, humanStatus } from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import { FormGrid, SelectField } from '../../components/registrar/Fields';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import { ErrorState } from '../../components/ui/StatePanel';
import { Skeleton } from '../../components/ui/Skeleton';

const REPEAT_POLICIES = [
  { value: 'all', label: 'All attempts count' },
  { value: 'best', label: 'Best attempt counts' },
  { value: 'latest', label: 'Latest attempt counts' },
];

const blankBand = () => ({ min: 0, max: 100, letter: '', points: 0, pass: true });

export default function RegistrarGradingPolicy() {
  const queryClient = useQueryClient();
  const [bands, setBands] = useState([]);
  const [repeatPolicy, setRepeatPolicy] = useState('all');
  const [rounding, setRounding] = useState(2);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState([]);
  const [previewMarks, setPreviewMarks] = useState('85, 70, 55, 40, 20');

  const policy = useQuery({
    queryKey: ['registrar', 'grading-policy'],
    queryFn: async () => (await api.get(`${REGISTRAR}/grading-policy`)).data,
  });

  const historyQuery = useQuery({
    queryKey: ['registrar', 'grading-policy-history'],
    queryFn: async () => (await api.get(`${REGISTRAR}/grading-policy/history`)).data,
    retry: false,
  });

  useEffect(() => {
    const data = policy.data;
    if (!data || data.unconfigured) return;
    setBands((data.bands || []).map((band) => ({ ...band })));
    setRepeatPolicy(data.repeatPolicy || 'all');
    setRounding(data.rounding ?? 2);
  }, [policy.data]);

  // The bands are checked in the browser for immediate feedback, but the server is the
  // authority: it refuses overlapping, gapped or out-of-range bands.
  const localErrors = useMemo(() => {
    const found = [];
    if (!bands.length) return ['Add at least one grade band.'];
    const sorted = [...bands].sort((a, b) => Number(a.min) - Number(b.min));
    if (Number(sorted[0].min) !== 0) found.push('The first band must start at 0.');
    if (Number(sorted[sorted.length - 1].max) !== 100) found.push('The last band must end at 100.');
    sorted.forEach((band, index) => {
      if (!String(band.letter || '').trim()) found.push(`Band ${index + 1} needs a grade label.`);
      if (!Number.isInteger(Number(band.min)) || !Number.isInteger(Number(band.max))) {
        found.push(`Band ${index + 1} boundaries must be whole numbers.`);
      }
      if (Number(band.max) < Number(band.min)) found.push(`Band ${index + 1} has a maximum below its minimum.`);
      if (index > 0 && Number(band.min) !== Number(sorted[index - 1].max) + 1) {
        found.push(`Band ${index + 1} must start one mark after band ${index} ends.`);
      }
    });
    return found;
  }, [bands]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        bands: bands.map((band) => ({
          min: Number(band.min),
          max: Number(band.max),
          letter: String(band.letter).trim().toUpperCase(),
          points: Number(band.points),
          pass: Boolean(band.pass),
        })),
        repeatPolicy,
        rounding: Number(rounding),
        reason: reason.trim() || undefined,
      };
      return (await api.patch(`${REGISTRAR}/grading-policy`, payload)).data;
    },
    onSuccess: (data) => {
      toast.success(data.changed ? 'Grading policy saved.' : 'Nothing changed — the policy is already up to date.');
      setReason('');
      setErrors([]);
      queryClient.invalidateQueries({ queryKey: ['registrar', 'grading-policy'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'grading-policy-history'] });
    },
    onError: (err) => {
      const message = errorMessage(err, 'The grading policy could not be saved.');
      setErrors([message]);
      toast.error(message);
    },
  });

  const preview = useMutation({
    mutationFn: async () => {
      const marks = previewMarks
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value));
      if (!marks.length) throw new Error('Enter at least one mark to preview.');
      return (await api.post(`${REGISTRAR}/grading-policy/preview`, { marks })).data;
    },
  });

  const setBand = (index, field, value) => {
    setBands((current) => current.map((band, position) => (position === index ? { ...band, [field]: value } : band)));
  };

  const addBand = () => {
    setBands((current) => {
      const last = current[current.length - 1];
      const start = last ? Math.min(100, Number(last.max) + 1) : 0;
      return [...current, { ...blankBand(), min: start, max: 100 }];
    });
  };

  const removeBand = (index) => {
    setBands((current) => current.filter((_, position) => position !== index));
  };

  const reset = () => {
    const data = policy.data;
    if (!data || data.unconfigured) return;
    setBands((data.bands || []).map((band) => ({ ...band })));
    setRepeatPolicy(data.repeatPolicy || 'all');
    setRounding(data.rounding ?? 2);
    setErrors([]);
  };

  const unconfigured = policy.data?.unconfigured;

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Grading policy"
        subtitle="The grade bands, grade points and pass rule used for every mark, GPA and CGPA in the college. The server is the only authority: results record the policy version they were graded under."
        actions={
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={localErrors.length > 0} className="gap-2">
            <Save className="h-4 w-4" /> Save policy
          </Button>
        }
      />

      {policy.isLoading ? (
        <Card><CardBody><Skeleton className="h-64 w-full" /></CardBody></Card>
      ) : policy.error ? (
        <Card>
          <CardBody>
            <ErrorState message={policy.error?.response?.data?.message || 'The grading policy could not be loaded.'} onRetry={policy.refetch} />
          </CardBody>
        </Card>
      ) : unconfigured ? (
        <Card>
          <CardHeader title="No grading policy configured" icon={AlertTriangle} />
          <CardBody className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
              <p className="font-semibold">The college grading policy is not configured yet.</p>
              <p className="mt-1">
                Marks cannot be graded, and no GPA or CGPA can be issued, until the approved grade
                bands are entered here. No default bands are applied automatically: the values must
                come from the college&apos;s approved policy.
              </p>
            </div>
            <p className="text-sm text-slate-600">
              Add the first band below and save. Each band needs a mark range, a grade label, the
              grade points and whether it counts as a pass.
            </p>
            {bands.length === 0 ? (
              <Button onClick={addBand} className="gap-2"><Plus className="h-4 w-4" /> Add first band</Button>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Grade bands"
          subtitle="Enter published boundaries as 0–30, 31–40, 41–50 and so on. Bands must cover 0 to 100 with no gaps and no overlaps."
          icon={CheckCircle2}
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={reset} disabled={save.isPending}><RotateCcw className="h-3.5 w-3.5" /> Reset</Button>
              <Button size="sm" variant="secondary" onClick={addBand}><Plus className="h-3.5 w-3.5" /> Add band</Button>
            </div>
          }
        />
        <CardBody className="space-y-4">
          {bands.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No grade bands yet. Add one to begin.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="hidden grid-cols-12 gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:grid">
                <div className="col-span-2">From</div>
                <div className="col-span-2">To</div>
                <div className="col-span-3">Grade</div>
                <div className="col-span-2">Points</div>
                <div className="col-span-2">Pass</div>
                <div className="col-span-1" />
              </div>
              {bands.map((band, index) => (
                <div key={index} className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-100 p-3 sm:grid-cols-12 sm:items-end">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs text-slate-500 sm:hidden">From</label>
                    <Field
                      type="number"
                      min="0"
                      max="100"
                      value={band.min}
                      onChange={(event) => setBand(index, 'min', event.target.value)}
                      aria-label={`Band ${index + 1} minimum mark`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs text-slate-500 sm:hidden">To</label>
                    <Field
                      type="number"
                      min="0"
                      max="100"
                      value={band.max}
                      onChange={(event) => setBand(index, 'max', event.target.value)}
                      aria-label={`Band ${index + 1} maximum mark`}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-xs text-slate-500 sm:hidden">Grade</label>
                    <Field
                      value={band.letter}
                      onChange={(event) => setBand(index, 'letter', event.target.value)}
                      placeholder="A"
                      maxLength={10}
                      aria-label={`Band ${index + 1} grade label`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs text-slate-500 sm:hidden">Points</label>
                    <Field
                      type="number"
                      min="0"
                      max="4"
                      step="0.05"
                      value={band.points}
                      onChange={(event) => setBand(index, 'points', event.target.value)}
                      aria-label={`Band ${index + 1} grade points`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs text-slate-500 sm:hidden">Pass</label>
                    <SelectField
                      value={band.pass ? 'pass' : 'fail'}
                      onChange={(event) => setBand(index, 'pass', event.target.value === 'pass')}
                      aria-label={`Band ${index + 1} pass rule`}
                    >
                      <option value="pass">Pass</option>
                      <option value="fail">Fail</option>
                    </SelectField>
                  </div>
                  <div className="flex justify-end sm:col-span-1">
                    <button
                      type="button"
                      onClick={() => removeBand(index)}
                      className="focus-ring rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`Remove band ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {localErrors.length ? (
            <ul className="space-y-1 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {localErrors.map((message) => <li key={message}>{message}</li>)}
            </ul>
          ) : null}
          {errors.length ? (
            <ul className="space-y-1 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {errors.map((message) => <li key={message}>{message}</li>)}
            </ul>
          ) : null}

          <FormGrid>
            <SelectField label="Repeat policy" value={repeatPolicy} onChange={(event) => setRepeatPolicy(event.target.value)} hint="How a repeated course counts towards GPA.">
              {REPEAT_POLICIES.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}
            </SelectField>
            <Field
              label="GPA rounding"
              type="number"
              min="0"
              max="4"
              value={rounding}
              onChange={(event) => setRounding(event.target.value)}
              hint="Decimal places kept in GPA and CGPA."
            />
          </FormGrid>

          <Field
            label="Reason for this change"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Approved by the academic board, 2018 EC"
            maxLength={1000}
            hint="Stored with the change in the audit trail."
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Preview" subtitle="See how a sample of marks will be graded under the saved policy." icon={Eye} />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field
                label="Sample marks"
                value={previewMarks}
                onChange={(event) => setPreviewMarks(event.target.value)}
                placeholder="85, 70, 55, 40"
                hint="Comma separated. Each mark must be between 0 and 100."
              />
            </div>
            <div className="flex items-end">
              <Button variant="secondary" onClick={() => preview.mutate()} loading={preview.isPending} className="gap-2 w-full">
                <Eye className="h-4 w-4" /> Preview grading
              </Button>
            </div>
          </div>

          {preview.error ? (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage(preview.error, 'The preview could not be produced.')}</p>
          ) : null}

          {preview.data?.results?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Mark</th>
                    <th className="px-3 py-2 font-semibold">Grade</th>
                    <th className="px-3 py-2 font-semibold">Points</th>
                    <th className="px-3 py-2 font-semibold">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {preview.data.results.map((row, index) => (
                    <tr key={`${row.mark}-${index}`}>
                      <td className="px-3 py-2 font-semibold tabular-nums text-slate-800">{row.mark}</td>
                      <td className="px-3 py-2 text-slate-700">{row.letter ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-700">{row.points ?? '—'}</td>
                      <td className="px-3 py-2">
                        {row.error ? (
                          <span className="text-rose-600">{row.error}</span>
                        ) : row.pass ? (
                          <Badge tone="success">Pass</Badge>
                        ) : (
                          <Badge tone="danger">Fail</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Change history" subtitle="Every saved change to the grading policy, newest first." icon={History} />
        <CardBody>
          {historyQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !historyQuery.data?.entries?.length ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No change has been recorded yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {historyQuery.data.entries.map((row) => (
                <li key={row._id} className="rounded-2xl border border-slate-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800">{row.meta?.reason || 'Grading policy updated'}</p>
                    <p className="text-xs text-slate-400">{displayDateTime(row.createdAt)}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.meta?.bands ?? '—'} bands · repeat policy {humanStatus(row.meta?.repeatPolicy || 'all')} · rounding {row.meta?.rounding ?? '—'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
