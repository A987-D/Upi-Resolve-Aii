import type { Decision, Evidence } from './types.ts';

/** The ONLY four LLM jobs. None of them sets amounts, dates or tiers. */
export interface Model {
  extract(complaint: string): Promise<{ intent: string; txnId?: string; claim: Evidence['customerClaim'] }>;
  summarise(ev: Evidence): Promise<string>;
  reply(status: string, d: Decision): Promise<string>;
  brief(ev: Evidence, d: Decision): Promise<string>;
}

export const mockModel: Model = {
  async extract(text) {
    const txnId = text.match(/TXN-[A-Z0-9-]+/)?.[0];
    const claim = /not received|never received|didn'?t receive|haven'?t received|have not received/i.test(text) ? 'not_received'
      : /deduct|debit|paid|never confirmed/i.test(text) ? 'money_deducted' : 'unknown';
    return { intent: 'payment_dispute', txnId, claim };
  },
  async summarise(ev) {
    return `Txn ${ev.paytm?.status ?? 'unknown'}; bank ${ev.bank?.status ?? 'unknown'}; merchant confirmed: ${ev.callback?.merchantConfirmed ?? 'unknown'}; UDIR ${ev.udir?.status ?? 'n/a'}.`;
  },
  // Amounts are copied from the deterministic decision, never generated.
  async reply(status, d) {
    if (d.action === 'close') return `Good news: your reversal is verified and your case is closed. ${d.reason}`;
    if (d.action === 'propose_refund') return `We verified your payment. A refund of ₹${d.refundInr} plus ₹${d.compensationInr} compensation has been sent to a support agent for approval.`;
    if (d.action === 'wait') return 'Your payment is still inside the expected timeline. We will keep tracking it.';
    return `Your case has been passed to a specialist with a full summary. Status: ${status}.`;
  },
  async brief(ev, d) { return `Escalation (${d.rule}): ${d.reason} Evidence: bank ${ev.bank?.status}, merchant confirmed ${ev.callback?.merchantConfirmed}, claim ${ev.customerClaim}. No money action taken.`; },
};

/** Gemini-compatible REST adapter. NOT exercised by tests (needs a key + network). Falls back to the mock on any failure. */
export function geminiModel(apiKey: string, modelName = 'gemini-1.5-flash', fallback: Model = mockModel): Model {
  const ask = async (prompt: string) => {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    if (!r.ok) throw new Error(`LLM ${r.status}`);
    const j = await r.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  };
  const safe = async <T>(f: () => Promise<T>, fb: () => Promise<T>) => { try { return await f(); } catch { return fb(); } };
  return {
    extract: (t) => fallback.extract(t), // regex extraction kept deterministic
    summarise: (ev) => safe(() => ask(`Summarise this payment evidence in one sentence. Do not state amounts or decisions: ${JSON.stringify(ev)}`), () => fallback.summarise(ev)),
    reply: (s, d) => safe(async () => { const t = await ask(`Write a short polite customer update. Status: ${s}. Facts (copy exactly, add nothing): ${JSON.stringify({ refund: d.refundInr, compensation: d.compensationInr, reason: d.reason })}`); return t || fallback.reply(s, d); }, () => fallback.reply(s, d)),
    brief: (ev, d) => safe(() => ask(`Write a short escalation brief. Take no money action. Facts: ${JSON.stringify({ ev, reason: d.reason })}`), () => fallback.brief(ev, d)),
  };
}
