import { NextResponse } from 'next/server';
import { rxddInternalUnauthorized, verifyRxddInternalRequest } from '@/lib/internal/rxdd-auth';
import { rxddPrepareAutomation, rxddPrepareAutomationSchema } from '@/lib/internal/rxdd-editorial';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!verifyRxddInternalRequest(request)) {
    return rxddInternalUnauthorized();
  }

  const json: unknown = await request.json().catch(() => null);
  const parsed = rxddPrepareAutomationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const automation = await rxddPrepareAutomation(parsed.data);
    return NextResponse.json({ success: true, data: automation }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to prepare campaign';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}