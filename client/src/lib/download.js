import { api } from './api';

// Server-side generated files (PDF / Word / Excel) arrive as a blob and are
// triggered as a browser download without leaving the page.
export async function downloadExport(url, filename) {
  const res = await api.get(url, { responseType: 'blob' });
  const contentType = res.headers?.['content-type'] || '';
  const blob = new Blob([res.data], { type: contentType || undefined });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || 'export';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
