import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  verifyChapaWebhookSignature,
  processVerifiedChapaPayment,
} from '../services/chapa.service.js';
import { PaymentCycle, StudentCharge, Payment, PaymentAttempt } from '../models/Finance.js';
import { Student } from '../models/Student.js';

describe('Chapa Payment Integration Service', () => {
  describe('verifyChapaWebhookSignature', () => {
    const secret = 'ea70dcd1ce65e737aa8dcc3995830643599a6560e6ed6093d009c12b10db2085';
    const payload = JSON.stringify({
      event: 'charge.completed',
      tx_ref: 'TX-CHAPA-12345',
      amount: '1500.00',
      currency: 'ETB',
    });

    it('verifies valid HMAC-SHA256 signatures accurately', () => {
      const validSig = crypto.createHmac('sha256', secret).update(Buffer.from(payload)).digest('hex');
      const isValid = verifyChapaWebhookSignature(Buffer.from(payload), validSig);
      expect(isValid).toBe(true);
    });

    it('rejects tampered or mismatched webhook signatures', () => {
      const tamperedSig = 'wrong_signature_hash_value_1234567890abcdef1234567890abcdef12345678';
      const isValid = verifyChapaWebhookSignature(Buffer.from(payload), tamperedSig);
      expect(isValid).toBe(false);
    });

    it('rejects empty or missing signature headers', () => {
      expect(verifyChapaWebhookSignature(Buffer.from(payload), '')).toBe(false);
      expect(verifyChapaWebhookSignature(Buffer.from(payload), null)).toBe(false);
    });
  });

  describe('processVerifiedChapaPayment Database Rules', () => {
    it('rejects payment if amount does not match expected fee', async () => {
      const mockCharge = {
        _id: '6727a892b1029384756cba01',
        amountDue: 150000, // 1500 ETB
        status: 'unpaid',
        cycle: '6727a892b1029384756cba02',
        student: '6727a892b1029384756cba03',
        save: vi.fn(),
      };
      const mockCycle = { _id: mockCharge.cycle, ethYear: 2019 };
      const mockStudent = { _id: mockCharge.student, studentId: 'NUR-001', fullName: 'Semir Muleta' };

      vi.spyOn(StudentCharge, 'findById').mockResolvedValue(mockCharge);
      vi.spyOn(PaymentCycle, 'findById').mockResolvedValue(mockCycle);
      vi.spyOn(Student, 'findById').mockResolvedValue(mockStudent);
      vi.spyOn(PaymentAttempt, 'findOne').mockResolvedValue(null);

      // Verified payload with wrong amount (e.g. 500 ETB instead of 1500 ETB)
      const verifiedData = {
        status: 'success',
        amount: '500.00',
        currency: 'ETB',
      };

      await expect(
        processVerifiedChapaPayment({
          txRef: `TX-CHAPA-${mockCharge._id}-1234`,
          verifiedData,
        })
      ).rejects.toThrow(/Payment amount 500\.00 ETB does not match expected fee 1500\.00 ETB/);

      // Verify database charge was NOT marked as paid
      expect(mockCharge.status).toBe('unpaid');
    });

    it('rejects payment if currency is not ETB', async () => {
      const mockCharge = {
        _id: '6727a892b1029384756cba01',
        amountDue: 150000, // 1500 ETB
        status: 'unpaid',
        cycle: '6727a892b1029384756cba02',
        student: '6727a892b1029384756cba03',
        save: vi.fn(),
      };
      const mockCycle = { _id: mockCharge.cycle, ethYear: 2019 };
      const mockStudent = { _id: mockCharge.student, studentId: 'NUR-001', fullName: 'Semir Muleta' };

      vi.spyOn(StudentCharge, 'findById').mockResolvedValue(mockCharge);
      vi.spyOn(PaymentCycle, 'findById').mockResolvedValue(mockCycle);
      vi.spyOn(Student, 'findById').mockResolvedValue(mockStudent);
      vi.spyOn(PaymentAttempt, 'findOne').mockResolvedValue(null);

      const verifiedData = {
        status: 'success',
        amount: '1500.00',
        currency: 'USD', // Wrong currency
      };

      await expect(
        processVerifiedChapaPayment({
          txRef: `TX-CHAPA-${mockCharge._id}-1234`,
          verifiedData,
        })
      ).rejects.toThrow(/Expected currency ETB but received USD/);

      expect(mockCharge.status).toBe('unpaid');
    });

    it('does NOT update database as paid when Chapa status is failed or cancelled', async () => {
      const mockCharge = {
        _id: '6727a892b1029384756cba01',
        amountDue: 150000,
        status: 'unpaid',
        cycle: '6727a892b1029384756cba02',
        student: '6727a892b1029384756cba03',
        save: vi.fn().mockResolvedValue(true),
      };
      const mockCycle = { _id: mockCharge.cycle, ethYear: 2019 };
      const mockStudent = { _id: mockCharge.student, studentId: 'NUR-001', fullName: 'Semir Muleta' };

      vi.spyOn(StudentCharge, 'findById').mockResolvedValue(mockCharge);
      vi.spyOn(PaymentCycle, 'findById').mockResolvedValue(mockCycle);
      vi.spyOn(Student, 'findById').mockResolvedValue(mockStudent);
      vi.spyOn(PaymentAttempt, 'findOne').mockResolvedValue(null);
      const paymentCreateSpy = vi.spyOn(Payment, 'create');

      const verifiedData = {
        status: 'failed',
        amount: '1500.00',
        currency: 'ETB',
      };

      const result = await processVerifiedChapaPayment({
        txRef: `TX-CHAPA-${mockCharge._id}-1234`,
        verifiedData,
      });

      expect(result.status).toBe('failed');
      expect(mockCharge.status).toBe('unpaid');
      expect(paymentCreateSpy).not.toHaveBeenCalled();
    });

    it('atomically marks charge as PAID and creates Payment record when verification succeeds', async () => {
      const mockCharge = {
        _id: '6727a892b1029384756cba01',
        amountDue: 150000,
        status: 'unpaid',
        cycle: '6727a892b1029384756cba02',
        student: '6727a892b1029384756cba03',
        save: vi.fn().mockResolvedValue(true),
      };
      const mockCycle = { _id: mockCharge.cycle, ethYear: 2019 };
      const mockStudent = { _id: mockCharge.student, studentId: 'NUR-001', fullName: 'Semir Muleta' };
      const mockPayment = {
        _id: '6727a892b1029384756cba99',
        receiptNumber: 'REC-2019-0001-123456',
        doneHash: 'abc123donehash',
        amount: 150000,
        status: 'confirmed',
      };

      vi.spyOn(StudentCharge, 'findById').mockResolvedValue(mockCharge);
      vi.spyOn(PaymentCycle, 'findById').mockResolvedValue(mockCycle);
      vi.spyOn(Student, 'findById').mockResolvedValue(mockStudent);
      vi.spyOn(PaymentAttempt, 'findOne').mockResolvedValue(null);
      vi.spyOn(Payment, 'countDocuments').mockResolvedValue(0);
      vi.spyOn(Payment, 'create').mockResolvedValue(mockPayment);
      vi.spyOn(PaymentAttempt, 'create').mockResolvedValue({});

      const verifiedData = {
        status: 'success',
        amount: '1500.00',
        currency: 'ETB',
        reference: 'CHAPA-REF-999',
        first_name: 'Semir',
        last_name: 'Muleta',
      };

      const result = await processVerifiedChapaPayment({
        txRef: `TX-CHAPA-${mockCharge._id}-1234`,
        verifiedData,
      });

      expect(result.status).toBe('success');
      expect(mockCharge.status).toBe('paid');
      expect(mockCharge.payment).toBe(mockPayment._id);
      expect(result.receiptNumber).toBeDefined();
      expect(result.doneHash).toBeDefined();
    });
  });
});
