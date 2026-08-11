import { createClient } from "@supabase/supabase-js";
import { parseSupabaseCookie } from "@supabase/auth-helpers-shared";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  downloadReportPdfBytes,
  getReportPdfStoragePath,
} from "@/lib/reports/pdf-storage";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { USER_FACING } from "@/lib/user-facing-errors";

export const maxDuration = 30;

function sanitizePdfFilename(horseName: string | null | undefined): string {
  const sanitized = (horseName ?? "")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);

  return sanitized ? `EquiForm-Report-${sanitized}.pdf` : "EquiForm-Report.pdf";
}

function getSupabaseAuthStorageKey(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }

  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  return `sb-${projectRef}-auth-token`;
}

async function getAccessTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  const storageKey = getSupabaseAuthStorageKey();

  let raw = cookieStore.get(storageKey)?.value ?? null;

  if (!raw) {
    const chunks: string[] = [];
    for (let i = 0; ; i += 1) {
      const chunk = cookieStore.get(`${storageKey}.${i}`)?.value;
      if (!chunk) break;
      chunks.push(chunk);
    }
    raw = chunks.length > 0 ? chunks.join("") : null;
  }

  if (!raw) return null;

  const session = parseSupabaseCookie(raw);
  return typeof session?.access_token === "string" ? session.access_token : null;
}

async function getAuthenticatedUser(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const cookieToken = bearerToken ? null : await getAccessTokenFromCookies();
  const token = bearerToken || cookieToken;

  if (!token) return null;

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser(token);

  return user;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: reportId } = await params;

  if (!reportId?.trim()) {
    return NextResponse.json(
      { error: USER_FACING.reportNotFound },
      { status: 404 },
    );
  }

  const user = await getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json(
      { error: USER_FACING.signInRequired },
      { status: 401 },
    );
  }

  const serviceClient = createServiceRoleClient();

  const { data: report, error: reportError } = await serviceClient
    .from("reports")
    .select("id, user_id, horse_name, pdf_url")
    .eq("id", reportId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (reportError) {
    console.error("[reports/download] lookup failed:", reportError);
    return NextResponse.json({ error: USER_FACING.generic }, { status: 500 });
  }

  if (!report) {
    return NextResponse.json(
      { error: USER_FACING.reportNotFound },
      { status: 404 },
    );
  }

  try {
    let pdfBytes: Uint8Array;

    try {
      pdfBytes = await downloadReportPdfBytes(
        serviceClient,
        user.id,
        reportId,
      );
    } catch (storageError) {
      // Legacy rows may only have a public Supabase URL and a mismatched path.
      if (
        typeof report.pdf_url === "string" &&
        report.pdf_url.includes("/storage/v1/object/public/")
      ) {
        const pdfResponse = await fetch(report.pdf_url);
        if (!pdfResponse.ok) {
          throw storageError;
        }
        pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
      } else {
        throw storageError;
      }
    }

    const filename = sanitizePdfFilename(report.horse_name);
    const wantDownload =
      new URL(request.url).searchParams.get("download") === "1";

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${wantDownload ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "Content-Length": String(pdfBytes.byteLength),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(
      `[reports/download] failed for ${getReportPdfStoragePath(user.id, reportId)}:`,
      error,
    );
    return NextResponse.json(
      { error: USER_FACING.pdfUnavailable },
      { status: 404 },
    );
  }
}
