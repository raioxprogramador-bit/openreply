import { prisma } from '@/lib/db/client';
import { rxddInternalUnauthorized, verifyRxddInternalRequest } from '@/lib/internal/rxdd-auth';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  if (!verifyRxddInternalRequest(request)) return rxddInternalUnauthorized();

  const id = new URL(request.url).searchParams.get('workspace_id')?.trim();
  if (!id) return Response.json({ success: false }, { status: 400 });

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id }, select: { name: true } });
    if (!workspace) return Response.json({ success: false }, { status: 404 });

    const accounts = await prisma.instagramAccount.findMany({
      where: { workspaceId: id },
      orderBy: { username: 'asc' },
      select: { id: true, username: true, zernioAccountId: true }
    });
    return Response.json({
      success: true,
      data: { workspace_name: workspace.name, accounts }
    });
  } catch {
    return Response.json({ success: false }, { status: 503 });
  }
}
