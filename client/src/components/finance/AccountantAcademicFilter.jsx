import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Filter, Layers, Building2, BookOpen, RotateCcw, Eye } from 'lucide-react';
import { api } from '../../lib/api';
import Card, { CardBody } from '../ui/Card';
import Button from '../ui/Button';

export default function AccountantAcademicFilter({
  selectedBatch,
  setSelectedBatch,
  selectedDepartment,
  setSelectedDepartment,
  selectedCourse,
  setSelectedCourse,
  isApplied,
  onApply,
  onReset,
}) {
  // Load academic structure (departments, programs, courses, batches)
  const { data: structureData, isLoading } = useQuery({
    queryKey: ['academic-structure'],
    queryFn: async () => {
      try {
        return (await api.get('/finance/academic-structure')).data;
      } catch {
        return (await api.get('/registrar/academic-structure')).data;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const batches = useMemo(() => {
    const list = structureData?.batches || [];
    return list.filter((b) => b.status === 'active' || !b.status);
  }, [structureData?.batches]);

  const departments = structureData?.departments || [];
  const programs = structureData?.programs || [];
  const allCourses = structureData?.courses || [];

  // Cascading courses for selected department
  const filteredCourses = useMemo(() => {
    if (!selectedDepartment) return allCourses;
    return allCourses.filter(
      (c) => String(c.department?.id || c.department?._id || c.department) === String(selectedDepartment)
    );
  }, [allCourses, selectedDepartment]);

  // Handle Batch Change: auto-detect and set Department
  const handleBatchChange = (batchId) => {
    setSelectedBatch(batchId);
    if (!batchId) {
      setSelectedDepartment('');
      setSelectedCourse('');
      return;
    }

    const bDoc = batches.find((b) => String(b.id) === String(batchId));
    if (bDoc?.program) {
      const pDoc = programs.find((p) => String(p.id) === String(bDoc.program));
      const deptId = pDoc?.department?.id || pDoc?.department?._id || pDoc?.department;
      if (deptId) {
        setSelectedDepartment(String(deptId));
      }
    }
  };

  // Handle Department Change
  const handleDepartmentChange = (deptId) => {
    setSelectedDepartment(deptId);
    // If selected course is not in the new department, reset it
    if (selectedCourse && deptId) {
      const stillValid = allCourses.some(
        (c) =>
          String(c.id) === String(selectedCourse) &&
          String(c.department?.id || c.department?._id || c.department) === String(deptId)
      );
      if (!stillValid) {
        setSelectedCourse('');
      }
    }
  };

  const canApply = Boolean(selectedBatch || selectedDepartment || selectedCourse);

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardBody className="p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          {/* Header indicator */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Filter className="h-4 w-4 text-brand-600" />
              <span>Academic Filter: Batch → Department → Course</span>
            </div>
            {isApplied && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active Filter Applied
              </span>
            )}
          </div>

          {/* 3 Cascading Filter Selects */}
          <div className="grid gap-3 sm:grid-cols-3">
            {/* 1. Batch */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-brand-600" />
                <span>1. Batch <span className="text-rose-500">*</span></span>
              </label>
              <select
                value={selectedBatch}
                onChange={(e) => handleBatchChange(e.target.value)}
                disabled={isLoading}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
              >
                <option value="">-- Select Batch --</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code ? `${b.code} — ` : ''}{b.name} ({String(b.category || 'regular').toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Department */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-indigo-600" />
                <span>2. Department</span>
              </label>
              <select
                value={selectedDepartment}
                onChange={(e) => handleDepartmentChange(e.target.value)}
                disabled={isLoading}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
              >
                <option value="">-- Select Department --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.code ? `(${d.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Course */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-cyan-600" />
                <span>3. Course</span>
              </label>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                disabled={isLoading}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
              >
                <option value="">All Courses in Department</option>
                {filteredCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code ? `[${c.code}] ` : ''}{c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-[11px] text-slate-500">
              {!selectedBatch ? (
                <span>Step 1: Select a <strong className="text-slate-700">Batch</strong> to initiate filtering.</span>
              ) : !selectedDepartment ? (
                <span>Step 2: Confirm or choose the target <strong className="text-slate-700">Department</strong>.</span>
              ) : (
                <span>Step 3: Choose a specific <strong className="text-slate-700">Course</strong> or leave as all department courses.</span>
              )}
            </p>

            <div className="flex items-center gap-2">
              {(selectedBatch || selectedDepartment || selectedCourse || isApplied) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onReset}
                  className="text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Reset
                </Button>
              )}

              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={onApply}
                disabled={!canApply}
                className="text-xs font-semibold px-4"
              >
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                View Records
              </Button>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export function SelectToViewCard({ title = 'Select to View', message = 'Please select a Batch, Department, and Course in the filter above, then click View Records to display matching data.' }) {
  return (
    <Card className="border-dashed border-slate-200 bg-slate-50/50">
      <CardBody className="py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 shadow-sm">
          <Filter className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-base font-bold text-slate-800">{title}</h3>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
          {message}
        </p>
      </CardBody>
    </Card>
  );
}
