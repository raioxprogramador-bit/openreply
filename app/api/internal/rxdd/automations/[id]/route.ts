import { NextResponse } from 'next/server';
import { rxddInternalUnauthorized, verifyRxddInternalRequest } from '@/lib/internal/rxdd-auth';
import {
  rxddAutomationStatus,
  rxddUpdateAutomation,
  rxddUpdateAutomationSchema
} from '@/lib/internal/rxdd-editorial';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyRxddInternalRequest(request)) {
    return rxddInternalUnauthorized();
  }

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get('workspace_id');
  const publicacaoId = searchParams.get('rxdd_publicacao_id');
  if (!workspaceId || !publicacaoId) {
    return NextResponse.json(
      { success: false, error: 'workspace_id and rxdd_publicacao_id required' },
      { status: 400 }
    );
  }

  try {
    const data = await rxddAutomationStatus(id, workspaceId, publicacaoId);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Not found';
    return NextResponse.json({ success: false, error: message }, { status: 404 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyRxddInternalRequest(request)) {
    return rxddInternalUnauthorized();
  }

  const { id } = await context.params;
  const json: unknown = await request.json().catch(() => null);
  const parsed = rxddUpdateAutomationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const data = await rxddUpdateAutomation(id, parsed.data);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Update failed';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}