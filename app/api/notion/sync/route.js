import { NextResponse } from 'next/server';
import { syncAllNotion } from '../../../../lib/notion';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const extraIds = Array.isArray(body.rootIds) ? body.rootIds : (body.rootId ? [body.rootId] : []);
    const data = await syncAllNotion(extraIds);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
