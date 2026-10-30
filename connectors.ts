import type { Evidence, TxnType } from './types.ts';

// ALL DATA BELOW IS SYNTHETIC. All connectors are MOCK. No Paytm, bank, UPI or NPCI API is called.
interface Seed { amount: number; type: TxnType; status: 'FAILED' | 'DEBITED'; daysElapsed: number; merchantConfirmed: boolean;
  bank: 'CREDITED' | 'DEBITED' | 'REVERSED'; reversal?: { rrn: string; day: number }; udir: string; refundFault?: 'timeout'; label: string; sampleComplaint: string }

export const SEED: Record<string, Seed> = {
  'TXN-S02': { label: 'S02 Auto-close', amount: 1200, type: 'P2P', status: 'FAILED', daysElapsed: 1, merchantConfirmed: false, bank: 'REVERSED', reversal: { rrn: '600112233445', day: 1 }, udir: 'NONE',
    sampleComplaint: 'My ₹1,200 payment failed and the money was deducted.' },
  'TXN-S04': { label: 'S04 One-click refund', amount: 2499, type: 'MERCHANT', status: 'DEBITED', daysElapsed: 6, merchantConfirmed: false, bank: 'DEBITED', udir: 'NONE',
    sampleComplaint: 'I paid ₹2,499 to a merchant six days ago and they never confirmed it.' },
  'TXN-S09': { label: 'S09 Escalate', amount: 3200, type: 'MERCHANT', status: 'DEBITED', daysElapsed: 3, merchantConfirmed: false, bank: 'CREDITED', udir: 'OPEN',
    sampleComplaint: 'I paid but the merchant has not received it and I have not received my order.' },
  'TXN-S15': { label: 'S15 Safe failure (refund API times out)', amount: 2499, type: 'MERCHANT', status: 'DEBITED', daysElapsed: 6, merchantConfirmed: false, bank: 'DEBITED', udir: 'NONE', refundFault: 'timeout',
    sampleComplaint: 'I paid ₹2,499 to a merchant six days ago and they never confirmed it.' },
};

export interface RefundRequest { txnId: string; refundInr: number; compensationInr: number; idempotencyKey: string }
export interface Connectors {
  paytm(txnId: string): Promise<Evidence['paytm']>;
  callback(txnId: string): Promise<Evidence['callback']>;
  udir(txnId: string): Promise<Evidence['udir']>;
  bank(txnId: string): Promise<Evidence['bank']>;
  refund(r: RefundRequest): Promise<{ ref: string }>;
}

export function createMockConnectors() {
  const done = new Map<string, { ref: string }>();
  const stats = { realExecutions: 0, attempts: [] as string[] };
  const c: Connectors = {
    async paytm(id) { const s = SEED[id]; return s ? { amount: s.amount, type: s.type, status: s.status, daysElapsed: s.daysElapsed } : null; },
    async callback(id) { const s = SEED[id]; return s ? { merchantConfirmed: s.merchantConfirmed } : null; },
    async udir(id) { const s = SEED[id]; return s ? { status: s.udir } : null; },
    async bank(id) { const s = SEED[id]; return s ? { status: s.bank, reversal: s.reversal } : null; },
    async refund(r) {
      stats.attempts.push(r.idempotencyKey);
      if (SEED[r.txnId]?.refundFault === 'timeout') throw new Error('TIMEOUT');
      const prior = done.get(r.idempotencyKey);
      if (prior) return prior; // idempotent replay: no second execution
      stats.realExecutions++;
      const res = { ref: `MOCK-RF-${String(stats.realExecutions).padStart(4, '0')}` };
      done.set(r.idempotencyKey, res);
      return res;
    },
  };
  return { connectors: c, stats };
}

export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timer = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error('TIMEOUT')), ms); });
  try { return await Promise.race([p, timer]); } finally { clearTimeout(t!); }
}
