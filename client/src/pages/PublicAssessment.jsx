import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowLeft,
  CircleCheck,
  Clock3,
  FileText,
  GraduationCap,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  UploadCloud,
  UserRound,
} from 'lucide-react';
import { api } from '../lib/api';
import Alert from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';

const STATUS_COPY = {
  open: { label: 'Open for submissions', tone: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  scheduled: { label: 'Opens later', tone: 'bg-amber-100 text-amber-800 border-amber-200' },
  closed: { label: 'Closed', tone: 'bg-slate-200 text-slate-700 border-slate-300' },
  draft: { label: 'Not published', tone: 'bg-slate-200 text-slate-700 border-slate-300' },
  disabled: { label: 'Portal disabled', tone: 'bg-slate-200 text-slate-700 border-slate-300' },
};

const ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function formatDate(value) {
  if (!value) return 'No deadline';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No deadline';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error) {
  return error?.response?.data?.message || 'Something went wrong. Check your connection and try again.';
}

function Seal() {
  return (
    <span className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 text-[#ffcf66] shadow-[inset_0_0_0_5px_rgba(255,255,255,0.04)]">
      <GraduationCap className="h-5 w-5" />
    </span>
  );
}

export default function PublicAssessment() {
  const { hash: pathHash } = useParams();
  const [params] = useSearchParams();
  const hash = String(pathHash || params.get('hash') || '').trim().toLowerCase();
  const [loading, setLoading] = useState(true);
  const [metaError, setMetaError] = useState('');
  const [meta, setMeta] = useState(null);
  const [studentNumber, setStudentNumber] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [formError, setFormError] = useState('');
  const [verified, setVerified] = useState(null);
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploaded, setUploaded] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMetaError('');
    setMeta(null);
    setVerified(null);
    setUploaded(null);

    if (!/^[a-f0-9]{32}$/.test(hash)) {
      setLoading(false);
      setMetaError('This assessment link is incomplete. Ask your teacher for the full link.');
      return undefined;
    }

    api
      .get(`/public/assessments/${hash}`)
      .then(({ data }) => {
        if (active) setMeta(data.assessment);
      })
      .catch((error) => {
        if (active) setMetaError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [hash]);

  const status = STATUS_COPY[meta?.status] ?? STATUS_COPY.closed;
  const canOpen = meta?.status === 'open' || meta?.status === 'closed';
  const deadline = useMemo(() => formatDate(meta?.closesAt || meta?.dueDate), [meta]);

  async function onVerify(event) {
    event.preventDefault();
    setFormError('');
    setVerifying(true);
    try {
      const { data } = await api.post(`/public/assessments/${hash}/verify`, { studentNumber, accessCode });
      setVerified(data);
      setStudentNumber(data.student?.studentNumber || studentNumber);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setVerifying(false);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    setUploadError('');
    if (!file) {
      setUploadError('Choose a PDF or Word document first.');
      return;
    }
    setUploading(true);
    try {
      const { data } = await api.post(`/public/assessments/${hash}/submissions`, file, {
        params: {
          studentNumber: verified?.student?.studentNumber || studentNumber,
          accessCode,
          filename: file.name,
          note,
        },
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        timeout: 60_000,
      });
      setUploaded(data.submission);
      const canSubmitAgain =
        data.assessment?.status === 'open' && data.assessment?.allowResubmission !== false;
      setVerified((current) => ({
        ...current,
        submission: data.submission,
        canSubmit: canSubmitAgain,
        canResubmit: canSubmitAgain,
      }));
      setFile(null);
      setNote('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (error) {
      setUploadError(errorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  function resetStudent() {
    setVerified(null);
    setUploaded(null);
    setFile(null);
    setNote('');
    setFormError('');
    setUploadError('');
    setAccessCode('');
  }

  const submission = uploaded || verified?.submission;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#071a2b] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90rem_45rem_at_15%_-10%,rgba(56,189,248,0.17),transparent_62%),radial-gradient(70rem_45rem_at_95%_18%,rgba(255,207,102,0.12),transparent_58%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:52px_52px]" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <Link to="/" className="focus-ring flex items-center gap-3 rounded-2xl">
          <Seal />
          <span>
            <span className="block text-sm font-bold tracking-[0.18em] text-white">SMS</span>
            <span className="block text-[11px] text-slate-400">Assessment desk</span>
          </span>
        </Link>
        <Link
          to="/"
          className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-2 text-xs font-medium text-slate-300 transition hover:border-white/30 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Student portal
        </Link>
      </header>

      <main className="relative mx-auto grid max-w-6xl gap-6 px-5 pb-12 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:gap-8">
        <section className="pb-2 pt-4 sm:pt-8">
          <p className="font-mono text-[11px] tracking-[0.22em] text-sky-300/80">PUBLIC ASSESSMENT</p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.04] tracking-[-0.04em] text-white sm:text-6xl">
            Submit your work without the noise.
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-slate-300 sm:text-base">
            One private link, one assessment. Your teacher will give you the class code in person. Use your student ID
            and that code to open the brief and send your document.
          </p>

          <div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-3">
            {[
              ['Open', 'Use the link from your teacher'],
              ['Verify', 'Student ID and private code'],
              ['Submit', 'PDF or Word, sent directly'],
            ].map(([title, body], index) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm">
                <span className="font-mono text-[11px] text-[#ffcf66]">0{index + 1}</span>
                <p className="mt-3 text-sm font-semibold text-white">{title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{body}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Private file access
            </span>
            <span className="inline-flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-sky-300" />
              Code protected
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-[#ffcf66]" />
              Deadline enforced
            </span>
          </div>
        </section>

        <section className="lg:pt-2">
          <div className="overflow-hidden rounded-[1.75rem] border border-white/15 bg-[#fbfaf6] text-slate-900 shadow-[0_35px_90px_-30px_rgba(0,0,0,.8)]">
            <div className="border-b border-slate-200/80 px-6 py-5 sm:px-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.18em] text-slate-500">
                    {hash ? `REF ${hash.slice(0, 10).toUpperCase()}` : 'ASSESSMENT LINK'}
                  </p>
                  <h2 className="mt-1.5 text-xl font-semibold tracking-tight">
                    {loading ? 'Opening assessment…' : meta?.title || 'Assessment'}
                  </h2>
                </div>
                {meta ? (
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status.tone}`}>
                    {status.label}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="px-6 py-6 sm:px-7">
              {loading ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-sm text-slate-500">
                  <Spinner className="h-6 w-6" />
                  Loading the assessment details…
                </div>
              ) : metaError ? (
                <div className="space-y-4">
                  <Alert tone="danger" title="This link cannot be opened">
                    {metaError}
                  </Alert>
                  <p className="text-sm leading-6 text-slate-500">
                    Ask your teacher to copy the full link again. Links are unique to one assessment.
                  </p>
                </div>
              ) : meta && !canOpen ? (
                <div className="space-y-4">
                  <Alert tone="warning" title={status.label}>
                    {meta.status === 'scheduled'
                      ? `This portal opens on ${formatDate(meta.opensAt)}.`
                      : 'This assessment is not accepting submissions right now.'}
                  </Alert>
                  <dl className="grid gap-3 text-sm">
                    <div className="flex justify-between gap-4 border-b border-slate-200 pb-3">
                      <dt className="text-slate-500">Course</dt>
                      <dd className="text-right font-medium">{meta.courseCode || meta.courseTitle || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-slate-200 pb-3">
                      <dt className="text-slate-500">Deadline</dt>
                      <dd className="text-right font-medium">{deadline}</dd>
                    </div>
                  </dl>
                </div>
              ) : verified ? (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                    <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-emerald-100 text-emerald-700">
                      {verified.student?.photoUrl ? (
                        <img src={verified.student.photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <UserRound className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-emerald-950">{verified.student?.name}</p>
                      <p className="truncate text-xs text-emerald-700">
                        {[verified.student?.studentNumber, verified.student?.program].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={resetStudent}
                      className="focus-ring rounded-lg px-2 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
                    >
                      Switch
                    </button>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                        <FileText className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">Assessment brief</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {meta.hasDocument
                            ? 'Download the brief, complete it, then return here to submit.'
                            : 'Your teacher has not attached a brief file. Follow the instructions below.'}
                        </p>
                        {meta.instructions ? (
                          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{meta.instructions}</p>
                        ) : null}
                      </div>
                    </div>
                    {verified.documentUrl ? (
                      <a
                        href={verified.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b2a40] px-4 text-xs font-semibold text-white transition hover:bg-[#103c59]"
                      >
                        <ArrowDownToLine className="h-4 w-4" />
                        Download assessment document
                      </a>
                    ) : null}
                  </div>

                  {submission ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex items-start gap-3">
                        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">
                            {submission.status === 'graded'
                              ? 'Graded by your teacher'
                              : submission.status === 'returned'
                                ? 'Returned for another attempt'
                                : 'Submission received'}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {submission.fileName} {formatBytes(submission.bytes) ? `· ${formatBytes(submission.bytes)}` : ''}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Version {submission.revision} · {formatDate(submission.submittedAt)}
                          </p>
                          {submission.status !== 'submitted' && submission.score !== null ? (
                            <p className="mt-2 text-sm font-semibold text-slate-700">
                              Score: {submission.score} / {meta.maxScore}
                            </p>
                          ) : null}
                          {submission.feedback ? (
                            <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                              {submission.feedback}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {verified.canSubmit ? (
                    <form onSubmit={onSubmit} className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {submission ? 'Send a new version' : 'Submit your document'}
                          </p>
                          <p className="text-xs text-slate-500">PDF or Word, up to 10 MB.</p>
                        </div>
                        {submission?.status === 'returned' ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                            Resubmission allowed
                          </span>
                        ) : null}
                      </div>

                      <label className="focus-within:ring-2 focus-within:ring-[#0b2a40]/20 block cursor-pointer rounded-2xl border border-dashed border-slate-300 bg-white p-4 transition hover:border-slate-400">
                        <input
                          ref={fileRef}
                          type="file"
                          accept={ACCEPT}
                          className="sr-only"
                          onChange={(event) => {
                            setUploadError('');
                            setFile(event.target.files?.[0] || null);
                          }}
                        />
                        <span className="flex items-center gap-3">
                          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600">
                            <UploadCloud className="h-5 w-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-800">
                              {file ? file.name : 'Choose a PDF or Word document'}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {file ? formatBytes(file.size) : 'Tap to browse your files'}
                            </span>
                          </span>
                        </span>
                      </label>

                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Note for your teacher (optional)</span>
                        <textarea
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          maxLength={1000}
                          rows={3}
                          className="focus-ring mt-1.5 w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400"
                          placeholder="Anything your teacher should know about this submission"
                        />
                      </label>

                      {uploadError ? <Alert tone="danger">{uploadError}</Alert> : null}

                      <button
                        type="submit"
                        disabled={uploading}
                        className="focus-ring inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0b2a40] px-5 text-sm font-semibold text-white transition hover:bg-[#103c59] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {uploading ? <Spinner className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
                        {uploading ? 'Sending your document…' : submission ? 'Submit new version' : 'Submit assessment'}
                      </button>
                    </form>
                  ) : submission ? (
                    <Alert tone="success" title="You are all set">
                      Your teacher has this version. You can close this page.
                    </Alert>
                  ) : (
                    <Alert tone="warning" title="Submission is not available">
                      {verified.assessment?.status === 'open'
                        ? 'Your teacher has closed resubmission for this assessment.'
                        : 'This assessment is not accepting documents right now.'}
                    </Alert>
                  )}
                </div>
              ) : (
                <form onSubmit={onVerify} className="space-y-4">
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      {meta?.courseCode || 'Course assessment'}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5" />
                      {deadline}
                    </span>
                  </div>

                  {meta?.maxScore ? (
                    <div className="flex items-center justify-between rounded-2xl bg-[#0b2a40] px-4 py-3 text-white">
                      <div>
                        <p className="text-[11px] text-slate-300">Assessment value</p>
                        <p className="text-lg font-semibold">{meta.maxScore} marks</p>
                      </div>
                      <span className="font-mono text-xs text-[#ffcf66]">{meta.type}</span>
                    </div>
                  ) : null}

                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Student ID</span>
                    <div className="relative mt-1.5">
                      <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={studentNumber}
                        onChange={(event) => setStudentNumber(event.target.value.toUpperCase())}
                        autoComplete="username"
                        required
                        className="focus-ring h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm font-mono uppercase tracking-wide text-slate-800 placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400"
                        placeholder="e.g. SMS-2026-001"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Assessment code</span>
                    <div className="relative mt-1.5">
                      <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={accessCode}
                        onChange={(event) => setAccessCode(event.target.value.toUpperCase())}
                        autoComplete="one-time-code"
                        required
                        className="focus-ring h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm font-mono uppercase tracking-[0.2em] text-slate-800 placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400"
                        placeholder="From your teacher"
                      />
                    </div>
                  </label>

                  {formError ? <Alert tone="danger">{formError}</Alert> : null}

                  <button
                    type="submit"
                    disabled={verifying}
                    className="focus-ring inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0b2a40] px-5 text-sm font-semibold text-white transition hover:bg-[#103c59] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {verifying ? <Spinner className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
                    {verifying ? 'Checking your details…' : 'Open assessment'}
                  </button>

                  <p className="text-center text-[11px] leading-5 text-slate-500">
                    Only students registered for this course can open or submit this assessment.
                  </p>
                </form>
              )}
            </div>

            <div className="border-t border-slate-200/80 bg-[#f3f1ea] px-6 py-4 text-[11px] leading-5 text-slate-500 sm:px-7">
              Keep this link and your assessment code private. If your code does not work, contact the teacher who gave
              it to you.
            </div>
          </div>
        </section>
      </main>

      <footer className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 pb-8 text-[11px] text-slate-500 sm:px-8">
        <span>SMS Portal · Secure assessment submissions</span>
        <span className="flex gap-4">
          <Link to="/privacy" className="transition hover:text-slate-300">
            Privacy
          </Link>
          <Link to="/terms" className="transition hover:text-slate-300">
            Terms
          </Link>
        </span>
      </footer>
    </div>
  );
}
