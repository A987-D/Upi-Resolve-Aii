import type { Decision, Evidence } from './types.ts';

// Synthetic policy parameters taken from the pitch deck. Example values, not verified payment rules.
export const POLICY = { p2pDays: 1, merchantDays: 5, compensationPerDayInr: 100, capPerActionInr: 5000 };

const base = (o: Partial<Decision> & Pick<Decision, 'rule' | 'tier' | 'action' | 'reason'>): Decision => ({
  refundInr: 0, compensationInr: 0, deadlineDays: null, delayDays: 0, ...o,
});

/** Pure, deterministic. The LLM never touches this. */
export function decide(ev: Evidence, killSwitch = false): Decision {
  if (killSwitch) return base({ rule: 'KILL-SWITCH', tier: 'T3', action: 'escalate', reason: 'Kill switch active: no automated action.' });
  const p = ev.paytm;
  if (!p) return base({ rule: 'INSUFFICIENT-EVIDENCE', tier: 'T3', action: 'escalate', reason: 'No transaction record found.' });

  if (ev.bank?.status === 'CREDITED' && ev.callback?.merchantConfirmed === false && ev.customerClaim === 'not_received')
    return base({ rule: 'UPI-CONFLICT-S09', tier: 'T3', action: 'escalate', reason: 'Bank says credited, merchant says unpaid, customer says not received.' });

  const deadline = p.type === 'P2P' ? POLICY.p2pDays : POLICY.merchantDays;

  if (p.status === 'FAILED') {
    const r = ev.bank?.reversal;
    if (r && r.day <= deadline)
      return base({ rule: 'UPI-REVERSAL-VERIFIED', tier: 'T1', action: 'close', deadlineDays: deadline, reason: `Reversal credit with RRN ${r.rrn} found on day T+${r.day}, inside T+${deadline}.` });
    if (r) return base({ rule: 'UPI-REVERSAL-LATE-REVIEW', tier: 'T3', action: 'escalate', deadlineDays: deadline, reason: 'Reversal arrived after the deadline; needs human review.' });
    if (p.daysElapsed <= deadline) return base({ rule: 'UPI-WITHIN-DEADLINE', tier: 'T0', action: 'wait', deadlineDays: deadline, reason: 'No reversal yet but still inside the deadline.' });
    return base({ rule: 'UPI-NO-REVERSAL-REVIEW', tier: 'T3', action: 'escalate', deadlineDays: deadline, reason: 'Deadline passed with no reversal found.' });
  }

  if (p.type === 'MERCHANT' && p.status === 'DEBITED' && ev.callback?.merchantConfirmed === false) {
    if (p.daysElapsed <= deadline) return base({ rule: 'UPI-WITHIN-DEADLINE', tier: 'T0', action: 'wait', deadlineDays: deadline, reason: 'Merchant confirmation still inside the deadline.' });
    const delay = p.daysElapsed - deadline;
    const comp = delay * POLICY.compensationPerDayInr;
    if (p.amount > POLICY.capPerActionInr || p.amount + comp > POLICY.capPerActionInr)
      return base({ rule: 'CAP-EXCEEDED', tier: 'T3', action: 'escalate', deadlineDays: deadline, delayDays: delay, reason: `Action exceeds the ₹${POLICY.capPerActionInr} per-action cap.` });
    return base({ rule: 'UPI-MERCHANT-T5', tier: 'T2', action: 'propose_refund', refundInr: p.amount, compensationInr: comp, deadlineDays: deadline, delayDays: delay,
      reason: `Debited, no merchant confirmation on T+${p.daysElapsed}; deadline T+${deadline} breached by ${delay} day(s).` });
  }
  return base({ rule: 'NO-RULE', tier: 'T3', action: 'escalate', reason: 'No rule matches this evidence.' });
}
