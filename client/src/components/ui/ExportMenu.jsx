import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

const MENU_WIDTH = 288;

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
  const [position, setPosition] = useState(null);
  const root = useRef(null);
  const button = useRef(null);
  const menu = useRef(null);

  const place = () => {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(Math.max(8, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8);
    const openUp = window.innerHeight - rect.bottom < 330 && rect.top > 330;
    setPosition(
      openUp
        ? { left, bottom: window.innerHeight - rect.top + 8, maxHeight: rect.top - 16 }
        : { left, top: rect.bottom + 8, maxHeight: window.innerHeight - rect.bottom - 16 },
    );
  };

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (root.current?.contains(event.target) || menu.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const close = () => setOpen(false);

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    place();
    setOpen(true);
  };

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
      <span ref={button} className="inline-flex">
        <Button
          variant="secondary"
          onClick={toggle}
          disabled={disabled || Boolean(loading)}
          loading={Boolean(loading)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {loading ? null : <Download className="h-4 w-4" />}
          {label}
          {loading ? null : <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />}
        </Button>
      </span>

      {open && position
        ? createPortal(
            <div
              ref={menu}
              role="menu"
              aria-label="Export formats"
              style={{
                left: position.left,
                top: position.top,
                bottom: position.bottom,
                width: MENU_WIDTH,
                maxHeight: position.maxHeight,
              }}
              className="animate-rise fixed z-[80] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-900/15 thin-scroll"
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
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
