import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { api } from '../../lib/api';
import { REGISTRAR } from '../../lib/registrar';
import { ErrorState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';

const INK = '#14231F';
const FOREST = '#1F5A4A';
const MOSS = '#5B8C7A';
const BRASS = '#B68A3A';
const PLUM = '#8E5B7C';
const FAIL = '#A64B42';
const LINE = '#DCE5DF';

const GRADE_ORDER = {
  'A+': 0,
  A: 1,
  'A-': 2,
  'B+': 3,
  B: 4,
  'B-': 5,
  'C+': 6,
  C: 7,
  'C-': 8,
  'D+': 9,
  D: 10,
  'D-': 11,
  F: 12,
};

const gradeColor = (letter) => {
  if (letter?.startsWith('A')) return FOREST;
  if (letter?.startsWith('B')) return MOSS;
  if (letter?.startsWith('C')) return BRASS;
  if (letter?.startsWith('D')) return PLUM;
  return FAIL;
};

const mark = (value) => (value === null || value === undefined ? '—' : Number(value).toFixed(1));
const pass = (value) => (value === null || value === undefined ? '—' : `${Number(value).toFixed(1)}%`);

const filterClass =
  'focus-ring h-10 w-full rounded-md border border-[#DCE5DF] bg-white px-3 text-sm text-[#14231F] outline-none transition hover:border-[#B9C9BF]';

function Filter({ label, value, onChange, children }) {
  return (
    <label className="min-w-0">
      <span className="mb-1.5 block text-xs font-medium text-[#5E756B]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={filterClass}>
        {children}
      </select>
    </label>
  );
}

function Metric({ label, value, hint, filled = false }) {
  return (
    <div className={`px-5 py-5 ${filled ? 'text-white' : 'text-[#14231F]'}`} style={filled ? { backgroundColor: FOREST } : undefined}>
      <p className={`text-sm ${filled ? 'text-white/70' : 'text-[#5E756B]'}`}>{label}</p>
      <p className="mt-2 text-4xl font-semibold tabular-nums tracking-[-0.045em]">{value}</p>
      <p className={`mt-2 text-xs ${filled ? 'text-white/65' : 'text-[#7A8D84]'}`}>{hint}</p>
    </div>
  );
}

function SectionHeading({ title, note }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b pb-3" style={{ borderColor: LINE }}>
      <h2 className="font-serif text-2xl tracking-[-0.025em]" style={{ color: INK }}>{title}</h2>
      {note ? <p className="max-w-xl text-sm text-[#5E756B]">{note}</p> : null}
    </div>
  );
}

