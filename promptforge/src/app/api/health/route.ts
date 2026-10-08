import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    getDb().prepare('SELECT 1').get();
    return NextResponse.json({ status: 'ok', db: 'ok', time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: 'error', db: 'unavailable' }, { status: 503 });
  }
}
