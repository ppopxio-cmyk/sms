import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processVerifiedChapaPayment } from '../services/chapa.service.js';
import { PaymentCycle, StudentCharge, Payment, PaymentAttempt } from '../models/Finance.js';
import { Student } from '../models/Student.js';

vi.mock('../config/env.js', () => ({
  env: { NODE_ENV: 'test' },
}});

