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
  Wallet,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { SkeletonPage } from '../../components/ui/Skeleton';

export default function FinanceSettings() {
  const queryClient = useQueryClient();
  const [amountInput, setAmountInput] = useState('');

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
    monthlyDefaults: {
      amount: 0,
    },
    tutorialVideoUrl: '',
    enforcement: {
      blockDocuments: true,
      blockGraduation: true,
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'settings'],
    queryFn: async () => {
      const res = await api.get('/finance/settings');
      return res.data?.finance;
    },
  });

  useEffect(() => {
    if (data) {
      const amt = data.monthlyDefaults?.amount ?? 0;
      setAmountInput(amt ? String(amt / 100) : '');
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
        monthlyDefaults: {
          amount: amt,
        },
        tutorialVideoUrl: data.tutorialVideoUrl || '',
        enforcement: {
          blockDocuments: data.enforcement?.blockDocuments ?? true,
          blockGraduation: data.enforcement?.blockGraduation ?? true,
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
        subtitle="Manage default college bank accounts, monthly payment amounts, grace periods, and academic hold enforcement rules."
        icon={Settings}
      />

      {/* Two cards per row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT COLUMN */}
        <div className="space-y-6">
          {/* Default Bank Card */}
          <Card>
            <CardHeader
              title="Official Receiving Bank Account"
              subtitle="Default CBE bank details used as the target for new payment cycles and transfers."
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
                  <span>Send assigned teachers a per-programme notification of overdue students</span>
                </label>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* Monthly Payment Defaults */}
          <Card>
            <CardHeader
              title="Monthly Payment Amount"
              subtitle="Default per-month fee used when creating new payment cycles (per student, in ETB)."
              icon={Wallet}
            />
            <CardBody className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">
                  Default Monthly Fee (ETB)
                </label>
                <div className="mt-1 relative">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={amountInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAmountInput(val);
                      setForm({
                        ...form,
                        monthlyDefaults: {
                          amount: val === '' ? 0 : Math.round(Number(val) * 100),
                        },
                      });
                    }}
                    placeholder="e.g. 800"
                    className="block w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm text-slate-800 focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Amount: {amountInput ? `${amountInput} ETB` : 'No default preset'}.
                </p>
              </div>
            </CardBody>
          </Card>

          {/* Global Tutorial Video */}
          <Card>
            <CardHeader
              title="Official Portal Tutorial Video"
              subtitle="Global YouTube embed link shown to students across all monthly payment cycles."
              icon={Video}
            />
            <CardBody className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">
                  YouTube Tutorial Embed Link
                </label>
                <input
                  type="url"
                  value={form.tutorialVideoUrl || ''}
                  onChange={(e) => setForm({ ...form, tutorialVideoUrl: e.target.value })}
                  placeholder="e.g. https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID"
                  className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Shared across all monthly fee portals. Students can watch it anytime or skip.
                </p>
              </div>
            </CardBody>
          </Card>

          {/* Academic Hold Enforcement */}
          <Card>
            <CardHeader
              title="Financial Hold Enforcement Rules"
              subtitle="Overdue students keep full access to classes, assessments, and marks. Choose what stays blocked."
              icon={ShieldCheck}
            />
            <CardBody className="space-y-3">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[11px] font-medium text-emerald-700">
                Always allowed for overdue students: attendance marking, assessment/quiz submission, and course mark sheets.
              </div>

              {[
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
