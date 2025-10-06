import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Response('Unauthorized', { status: 401 });
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (!session.user?.isAdmin) {
    throw new Response('Forbidden', { status: 403 });
  }
  return session;
}

export function handleApiError(error: unknown) {
  if (error instanceof Response) {
    return NextResponse.json({ error: error.statusText || 'Error' }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}
