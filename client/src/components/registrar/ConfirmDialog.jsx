import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Field from '../ui/Field';

// Destructive or official actions always pass through this dialog. When a written reason is
// required the confirm button stays disabled until it is long enough, so the server receives
// a real audit trail instead of an empty string.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  loading = false,
  onClose,
  onConfirm,
  reason,
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setValue('');
      setError('');
    }
  }, [open]);

  const minimum = reason?.minLength ?? 0;
  const needsReason = Boolean(reason);
  const valid = !needsReason || value.trim().length >= minimum;

  const submit = () => {
    if (!valid) {
      setError(`Please write at least ${minimum} characters.`);
      return;
    }
    onConfirm?.(value.trim());
  };

  return (
    <Modal
      open={open}
      title={title}
      subtitle={message}
      onClose={loading ? undefined : onClose}
      dismissible={!loading}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={submit} loading={loading} disabled={!valid}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {reason ? (
        <Field
          label={reason.label || 'Reason'}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError('');
          }}
          placeholder={reason.placeholder || 'Write the reason for the record'}
          error={error}
          hint={reason.hint || `At least ${minimum} characters. This is stored in the audit history.`}
          autoFocus
        />
      ) : (
        <p className="text-sm leading-relaxed text-slate-600">
          This action is recorded against your Registrar account.
        </p>
      )}
    </Modal>
  );
}
