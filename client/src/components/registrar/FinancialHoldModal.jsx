import { useNavigate } from 'react-router-dom';
import { AlertCircle, CreditCard, ExternalLink, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

export default function FinancialHoldModal({ open, onClose, student, holdInfo }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const charges = holdInfo?.overdueCharges || [];
  const paymentUrl = holdInfo?.paymentLink
    ? `${window.location.origin}${holdInfo.paymentLink}`
    : null;

  const handleCopyLink = async () => {
    if (!paymentUrl) return;
    try {
      await navigator.clipboard.writeText(paymentUrl);
      setCopied(true);
      toast.success('Payment portal link copied to clipboard.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy link to clipboard.');
    }
  };

  const handleViewFinance = () => {
    if (student?.id) {
      onClose?.();
      navigate(`/registrar/students/${student.id}/finance`);
    }
  };

  return (
    <Modal
      open={open}
      title="Financial Clearance Required"
      subtitle="Document issuance is temporarily held until outstanding fees are cleared."
      onClose={onClose}
      size="md"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <div className="flex items-center gap-2">
            {paymentUrl ? (
              <Button variant="outline" onClick={handleCopyLink}>
                {copied ? <Check className="mr-1.5 h-4 w-4 text-emerald-600" /> : <Copy className="mr-1.5 h-4 w-4" />}
                {copied ? 'Copied' : 'Copy Pay Link'}
              </Button>
            ) : null}
            <Button onClick={handleViewFinance}>
              <CreditCard className="mr-1.5 h-4 w-4" />
              View Finance History
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900">
                {student?.name || 'This student'} ({student?.studentId || student?.id || 'ID'}) has an active financial hold.
              </p>
              <p className="mt-1 text-amber-800">
                {holdInfo?.message || 'Outstanding monthly tuition must be resolved with the Finance Office before official credentials can be issued.'}
              </p>
            </div>
          </div>
        </div>

        {charges.length > 0 ? (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Outstanding Billing Cycles
            </h4>
            <div className="mt-2 space-y-2">
              {charges.map((charge, idx) => (
                <div
                  key={charge.id || idx}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm"
                >
                  <div>
                    <span className="font-semibold text-slate-800">{charge.title || 'Tuition Fee'}</span>
                    {charge.dueAt ? (
                      <span className="ml-2 text-xs text-slate-500">
                        Due: {new Date(charge.dueAt).toLocaleDateString()}
                      </span>
                    ) : null}
                  </div>
                  <span className="font-bold text-rose-600">
                    {charge.amountDueEtb || ((charge.amountDue || 0) / 100).toFixed(2)} ETB
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {holdInfo?.totalOutstandingEtb ? (
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm font-semibold">
            <span className="text-slate-600">Total Outstanding:</span>
            <span className="text-base text-rose-700">{holdInfo.totalOutstandingEtb} ETB</span>
          </div>
        ) : null}

        <p className="text-xs text-slate-500">
          Once the student submits payment and the Accountant confirms it, clearance is automatically granted and credentials can be issued immediately.
        </p>
      </div>
    </Modal>
  );
}
