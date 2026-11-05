import { describe, it, expect, vi } from 'vitest';
import { processVerifiedChapaPayment } from '../services/chapa.service.js';
import { PaymentCycle, StudentCharge, Payment, PaymentAttempt } from '../models/Finance.js';
import { Student } from '../models/Student.js';

vi.mock('../config/env.js', () => ({
  env: { NODE_ENV: 'test' },
}));

describe('processVerifiedChapaPayment — idempotency & pending status', () => {
  const chargeId = '6727a892b1029384756cba01';
  const cycleId = '6727a892b1029384756cba02';
  const studentId = '6727a892b1029384756cba03';
  const txRef = `TX-CHAPA-${chargeId}-9999`;

  function resetMocks() {
    vi.clearAllMocks();
    const mockCharge = {
      _id: chargeId,
      amountDue: 150000,
      status: 'unpaid',
      cycle: cycleId,
      student: studentId,
      dueAt: new Date(Date.now() + 86400000),
      save: vi.fn().mockResolvedValue(true),
    };
    const mockCycle = { _id: cycleId, ethYear: 2019, dueAt: mockCharge.dueAt };
    const mockStudent = { _id: studentId, studentId: 'NUR-001', fullName: 'Semir Muleta' };
    vi.spyOn(StudentCharge, 'findById').mockResolvedValue(mockCharge);
    vi.spyOn(PaymentCycle, 'findById').mockResolvedValue(mockCycle);
    vi.spyOn(Student, 'findById').mockResolvedValue(mockStudent);
    vi.spyOn(PaymentAttempt, 'findOne').mockResolvedValue(null);
    vi.spyOn(Payment, 'countDocuments').mockResolvedValue(0);
    return { mockCharge, mockCycle, mockStudent };
  }

  describe('already-paid transactions (idempotency)', () => {
    it('returns alreadyPaid:true without calling Chapa or creating a Payment when the charge is already confirmed', async () => {
      const existingPayment = {
        _id: 'pay1',
        receiptNumber: 'REC-2019-0001-111111',
        doneHash: 'abc123',
        amount: 150000,
        status: 'confirmed',
        paidAt: new Date(),
      };
      const mockCharge = {
        _id: chargeId,
        amountDue: 150000,
        status: 'paid',
        payment: existingPayment._id,
        cycle: cycleId,
        student: studentId,
        save: vi.fn(),
      };
      vi.spyOn(StudentCharge, 'findById').mockResolvedValue(mockCharge);
      vi.spyOn(PaymentCycle, 'findById').mockResolvedValue({ _id: cycleId, ethYear: 2019 });
      vi.spyOn(Student, 'findById').mockResolvedValue({ _id: studentId, studentId: 'NUR-001', fullName: 'Semir Muleta' });
      vi.spyOn(Payment, 'findById').mockReturnValue({ lean: vi.fn().mockResolvedValue(existingPayment) });
      vi.spyOn(PaymentAttempt, 'findOne').mockResolvedValue(null);

      const result = await processVerifiedChapaPayment({ txRef, verifiedData: {} });
      expect(result.status).toBe('success');
      expect(result.alreadyPaid).toBe(true);
      expect(result.doneHash).toBe('abc123');
      expect(result.receiptNumber).toBe('REC-2019-0001-111111');
    });

    it('re-links a confirmed Payment to the charge if the charge status is paid but payment link is missing (controller handles)', async () => {
      const existingPayment = {
        _id: 'pay2',
        receiptNumber: 'REC-2019-0002-222222',
        doneHash: 'def456',
        amount: 150000,
        status: 'confirmed',
        paidAt: new Date(),
      };
      // Charge already marked paid but payment ID was not saved (restart/interruption case).
      // Service returns alreadyPaid when both status='paid' AND payment reference is set.
      const mockCharge = {
        _id: chargeId,
        amountDue: 150000,
        status: 'paid',
        payment: existingPayment._id,
        cycle: cycleId,
        student: studentId,
        save: vi.fn(),
      };
      vi.spyOn(StudentCharge, 'findById').mockResolvedValue(mockCharge);
      vi.spyOn(Payment, 'findById').mockReturnValue({ lean: vi.fn().mockResolvedValue(existingPayment) });
      vi.spyOn(PaymentAttempt, 'findOne').mockResolvedValue(null);

      const result = await processVerifiedChapaPayment({ txRef, verifiedData: {} });
      expect(result.status).toBe('success');
      expect(result.alreadyPaid).toBe(true);
      expect(result.receiptNumber).toBe('REC-2019-0002-222222');
    });
  });

  describe('pending transactions', () => {
    it('returns status pending when Chapa status is "pending" (still processing)', async () => {
      resetMocks();
      const verifiedData = { status: 'pending', amount: '1500.00', currency: 'ETB' };
      const result = await processVerifiedChapaPayment({ txRef, verifiedData });
      expect(result.status).toBe('pending');
      expect(result.message).toContain('still being processed');
    });

    it('keeps the charge unpaid when Chapa status is pending', async () => {
      const { mockCharge } = resetMocks();
      const verifiedData = { status: 'pending', amount: '1500.00', currency: 'ETB' };
      await processVerifiedChapaPayment({ txRef, verifiedData });
      expect(mockCharge.status).toBe('unpaid');
    });
  });

  describe('failed transactions', () => {
    it('returns status failed when Chapa status is "failed"', async () => {
      resetMocks();
      const verifiedData = { status: 'failed', amount: '1500.00', currency: 'ETB' };
      const result = await processVerifiedChapaPayment({ txRef, verifiedData });
      expect(result.status).toBe('failed');
    });

    it('does NOT create a Payment record when Chapa status is failed', async () => {
      const { mockCharge } = resetMocks();
      const createSpy = vi.spyOn(Payment, 'create');
      const verifiedData = { status: 'failed', amount: '1500.00', currency: 'ETB' };
      await processVerifiedChapaPayment({ txRef, verifiedData });
      expect(createSpy).not.toHaveBeenCalled();
      expect(mockCharge.status).toBe('unpaid');
    });
  });

  describe('invalid references and duplicate requests', () => {
    it('returns alreadyPaid:true on a duplicate call for an already-confirmed payment', async () => {
      const existingPayment = {
        _id: 'pay3',
        receiptNumber: 'REC-2019-0003-333333',
        doneHash: 'ghi789',
        amount: 150000,
        status: 'confirmed',
        paidAt: new Date(),
      };
      const mockCharge = {
        _id: chargeId,
        amountDue: 150000,
        status: 'paid',
        payment: existingPayment._id,
        cycle: cycleId,
        student: studentId,
        save: vi.fn(),
      };
      vi.spyOn(StudentCharge, 'findById').mockResolvedValue(mockCharge);
      vi.spyOn(Payment, 'findById').mockReturnValue({ lean: vi.fn().mockResolvedValue(existingPayment) });
      vi.spyOn(PaymentAttempt, 'findOne').mockResolvedValue(null);

      const r1 = await processVerifiedChapaPayment({ txRef, verifiedData: {} });
      const r2 = await processVerifiedChapaPayment({ txRef, verifiedData: {} });
      expect(r1.status).toBe('success');
      expect(r2.status).toBe('success');
      expect(r2.alreadyPaid).toBe(true);
    });

    it('throws STUDENT_NOT_FOUND when the charge cannot be resolved from the txRef', async () => {
      resetMocks();
      vi.spyOn(StudentCharge, 'findById').mockResolvedValue(null);
      vi.spyOn(PaymentAttempt, 'findOne').mockResolvedValue(null);
      await expect(processVerifiedChapaPayment({ txRef: 'INVALID-TXREF', verifiedData: {} }))
        .rejects
        .toThrow(/Could not locate matching student charge record/i);
    });

    it('throws when the charge exists but cycle/student are missing', async () => {
      const { mockCharge } = resetMocks();
      vi.spyOn(PaymentCycle, 'findById').mockResolvedValue(null);
      await expect(processVerifiedChapaPayment({ txRef, verifiedData: {} }))
        .rejects
        .toThrow(/Could not locate matching student charge record/i);
    });
  });

  describe('amount and currency validation', () => {
    it('throws AMOUNT_MISMATCH when Chapa reports a different amount', async () => {
      resetMocks();
      const verifiedData = { status: 'success', amount: '999.00', currency: 'ETB' };
      await expect(processVerifiedChapaPayment({ txRef, verifiedData }))
        .rejects
        .toThrow(/Payment amount 999\.00 ETB does not match expected fee/);
    });

    it('throws CURRENCY_MISMATCH when Chapa reports non-ETB currency', async () => {
      resetMocks();
      const verifiedData = { status: 'success', amount: '1500.00', currency: 'USD' };
      await expect(processVerifiedChapaPayment({ txRef, verifiedData }))
        .rejects
        .toThrow(/Expected currency ETB but received USD/);
    });
  });
});
