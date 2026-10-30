import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEngine } from '../../../../../src/server.ts';
import { ForbiddenError, ValidationError } from '../../../../../src/core/engine.ts';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = z.object({ action: z.enum(['approve', 'reject', 'escalate']) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'action must be approve, reject or escalate' }, { status: 400 });
  const expected = process.env.AGENT_TOKEN;
  const authorised = !!expected && req.headers.get('x-agent-token') === expected;
  try {
    const k = await getEngine().act(params.id, body.data.action, { id: 'agent-demo', role: authorised ? 'agent' : 'customer' });
    return NextResponse.json({ case: k });
  } catch (e) {
    const code = e instanceof ForbiddenError ? 403 : e instanceof ValidationError ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status: code });
  }
}
