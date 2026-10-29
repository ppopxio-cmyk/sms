import { describe, it, expect } from 'vitest';
import {
  parseCbeReceiptInput,
  checkNameTokenMatch,
  checkReceiverAccountMatch,
  extractCbeTransactionFields,
} from '../services/cbeVerifier.service.js';

describe('CBE Verifier Service', () => {
  describe('parseCbeReceiptInput', () => {
    it('parses Nuxt v2 token URLs', () => {
      const res = parseCbeReceiptInput('https://mbreciept.cbe.com.et/v2-abc123xyz789');
      expect(res.type).toBe('json_token');
      expect(res.token).toBe('v2-abc123xyz789');
    });

    it('parses direct alphanumeric token URLs', () => {
      const res = parseCbeReceiptInput('https://mbreciept.cbe.com.et/9a8b7c6d5e4f3a2b1c0d');
      expect(res.type).toBe('json_token');
      expect(res.token).toBe('9a8b7c6d5e4f3a2b1c0d');
    });

    it('parses dashed FT reference URLs (Port 100 fallback)', () => {
      const res = parseCbeReceiptInput('https://mbreciept.cbe.com.et/FT2401019999-1000123456');
      expect(res.type).toBe('pdf_ref');
      expect(res.ftRef).toBe('FT2401019999');
      expect(res.accSuffix).toBe('1000123456');
    });

    it('parses BranchReceipt format with & delimiter', () => {
      const res = parseCbeReceiptInput('https://apps.cbe.com.et:100/BranchReceipt/FT2401018888&1000987654');
      expect(res.type).toBe('pdf_ref');
      expect(res.ftRef).toBe('FT2401018888');
      expect(res.accSuffix).toBe('1000987654');
    });

    it('parses legacy ?id= query URLs', () => {
      const res = parseCbeReceiptInput('https://apps.cbe.com.et:100/?id=FT24010177771000123456');
      expect(res.type).toBe('pdf_ref');
      expect(res.ftRef).toBe('FT2401017777');
      expect(res.accSuffix).toBe('1000123456');
    });

    it('rejects SSRF malicious domains', () => {
      expect(() => parseCbeReceiptInput('https://evil-attacker.com/steal-money')).toThrow();
      expect(() => parseCbeReceiptInput('https://localhost:8080/admin')).toThrow();
    });
  });

  describe('checkNameTokenMatch', () => {
    it('matches exact name tokens regardless of order', () => {
      expect(checkNameTokenMatch('Semir Muleta Adam', 'MULETA SEMIR')).toBe(true);
      expect(checkNameTokenMatch('Semir Muleta', 'Semir Muleta Adam')).toBe(true);
    });

    it('matches uppercase or partial tokens with >= 50% overlap', () => {
      expect(checkNameTokenMatch('Abebe Bikila', 'ABEBE BIKILA')).toBe(true);
      expect(checkNameTokenMatch('Haile Gebre Selassie', 'HAILE GEBRE')).toBe(true);
    });

    it('rejects completely different payer names', () => {
      expect(checkNameTokenMatch('Semir Muleta', 'Kebede Chala')).toBe(false);
      expect(checkNameTokenMatch('Tigist Alemu', 'Dawit Yohannes')).toBe(false);
    });
  });

  describe('checkReceiverAccountMatch', () => {
    it('matches identical accounts', () => {
      expect(checkReceiverAccountMatch('1000123456789', '1000123456789')).toBe(true);
    });

    it('matches accounts matching the last 8 digits', () => {
      expect(checkReceiverAccountMatch('1000123456789', '0123456789')).toBe(true);
    });

    it('rejects mismatching accounts', () => {
      expect(checkReceiverAccountMatch('1000123456789', '9999888877776')).toBe(false);
    });
  });

  describe('extractCbeTransactionFields', () => {
    it('correctly maps JSON backend transaction fields and converts ETB to Santim', () => {
      const mockJson = {
        data: {
          transactionReference: 'FT2401010001',
          amount: '1,500.00',
          senderName: 'SEMIR MULETA',
          receiverName: 'HARAMAYA COLLEGE',
          receiverAccount: '1000123456789',
          status: 'SUCCESS',
          transactionDate: '2026-10-29T10:00:00Z',
        },
      };

      const extracted = extractCbeTransactionFields(mockJson);
      expect(extracted).not.toBeNull();
      expect(extracted.reference).toBe('FT2401010001');
      expect(extracted.amountSantim).toBe(150000); // 1500 * 100 santim
      expect(extracted.senderName).toBe('SEMIR MULETA');
      expect(extracted.isSuccess).toBe(true);
    });
  });
});
