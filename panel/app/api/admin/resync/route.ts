import { NextResponse } from 'next/server';
import { handleApiError, requireAdmin } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await requireAdmin();

    await new Promise((resolve) => setTimeout(resolve, 500));

    return NextResponse.json({ ok: true, message: 'Re-sync triggered' });
  } catch (error) {
    return handleApiError(error);
  }
}
