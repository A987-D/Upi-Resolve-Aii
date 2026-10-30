import { createHash } from 'node:crypto';

export interface AuditEntry { seq: number; ts: string; caseId: string; type: string; data: unknown; prevHash: string; hash: string }
const hashOf = (e: Omit<AuditEntry, 'hash'>) => createHash('sha256').update(JSON.stringify([e.seq, e.ts, e.caseId, e.type, e.data, e.prevHash])).digest('hex');

export class AuditLog {
  entries: AuditEntry[] = [];
  private now: () => string;
  constructor(now: () => string = () => new Date().toISOString()) { this.now = now; }
  append(caseId: string, type: string, data: unknown = {}): AuditEntry {
    const prevHash = this.entries.at(-1)?.hash ?? 'GENESIS';
    const partial = { seq: this.entries.length, ts: this.now(), caseId, type, data: JSON.parse(JSON.stringify(data)), prevHash };
    const entry = { ...partial, hash: hashOf(partial) };
    this.entries.push(entry);
    return entry;
  }
  /** Returns { ok, brokenAt }. Tamper-evident only (demo-grade). */
  verify(): { ok: boolean; brokenAt?: number } {
    let prev = 'GENESIS';
    for (const e of this.entries) {
      const { hash, ...rest } = e;
      if (e.prevHash !== prev || hashOf(rest) !== hash) return { ok: false, brokenAt: e.seq };
      prev = hash;
    }
    return { ok: true };
  }
  forCase(caseId: string) { return this.entries.filter((e) => e.caseId === caseId); }
}
