import { NextResponse } from 'next/server';
import { rxddInternalUnauthorized, verifyRxddInternalRequest } from '@/lib/internal/rxdd-auth';
import { rxddBindInstagramReel, rxddBindReelSchema } from '@/lib/internal/rxdd-editorial';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyRxddInternalRequest(request)) {
    return rxddInternalUnauthorized();
  }

  const { id } = await context.params;
  const json: unknown = await request.json().catch(() => null);
  const parsed = rxddBindReelSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const data = await rxddBindInstagramReel(id, parsed.data);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Bind failed';
    const status = message.includes('another reel') ? 409 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}