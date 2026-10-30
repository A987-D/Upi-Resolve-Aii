export type Tier = 'T0' | 'T1' | 'T2' | 'T3';
export type CaseStatus = 'pending' | 'resolved' | 'awaiting_approval' | 'escalated' | 'rejected';
export type TxnType = 'P2P' | 'MERCHANT';

export interface Evidence {
  paytm: { amount: number; type: TxnType; status: 'FAILED' | 'DEBITED'; daysElapsed: number } | null;
  callback: { merchantConfirmed: boolean } | null;
  udir: { status: string } | null;
  bank: { status: 'CREDITED' | 'DEBITED' | 'REVERSED' | 'UNKNOWN'; reversal?: { rrn: string; day: number } } | null;
  customerClaim: 'not_received' | 'money_deducted' | 'unknown';
}

export interface Decision {
  rule: string;
  tier: Tier;
  action: 'close' | 'propose_refund' | 'escalate' | 'wait';
  refundInr: number;
  compensationInr: number;
  deadlineDays: number | null;
  delayDays: number;
  reason: string;
}

export interface Actor { id: string; role: 'agent' | 'customer' }

export interface Approval {
  idempotencyKey: string;
  call: string;
  refundInr: number;
  compensationInr: number;
  rule: string;
  state: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
}

export interface Case {
  id: string;
  txnId: string;
  complaint: string;
  status: CaseStatus;
  evidence: Evidence;
  decision: Decision;
  evidenceSummary: string;
  customerReply: string;
  escalationBrief?: string;
  proof?: string;
  refundRef?: string;
  approval?: Approval;
}
