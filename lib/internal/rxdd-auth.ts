export function verifyRxddInternalRequest(request: Request): boolean {
  const secret = process.env.OPENREPLY_RXDD_INTERNAL_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export function rxddInternalUnauthorized() {
  return Response.json(
    { success: false, error: 'Unauthorized' },
    { status: 401 }
  );
}