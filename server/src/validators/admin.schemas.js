import { z } from 'zod';
import { ROLES } from '../config/roles.js';

// The dashboard asks for a window, never for a raw date range: the chart always ends
// today, so there is no way to ask for years of history in one request.
export const overviewQuerySchema = z.strictObject({
  days: z.coerce.number().int().min(7).max(90).default(14),
});

// One list for both live and ended sessions. "active" means signed in but not
// necessarily in front of the screen; "online" means seen in the last two minutes.
export const listSessionsQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(['all', 'active', 'online', 'away', 'expired', 'terminated']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listAuditQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  category: z.enum(['all', 'signin', 'security', 'admin', 'settings', 'announcements', 'maintenance', 'account', 'export', 'other']).default('all'),
  status: z.enum(['all', 'success', 'fail']).default('all'),
  range: z.enum(['1', '7', '30', 'all']).default('7'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

// Downloads repeat the list filters but never accept a page: an export is the whole
// filtered view, capped by the service so one request cannot build an unbounded file.
const exportFormat = z.enum(['xlsx', 'docx', 'pdf']).default('xlsx');

export const exportUsersQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(['pending', 'active', 'disabled']).optional(),
  sort: z.enum(['createdAt', 'lastLoginAt', 'name', 'email', 'role', 'status']).default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  format: exportFormat,
});

export const exportSessionsQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(['all', 'active', 'online', 'away', 'expired', 'terminated']).default('all'),
  format: exportFormat,
});

export const exportAuditQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  category: z.enum(['all', 'signin', 'security', 'admin', 'settings', 'announcements', 'maintenance', 'account', 'export', 'other']).default('all'),
  status: z.enum(['all', 'success', 'fail']).default('all'),
  range: z.enum(['1', '7', '30', 'all']).default('7'),
  format: exportFormat,
});
