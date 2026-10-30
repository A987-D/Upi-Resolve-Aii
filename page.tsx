'use client';
import { useEffect, useState } from 'react';

export default function Agent() {
  const [cases, setCases] = useState<any[]>([]); const [token, setToken] = useState('demo-agent-token');
  const [audit, setAudit] = useState<any>(null); const [msg, setMsg] = useState('');
  async function load() { setCases((await (await fetch('/api/cases')).json()).cases); setAudit(await (await fetch('/api/audit')).json()); }
  useEffect(() => { load(); }, []);
  async function act(id: string, action: string) {
    setMsg(''); const r = await fetch(`/api/cases/${id}/action`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-token': token }, body: JSON.stringify({ action }) });
    const j = await r.json(); if (!r.ok) setMsg(j.error); load();
  }
  return (<>
    <div className="card"><h2>Agent approval console <span className="pill awaiting_approval">MOCK</span></h2>
      <label>Agent token (local demo value from .env.local)</label><input value={token} onChange={(e) => setToken(e.target.value)} />
      <button className="alt" onClick={load}>Reload</button>{msg && <p className="err">{msg}</p>}
      {audit && <p className="small">Audit chain: {audit.integrity.ok ? 'intact' : `BROKEN at entry ${audit.integrity.brokenAt}`} · {audit.entries.length} entries</p>}
    </div>
    {cases.length === 0 && <p className="small">No cases yet. Submit one from the customer page.</p>}
    {cases.map((k) => <div className="card" key={k.id}>
      <h3>{k.id} · {k.txnId} <span className={`pill ${k.status}`}>{k.status.replace('_', ' ')}</span></h3>
      <p className="small">Evidence: {k.evidenceSummary}</p><p className="small">Rule <code>{k.decision.rule}</code> · tier {k.decision.tier} · {k.decision.reason}</p>
      {k.approval && <><p><b>Proposed call:</b> <code>{k.approval.call}</code></p><p>Refund ₹{k.approval.refundInr} + compensation ₹{k.approval.compensationInr}</p></>}
      {k.escalationBrief && <p><b>Escalation brief:</b> {k.escalationBrief}</p>}
      {k.status === 'awaiting_approval' && <><button onClick={() => act(k.id, 'approve')}>Approve</button>
        <button className="bad" onClick={() => act(k.id, 'reject')}>Reject</button><button className="alt" onClick={() => act(k.id, 'escalate')}>Escalate</button></>}
    </div>)}
  </>);
}
