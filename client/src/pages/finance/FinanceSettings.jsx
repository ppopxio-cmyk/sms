import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  Building2,
  Clock,
  ShieldCheck,
  Save,
  Loader2,
  Bell,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { SkeletonPage } from '../../components/ui/Skeleton';

export default function FinanceSettings() {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    defaultBank: {
      bank: 'Commercial Bank of Ethiopia',
      accountNumber: '1000123456789',
      holderName: 'HARAMAYA HEALTH SCIENCE COLLEGE',
    },
    graceDays: 0,
    reminders: {
      daysBefore: [3, 1, 0],
      notifyTeachersOnOverdue: true,
    },
    enforcement: {
      blockAssessments: true,
      blockTeacherResults: true,
      blockDocuments: true,
      blockGraduation: true,
      blockRegistration: false,
    },
  });

  // Sandbox Test Tool removed: payments now use Chapa — no CBE verification needed.

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'settings'],
    queryFn: async () => {
      const res = await api.get('/finance/settings');
      return res.data?.finance;
    },
  });

  useEffect(() => {
    if (data) {
      setForm({
        defaultBank: {
          bank: data.defaultBank?.bank || 'Commercial Bank of Ethiopia',
          accountNumber: data.defaultBank?.accountNumber || '1000123456789',
          holderName: data.defaultBank?.holderName || 'HARAMAYA HEALTH SCIENCE COLLEGE',
        },
        graceDays: data.graceDays ?? 0,
        reminders: {
          daysBefore: data.reminders?.daysBefore || [3, 1, 0],
          notifyTeachersOnOverdue: data.reminders?.notifyTeachersOnOverdue ?? true,
        },
        enforcement: {
          blockAssessments: data.enforcement?.blockAssessments ?? true,
          blockTeacherResults: data.enforcement?.blockTeacherResults ?? true,
          blockDocuments: data.enforcement?.blockDocuments ?? true,
          blockGraduation: data.enforcement?.blockGraduation ?? true,
          blockRegistration: data.enforcement?.blockRegistration ?? false,
        },
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.put('/finance/settings', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Finance settings saved successfully.');
      queryClient.invalidateQueries({ queryKey: ['finance', 'settings'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) {
    return <SkeletonPage cards={3} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance Configuration & Verifier Tools"
        subtitle="Manage default college bank accounts, academic hold enforcement rules, grace periods, and verify live CBE receipts."
        icon={Settings}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Settings Form */}
        <div className="space-y-6">
          {/* Default Bank Card */}
          <Card>
            <CardHeader
              title="Official Receiving Bank Account"
              subtitle="Default CBE bank details used as the target for new payment cycles and CBE receipt verification."
              icon={Building2}
            />
            <CardBody className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={form.defaultBank.bank}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultBank: { ...form.defaultBank, bank: e.target.value },
                    })
                  }
                  className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">
                  Official Account Number
                </label>
                <input
                  type="text"
                  value={form.defaultBank.accountNumber}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultBank: { ...form.defaultBank, accountNumber: e.target.value },
                    })
                  }
                  className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">
                  Account Holder Name
                </label>
                <input
                  type="text"
                  value={form.defaultBank.holderName}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultBank: { ...form.defaultBank, holderName: e.target.value },
                    })
                  }
                  className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
                />
              </div>
            </CardBody>
          </Card>

          {/* Grace Days & Reminders */}
          <Card>
            <CardHeader
              title="Grace Days & Hold Triggers"
              subtitle="Number of calendar days after dueAt before automatic academic holds take effect."
              icon={Clock}
            />
            <CardBody className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">
                  Grace Period (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={form.graceDays}
                  onChange={(e) => setForm({ ...form, graceDays: Number(e.target.value) })}
                  className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
                />
                <p className="mt-1 text-xs text-slate-400">
                  0 days means holds take effect immediately at the end of the due date.
                </p>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.reminders.notifyTeachersOnOverdue}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        reminders: {
                          ...form.reminders,
                          notifyTeachersOnOverdue: e.target.checked,
                        },
                      })
                    }
                    className="rounded text-brand-600 focus:ring-brand-500"
                  />
                  <span>Send teachers a class summary notification of students on hold</span>
                </label>
              </div>
            </CardBody>
          </Card>

          {/* Academic Hold Block Toggles */}
          <Card>
            <CardHeader
              title="Academic Hold Enforcement Rules"
              subtitle="Select which academic workflows are strictly blocked when a student is on financial hold."
              icon={ShieldCheck}
            />
            <CardBody className="space-y-3">
              {[
                {
                  key: 'blockAssessments',
                  label: 'Block Student Assessment / Quiz Submission',
                  desc: 'Students receive hold warning with payment portal link instead of upload screen.',
                },
                {
                  key: 'blockTeacherResults',
                  label: 'Block Teacher Results Submission',
                  desc: 'Displays a lock icon on teacher mark sheets; blocks submitting results for students on hold.',
                },
                {
                  key: 'blockDocuments',
                  label: 'Block Certificate, Transcript & ID Card Issuance',
                  desc: 'Registrars cannot issue official certificates, transcripts, or badges while fees are unpaid.',
                },
                {
                  key: 'blockGraduation',
                  label: 'Block Graduation Evaluation',
                  desc: 'Marks student as ineligible for graduation with reason "Unpaid fees".',
                },
                {
                  key: 'blockRegistration',
                  label: 'Block New Course Registration (Optional)',
                  desc: 'Prevent registering into future semester courses until all prior fees are settled.',
                },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-start gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form.enforcement[item.key]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        enforcement: {
                          ...form.enforcement,
                          [item.key]: e.target.checked,
                        },
                      })
                    }
                    className="mt-0.5 rounded text-brand-600 focus:ring-brand-500"
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{item.label}</p>
                    <p className="text-[11px] text-slate-400">{item.desc}</p>
                  </div>
                </label>
              ))}

              <div className="pt-2">
                <Button
                  onClick={() => saveMutation.mutate(form)}
                  disabled={saveMutation.isPending}
                >
                  <Save className="h-4 w-4" />
                  <span>{saveMutation.isPending ? 'Saving...' : 'Save Finance Settings'}</span>
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>

      </div>
    </div>
  );
}
