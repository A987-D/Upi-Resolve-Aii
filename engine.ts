import { AuditLog } from './audit.ts';
import { decide } from './policy.ts';
import { withTimeout, type Connectors } from './connectors.ts';
import type { Actor, Case, Evidence } from './types.ts';
import type { Model } from './model.ts';

export interface EngineDeps { model: Model; connectors: Connectors; audit: AuditLog; killSwitch?: () => boolean; maxAttempts?: number; timeoutMs?: number }
export class ValidationError extends Error {}
export class ForbiddenError extends Error {}

export class Engine {
  cases = new Map<string, Case>();
  private n = 0;
  private d: EngineDeps;
  constructor(d: EngineDeps) { this.d = d; }
  get audit() { return this.d.audit; }

  async createCase(input: { complaint: unknown; txnId: unknown }): Promise<Case> {
    const { complaint, txnId } = input;
    if (typeof complaint !== 'string' || complaint.trim().length < 5 || complaint.length > 1000) throw new ValidationError('complaint must be 5-1000 characters');
    if (typeof txnId !== 'string' || !/^TXN-[A-Z0-9-]{2,20}$/.test(txnId)) throw new ValidationError('txnId must look like TXN-S04');
    const id = `CASE-${String(++this.n).padStart(4, '0')}`;
    const { audit, model, connectors: c } = this.d;
    audit.append(id, 'CASE_CREATED', { txnId });

    const ex = await model.extract(complaint); // LLM job 1
    // T0: read-only evidence retrieval
    const [paytm, callback, udir, bank] = await Promise.all([c.paytm(txnId), c.callback(txnId), c.udir(txnId), c.bank(txnId)]);
    const evidence: Evidence = { paytm, callback, udir, bank, customerClaim: ex.claim };
    audit.append(id, 'EVIDENCE_RETRIEVED', evidence);

    const decision = decide(evidence, this.d.killSwitch?.() ?? false);
    audit.append(id, 'POLICY_DECISION', decision);

    const evidenceSummary = await model.summarise(evidence); // LLM job 2
    const k: Case = { id, txnId, complaint, status: 'pending', evidence, decision, evidenceSummary, customerReply: '' };

    if (decision.tier === 'T1' && decision.action === 'close') {
      k.status = 'resolved'; k.proof = evidence.bank?.reversal?.rrn;
      audit.append(id, 'EXECUTION_RESULT', { action: 'close_ticket', proofRrn: k.proof });
    } else if (decision.tier === 'T2') {
      k.status = 'awaiting_approval';
      k.approval = { idempotencyKey: `${id}:${decision.rule}`, rule: decision.rule, refundInr: decision.refundInr, compensationInr: decision.compensationInr, state: 'pending',
        call: `initiate_refund(${txnId}, ₹${decision.refundInr}) + record_compensation(₹${decision.compensationInr})` };
      audit.append(id, 'APPROVAL_REQUESTED', k.approval);
    } else if (decision.tier === 'T3') {
      await this.escalate(k, decision.reason);
    }
    k.customerReply = await model.reply(k.status, decision); // LLM job 3
    this.cases.set(id, k);
    return k;
  }

  private async escalate(k: Case, why: string) {
    k.status = 'escalated';
    k.escalationBrief = await this.d.model.brief(k.evidence, k.decision); // LLM job 4
    this.d.audit.append(k.id, 'ESCALATED', { why, brief: k.escalationBrief });
  }

  /** The ONLY path to a money action. Requires an authorised human agent. */
  async act(caseId: string, action: 'approve' | 'reject' | 'escalate', actor: Actor): Promise<Case> {
    if (actor?.role !== 'agent') { this.d.audit.append(caseId, 'UNAUTHORISED_ATTEMPT', { actor: actor?.id }); throw new ForbiddenError('only an authorised agent can act'); }
    const k = this.cases.get(caseId);
    if (!k) throw new ValidationError('unknown case');
    if (k.status !== 'awaiting_approval' || !k.approval) throw new ValidationError('case is not awaiting approval');
    const a = k.approval;
    a.decidedBy = actor.id;
    if (action === 'reject') { a.state = 'rejected'; k.status = 'rejected'; this.d.audit.append(caseId, 'REJECTED', { by: actor.id }); return k; }
    if (action === 'escalate') { a.state = 'rejected'; this.d.audit.append(caseId, 'ESCALATE_REQUESTED', { by: actor.id }); await this.escalate(k, 'Escalated by agent'); return k; }

    a.state = 'approved';
    this.d.audit.append(caseId, 'APPROVED', { by: actor.id, key: a.idempotencyKey });
    const max = this.d.maxAttempts ?? 3;
    for (let i = 1; i <= max; i++) {
      try {
        const r = await withTimeout(this.d.connectors.refund({ txnId: k.txnId, refundInr: a.refundInr, compensationInr: a.compensationInr, idempotencyKey: a.idempotencyKey }), this.d.timeoutMs ?? 2000);
        k.refundRef = r.ref; k.status = 'resolved';
        this.d.audit.append(caseId, 'EXECUTION_RESULT', { ok: true, ref: r.ref, attempt: i });
        return k;
      } catch (e) {
        this.d.audit.append(caseId, 'EXECUTION_ATTEMPT_FAILED', { attempt: i, error: String((e as Error).message), key: a.idempotencyKey });
      }
    }
    await this.escalate(k, `Refund API failed after ${max} attempts with the same idempotency key; state unknown, nothing confirmed paid.`);
    return k;
  }
}
