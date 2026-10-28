import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck,
  AlertTriangle,
  Building2,
  GraduationCap,
  Award,
  Calendar,
  CheckCircle2,
  XCircle,
  ExternalLink,
  School,
  User,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatEthiopian } from '../lib/ethiopianDate';
import { displayDateTime } from '../lib/registrar';
import Badge from '../components/ui/Badge';
import Card, { CardBody } from '../components/ui/Card';

export default function PublicVerification() {
  const { verificationId } = useParams();

  const query = useQuery({
    queryKey: ['public-verification', verificationId],
    queryFn: async () => (await api.get(`/verify/${verificationId}`)).data,
    enabled: Boolean(verificationId),
    retry: false,
  });

  const data = query.data;
  const doc = data?.document;
  const isValid = Boolean(data?.valid);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 py-12 px-4 sm:px-6">
      <div className="mx-auto max-w-2xl">
        {/* Institutional Branding Top */}
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 text-white shadow-lg backdrop-blur mb-3">
            <School className="h-7 w-7 text-teal-400" />
          </div>
          <h1 className="text-xl font-bold tracking-wider text-white uppercase">
            Official Document Verification Portal
          </h1>
          <p className="text-xs text-indigo-200 mt-1">
            Higher Education Institution · Registrar Record Authentication
          </p>
        </div>

        {query.isLoading ? (
          <Card className="border-white/10 bg-white/95 shadow-2xl backdrop-blur">
            <CardBody className="py-20 text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-3 border-brand-600 border-t-transparent" />
              <p className="mt-4 text-sm font-semibold text-slate-800">
                Verifying document reference with official records...
              </p>
              <p className="text-xs font-mono text-slate-400 mt-1">{verificationId}</p>
            </CardBody>
          </Card>
        ) : !isValid || query.isError ? (
          /* ==========================================
              INVALID / VERIFICATION FAILED STATE
              ========================================== */
          <Card className="border-rose-200 bg-white shadow-2xl overflow-hidden">
            <div className="bg-rose-600 p-6 text-white text-center">
              <XCircle className="mx-auto h-14 w-14 text-rose-100" />
              <h2 className="mt-2 text-xl font-extrabold tracking-wide uppercase">
                Verification Failed: Invalid Document
              </h2>
              <p className="text-xs text-rose-100 mt-1">
                No active official certificate matches the submitted verification reference.
              </p>
            </div>
            <CardBody className="p-6 sm:p-8 space-y-4 text-center">
              <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4 text-xs text-rose-900">
                <p className="font-bold">Submitted Reference ID:</p>
                <p className="font-mono text-sm font-black text-rose-950 mt-0.5">{verificationId}</p>
                <p className="mt-2 text-rose-800">
                  This document number or QR code could not be authenticated against the institutional database. It may be revoked, expired, or invalid.
                </p>
              </div>

              <div className="pt-2">
                <p className="text-xs text-slate-500">
                  If you believe this is in error, please contact the Registrar Office with the original document.
                </p>
              </div>
            </CardBody>
          </Card>
        ) : (
          /* ==========================================
              VALID / AUTHENTICATED DOCUMENT RECORD
              ========================================== */
          <Card className="border-white/10 bg-white shadow-2xl overflow-hidden">
            {/* Success Header Banner */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white shadow-sm mb-2">
                <ShieldCheck className="h-7 w-7 text-emerald-100" />
              </div>
              <h2 className="text-lg font-black tracking-wide uppercase">
                ✓ Authentic Official Institutional Document
              </h2>
              <p className="text-xs text-emerald-100 mt-0.5">
                Verified and confirmed as an authentic academic credential issued by the institution.
              </p>
            </div>

            <CardBody className="p-6 sm:p-8 space-y-6">
              {/* Student Header with Photograph */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 border-b border-slate-100 pb-6 text-center sm:text-left">
                {doc.photo ? (
                  <img
                    src={doc.photo}
                    alt=""
                    className="h-24 w-20 rounded-xl object-cover ring-2 ring-emerald-500 shadow-md"
                  />
                ) : (
                  <div className="flex h-24 w-20 items-center justify-center rounded-xl bg-slate-100 text-slate-400 ring-1 ring-slate-200">
                    <User className="h-8 w-8" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <Badge tone="success" className="mb-1">
                    Status: {doc.status ? doc.status.toUpperCase() : 'ISSUED & OFFICIAL'}
                  </Badge>
                  <h3 className="text-xl font-black text-slate-900">{doc.studentName}</h3>
                  <p className="text-xs font-mono font-bold text-brand-700">Student ID: {doc.studentId}</p>
                  <p className="text-xs font-semibold text-slate-700">
                    {doc.program} ({doc.qualification ? doc.qualification.toUpperCase() : 'DEGREE'})
                  </p>
                  <p className="text-[11px] text-slate-500">{doc.department}</p>
                </div>
              </div>

              {/* Document Key Credentials Details Grid */}
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Certificate Serial Number
                  </span>
                  <p className="text-sm font-mono font-bold text-slate-900 mt-0.5">
                    {doc.certificateNumber || '—'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Verification Reference ID
                  </span>
                  <p className="text-sm font-mono font-bold text-indigo-700 mt-0.5">
                    {doc.verificationId || verificationId}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Final Cumulative CGPA
                  </span>
                  <p className="text-sm font-bold text-emerald-700 mt-0.5">
                    {doc.cgpa != null ? Number(doc.cgpa).toFixed(2) : '—'} / 4.00
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Completion Date
                  </span>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {doc.completionDate ? formatEthiopian(doc.completionDate) : '—'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 sm:col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Date of Official Issuance
                  </span>
                  <p className="text-xs font-semibold text-slate-700 mt-0.5">
                    {doc.issuedAt ? displayDateTime(doc.issuedAt) : '—'} ({doc.issuedAt ? formatEthiopian(doc.issuedAt) : ''})
                  </p>
                </div>
              </div>

              {/* Institutional Assurance */}
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-xs text-emerald-900 flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  This record is securely stored in the college institutional database. For further verification inquiries, contact the Registrar Office.
                </p>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
