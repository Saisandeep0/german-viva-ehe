import { NextResponse } from 'next/server';
import { syncAllNotion } from '../../../../lib/notion';
import { normalizeProfile } from '../../../../lib/profiles';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const profile = normalizeProfile(body.profile);

    if (!profile) {
      return NextResponse.json(
        { error: 'Choose Sandeep or Leela first.' },
        { status: 400 }
      );
    }

    const extraIds = Array.isArray(body.rootIds)
      ? body.rootIds
      : body.rootId
        ? [body.rootId]
        : [];

    const data = await syncAllNotion(
      profile,
      extraIds
    );

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error.message ||
          'Notion sync failed.',
      },
      { status: 500 }
    );
  }
}
