# UPI Resolve AI

Team **Vector Voyagers** · MAIT Hackathon · Track: **AI/ML**

> **Prototype on synthetic data. All connectors are MOCK. No live Paytm, bank, UPI or NPCI integration. No real money moves.**

## Problem
A failed or pending UPI payment leaves the customer waiting and support without one source of truth across Paytm records, UPI callbacks, UDIR status and bank-side status.

## Solution
An AI-assisted dispute resolver. An LLM only extracts intent, summarises evidence, writes the customer reply and writes escalation briefs. A **deterministic policy engine** decides rule, tier and amounts. Any money action needs a **human approval**.

## Permission tiers
| Tier | Meaning |
|---|---|
| T0 | Read-only evidence retrieval |
| T1 | Logged, safe, non-financial action (e.g. close ticket with proof) |
| T2 | Propose refund/compensation; a human must approve |
| T3 | Escalate with a summary; no money action |

## Architecture
Chat → Orchestrator (`src/core/engine.ts`) → Mock connectors (`connectors.ts`) → Policy engine (`policy.ts`) → Permission gate + Approval queue (`Engine.act`) → Hash-chained audit log (`audit.ts`). Model is behind the `Model` interface (`model.ts`); the Gemini-compatible adapter falls back to a deterministic mock.

## Demo scenarios (synthetic; examples from the pitch deck, not proof of real payment rules)
`TXN-S02` auto-close · `TXN-S04` one-click refund ₹2,499 + ₹100 · `TXN-S09` escalate · `TXN-S15` repeated refund-API timeout → safe escalation with the same idempotency key.

## Run
Requires Node ≥ 22.18.
```bash
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3000  (agent console at /agent)
npm test           # core tests, no install needed
```
Demo agent token: `demo-agent-token` (local only, set in `.env.local`).

## Known limitations
- Cases and audit log are **in memory** (reset on restart); SQLite is not implemented.
- The Vercel AI SDK is not wired in; the model call is a plain `fetch` adapter (`src/core/model.ts`). The Gemini adapter is untested.
- Retry has no backoff delay; timeout handling is simulated by the mock.
- Audit log is tamper-evident (demo grade), not tamper-proof.
- The agent token is a demo mechanism, not real authentication.
- Policy parameters (T+1/T+5, ₹100/day, ₹5,000 cap) are example values from the pitch deck, not verified payment rules.
- The Next.js UI and API routes were written but **not run or type-checked** by the author yet. Add screenshots after you run it.

## Screenshots
_Add after running locally._
