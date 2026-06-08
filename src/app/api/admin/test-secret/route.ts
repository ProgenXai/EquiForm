import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cronSecret = process.env.CRON_SECRET ?? "";

  return NextResponse.json({
    prefix: cronSecret.slice(0, 5),
    length: cronSecret.length,
  });
}