function GradeDistribution({ rows = [] }) {
  const ordered = useMemo(
    () => [...rows].sort((a, b) => (GRADE_ORDER[a.letter] ?? 99) - (GRADE_ORDER[b.letter] ?? 99)),
    [rows],
  );
  const peak = Math.max(1, ...ordered.map((row) => row.count));

  if (!ordered.length) {
    return <p className="py-14 text-sm text-[#5E756B]">Publish final grades to see the distribution.</p>;
  }

  return (
    <div>
      <div className="flex h-56 items-end gap-2 border-b pb-0" style={{ borderColor: LINE }}>
        {ordered.map((row) => (
          <div key={row.letter} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
            <span className="text-xs font-semibold tabular-nums text-[#5E756B]">{row.count}</span>
            <div
              className="w-full max-w-14 rounded-t-[3px] transition-[height] duration-700 motion-reduce:transition-none"
              style={{
                height: `${Math.max(5, (row.count / peak) * 170)}px`,
                backgroundColor: gradeColor(row.letter),
              }}
              title={`${row.letter}: ${row.count} result${row.count === 1 ? '' : 's'}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        {ordered.map((row) => (
          <div key={row.letter} className="min-w-0 flex-1 text-center text-sm font-medium" style={{ color: gradeColor(row.letter) }}>
            {row.letter}
          </div>
        ))}
      </div>
    </div>
  );
}

function TopStudents({ rows = [] }) {
  if (!rows.length) {
    return <p className="py-10 text-sm text-white/70">No published marks yet.</p>;
  }
  const [first, ...rest] = rows;

  return (
    <div>
      <div className="border-b border-white/15 pb-5">
        <p className="text-sm text-white/65">Highest average</p>
        <p className="mt-2 font-serif text-2xl leading-tight">{first.name}</p>
        <p className="mt-1 text-sm text-white/65">{first.studentNumber} · {first.programme}</p>
        <p className="mt-5 text-6xl font-semibold tabular-nums tracking-[-0.06em]">{mark(first.averageMark)}</p>
        <p className="mt-1 text-sm text-white/65">{first.resultCount} published result{first.resultCount === 1 ? '' : 's'}</p>
      </div>
      <div className="mt-2 divide-y divide-white/10">
        {rest.map((row, index) => (
          <div key={row.id} className="flex items-center gap-3 py-3">
            <span className="w-4 text-xs tabular-nums text-white/45">{index + 2}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
            <span className="text-sm font-semibold tabular-nums">{mark(row.averageMark)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PerformanceRow({ row, index }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_5rem_5rem_5rem]" style={{ borderColor: LINE }}>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs tabular-nums text-[#9AA9A1]">{String(index + 1).padStart(2, '0')}</span>
          <p className="truncate text-sm font-medium" style={{ color: INK }}>{row.name}</p>
          {row.code ? <span className="text-xs text-[#7A8D84]">{row.code}</span> : null}
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#E8EEE9]">
          <div className="h-full rounded-full" style={{ width: `${Math.max(2, Number(row.averageMark) || 0)}%`, backgroundColor: FOREST }} />
        </div>
      </div>
      <span className="text-right text-sm font-semibold tabular-nums sm:text-left" style={{ color: INK }}>{mark(row.averageMark)}</span>
      <span className="hidden text-sm tabular-nums text-[#5E756B] sm:block">{pass(row.passRate)}</span>
      <span className="hidden text-sm tabular-nums text-[#5E756B] sm:block">{row.studentCount}</span>
    </div>
  );
}

export default function RegistrarAnalytics() {
  const [filters, setFilters] = useState({ academicYear: '', department: '', program: '', batch: '', category: '' });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['registrar', 'analytics', filters],
    queryFn: async () => {
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
      return (await api.get(`${REGISTRAR}/analytics`, { params })).data;
    },
  });

  const options = data?.filters || {};
  const programmes = (options.programs || []).filter(
    (row) => !filters.department || row.department === filters.department,
  );
  const batches = (options.batches || []).filter(
    (row) =>
      (!filters.department || programmes.some((program) => program.id === row.program))
      && (!filters.program || row.program === filters.program),
  );
  const overview = data?.overview || {};
  const hasResults = (overview.resultCount || 0) > 0;

  const setFilter = (key, value) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === 'department') {
        next.program = '';
        next.batch = '';
      }
      if (key === 'program') next.batch = '';
      return next;
    });
  };

  const reset = () => setFilters({ academicYear: '', department: '', program: '', batch: '', category: '' });

  return (
    <div className="mx-auto max-w-[1200px] space-y-9 pb-8">
      <header className="flex flex-col gap-6 border-b pb-6 xl:flex-row xl:items-end xl:justify-between" style={{ borderColor: LINE }}>
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-[#5E756B]">Academic performance</p>
          <h1 className="mt-2 font-serif text-4xl leading-[1.05] tracking-[-0.035em] sm:text-5xl" style={{ color: INK }}>
            Where the marks are moving
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#5E756B]">
            Published results across departments, programmes and intakes. Use the filters to follow one cohort or compare the whole college.
          </p>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-[640px] xl:grid-cols-5">
          <Filter label="Academic year" value={filters.academicYear} onChange={(value) => setFilter('academicYear', value)}>
            <option value="">All years</option>
            {(options.academicYears || []).map((row) => (
              <option key={row.id} value={row.id}>{row.label}{row.isCurrent ? ' (current)' : ''}</option>
            ))}
          </Filter>
          <Filter label="Department" value={filters.department} onChange={(value) => setFilter('department', value)}>
            <option value="">All departments</option>
            {(options.departments || []).map((row) => (
              <option key={row.id} value={row.id}>{row.code} · {row.name}</option>
            ))}
          </Filter>
          <Filter label="Programme" value={filters.program} onChange={(value) => setFilter('program', value)}>
            <option value="">All programmes</option>
            {programmes.map((row) => (
              <option key={row.id} value={row.id}>{row.code} · {row.name}</option>
            ))}
          </Filter>
          <Filter label="Batch" value={filters.batch} onChange={(value) => setFilter('batch', value)}>
            <option value="">All batches</option>
            {batches.map((row) => (
              <option key={row.id} value={row.id}>{row.code} · {row.name}</option>
            ))}
          </Filter>
          <div className="flex items-end gap-2">
            <Filter label="Stream" value={filters.category} onChange={(value) => setFilter('category', value)}>
              <option value="">Both streams</option>
              <option value="regular">Regular</option>
              <option value="extension">Extension</option>
            </Filter>
            <button
              type="button"
              onClick={reset}
              aria-label="Clear filters"
              title="Clear filters"
              className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-[#5E756B] transition hover:text-[#14231F]"
              style={{ borderColor: LINE }}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="border p-6" style={{ borderColor: LINE }}>
          <ErrorState message={error?.response?.data?.message || 'The performance view could not be loaded.'} onRetry={refetch} />
        </div>
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={5} />
          <SkeletonCard lines={5} />
          <SkeletonCard lines={5} />
        </div>
      ) : !hasResults ? (
        <div className="border-y py-16 text-center" style={{ borderColor: LINE }}>
          <p className="font-serif text-2xl" style={{ color: INK }}>No published results match this view.</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#5E756B]">
            Clear a filter, or publish approved results from the results workspace to begin measuring performance.
          </p>
          <button type="button" onClick={reset} className="focus-ring mt-5 text-sm font-semibold underline underline-offset-4" style={{ color: FOREST }}>
            Clear all filters
          </button>
        </div>
      ) : (
        <>
          <section className="grid overflow-hidden border-y sm:grid-cols-2 lg:grid-cols-5" style={{ borderColor: LINE }}>
            <Metric label="Published results" value={overview.resultCount} hint="Final grades only" />
            <Metric label="Students assessed" value={overview.studentCount} hint="Distinct students" />
            <Metric label="Average mark" value={mark(overview.averageMark)} hint="Out of 100" filled />
            <Metric label="Pass rate" value={pass(overview.passRate)} hint="Passed results" />
            <Metric label="Mark range" value={`${mark(overview.lowestMark)}–${mark(overview.highestMark)}`} hint="Lowest to highest" />
          </section>

          <div className="grid gap-8 lg:grid-cols-3">
            <section className="lg:col-span-2">
              <SectionHeading title="Grade distribution" note="How final letter grades are spread across the filtered results." />
              <GradeDistribution rows={data.byGrade} />
            </section>
            <section className="-mx-4 px-5 py-6 lg:mx-0 lg:px-7" style={{ backgroundColor: INK }}>
              <p className="font-serif text-xl text-white">Leading students</p>
              <p className="mt-1 text-sm text-white/60">Ranked by average published mark.</p>
              <div className="mt-6">
                <TopStudents rows={data.topStudents} />
              </div>
            </section>
          </div>

          <section>
            <SectionHeading
              title="Department ledger"
              note="Average mark, pass rate and assessed students. A short bar means there is room to lift the mark."
            />
            <div className="hidden grid-cols-[minmax(0,1fr)_5rem_5rem_5rem] gap-4 pb-2 text-xs font-medium text-[#7A8D84] sm:grid">
              <span>Department</span>
              <span>Average</span>
              <span>Pass rate</span>
              <span>Students</span>
            </div>
            {(data.byDepartment || []).map((row, index) => (
              <PerformanceRow key={row.id || row.name} row={row} index={index} />
            ))}
            {!data.byDepartment?.length ? <p className="py-8 text-sm text-[#5E756B]">No department has a published mark in this view.</p> : null}
          </section>

          <div className="grid gap-8 lg:grid-cols-2">
            <section>
              <SectionHeading title="Programme performance" note="Highest averages first." />
              {(data.byProgram || []).map((row, index) => (
                <PerformanceRow key={row.id || row.name} row={row} index={index} />
              ))}
              {!data.byProgram?.length ? <p className="py-8 text-sm text-[#5E756B]">No programme has a published mark in this view.</p> : null}
            </section>
            <section>
              <SectionHeading title="Batch performance" note="Compare intakes without losing the programme context." />
              {(data.byBatch || []).map((row, index) => (
                <PerformanceRow key={row.id || row.name} row={row} index={index} />
              ))}
              {!data.byBatch?.length ? <p className="py-8 text-sm text-[#5E756B]">No batch has a published mark in this view.</p> : null}
            </section>
          </div>

          <section>
            <SectionHeading title="Average by term" note="The ten terms with the most published results." />
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {(data.byTerm || []).map((row) => (
                <div key={row.term} className="grid grid-cols-[7rem_minmax(0,1fr)_3rem] items-center gap-3">
                  <span className="truncate text-sm text-[#5E756B]" title={row.term}>{row.term}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-[#E8EEE9]">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, Number(row.averageMark) || 0)}%`, backgroundColor: BRASS }} />
                  </div>
                  <span className="text-right text-sm font-semibold tabular-nums" style={{ color: INK }}>{mark(row.averageMark)}</span>
                </div>
              ))}
              {!data.byTerm?.length ? <p className="text-sm text-[#5E756B]">No term has enough published results yet.</p> : null}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
