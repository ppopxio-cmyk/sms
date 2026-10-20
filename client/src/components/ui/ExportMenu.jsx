import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Download, File, FileSpreadsheet, FileText } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import Button from './Button';

const FORMATS = [
  {
    key: 'xlsx',
    label: 'Excel workbook',
    hint: 'Filter, sort and reuse the data',
    icon: FileSpreadsheet,
    tone: 'bg-emerald-50 text-emerald-600',
  },
  {
    key: 'docx',
    label: 'Word document',
    hint: 'A report you can edit or print',
    icon: FileText,
    tone: 'bg-sky-50 text-sky-600',
  },
  {
    key: 'pdf',
    label: 'PDF document',
    hint: 'A fixed copy for sharing',
    icon: File,
    tone: 'bg-rose-50 text-rose-600',
  },
];

function filenameFrom(response, fallback) {
  const header = response.headers?.['content-disposition'] || '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // fall through to the plain filename or the local fallback
    }
  }

  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || fallback;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function blobErrorMessage(error, fallback) {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return parsed?.message || fallback;
    } catch {
      return fallback;
    }
  }
  return errorMessage(error, fallback);
}

export default function ExportMenu({
  basePath,
  params = {},
  filenamePrefix = 'export',
  disabled = false,
  label = 'Export',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState('');
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const download = async (format) => {
    setOpen(false);
    setLoading(format);

    try {
      const response = await api.get(basePath, {
        params: { ...params, format },
        responseType: 'blob',
      });
      const type = response.headers?.['content-type'] || 'application/octet-stream';
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type });
      const fallback = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.${format}`;
      downloadBlob(blob, filenameFrom(response, fallback));
      toast.success('Export downloaded.');
    } catch (error) {
      toast.error(await blobErrorMessage(error, 'We could not build that export. Please try again.'));
    } finally {
      setLoading('');
    }
  };

  return (
    <div ref={root} className={`relative ${className}`}>
      <Button
        variant="secondary"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled || Boolean(loading)}
        loading={Boolean(loading)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {loading ? null : <Download className="h-4 w-4" />}
        {label}
        {loading ? null : <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />}
      </Button>

      {open ? (
        <div
          role="menu"
          aria-label="Export formats"
          className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10"
        >
          <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Download this view
          </p>
          {FORMATS.map(({ key, label: formatLabel, hint, icon: Icon, tone }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={() => download(key)}
              className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50"
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800">{formatLabel}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </button>
          ))}
          <p className="border-t border-slate-100 px-3 pb-1 pt-2 text-[11px] leading-relaxed text-slate-400">
            The download follows the filters on this screen. Every export is recorded in the audit log.
          </p>
        </div>
      ) : null}
    </div>
  );
}
