"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type ReportSectionKey =
  | "balance"
  | "shoulder_angle"
  | "hip_angle"
  | "topline_quality"
  | "leg_alignment";

type ParsedReportText =
  | { ok: true; summary: string; notes: Record<ReportSectionKey, string | undefined> }
  | { ok: false; raw: string };

type ReportDetail = {
  id: string;
  created_at: string;
  overall_score: number | null;
  balance_score: number | null;
  shoulder_score: number | null;
  hip_score: number | null;
  topline_score: number | null;
  leg_score: number | null;
  report_text: string | null;
};

const SCORE_SECTIONS: {
  label: string;
  key: keyof Pick<
    ReportDetail,
    | "balance_score"
    | "shoulder_score"
    | "hip_score"
    | "topline_score"
    | "leg_score"
  >;
  reportKey: ReportSectionKey;
}[] = [
  { label: "Balance", key: "balance_score", reportKey: "balance" },
  { label: "Shoulder Angle", key: "shoulder_score", reportKey: "shoulder_angle" },
  { label: "Hip Angle", key: "hip_score", reportKey: "hip_angle" },
  { label: "Topline Quality", key: "topline_score", reportKey: "topline_quality" },
  { label: "Leg Alignment", key: "leg_score", reportKey: "leg_alignment" },
];

function parseReportText(text: string): ParsedReportText {
  try {
    let parsed: unknown = JSON.parse(text);

    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }

    if (typeof parsed !== "object" || parsed === null) {
      return { ok: false, raw: text };
    }

    const data = parsed as {
      summary?: string;
      overall_score?: number;
      report?: {
        balance?: { score?: number; notes?: string };
        shoulder_angle?: { score?: number; notes?: string };
        hip_angle?: { score?: number; notes?: string };
        topline_quality?: { score?: number; notes?: string };
        leg_alignment?: { score?: number; notes?: string };
      };
    };

    const reportData = data.report;
    const notes: Record<ReportSectionKey, string | undefined> = {
      balance: reportData?.balance?.notes,
      shoulder_angle: reportData?.shoulder_angle?.notes,
      hip_angle: reportData?.hip_angle?.notes,
      topline_quality: reportData?.topline_quality?.notes,
      leg_alignment: reportData?.leg_alignment?.notes,
    };

    if (data.summary) {
      return {
        ok: true,
        summary: data.summary,
        notes,
      };
    }

    if (reportData) {
      const summaryFromSections = [
        ["Balance", notes.balance],
        ["Shoulder Angle", notes.shoulder_angle],
        ["Hip Angle", notes.hip_angle],
        ["Topline Quality", notes.topline_quality],
        ["Leg Alignment", notes.leg_alignment],
      ]
        .filter((entry): entry is [string, string] => Boolean(entry[1]))
        .map(([label, note]) => `${label}\n${note}`)
        .join("\n\n");

      if (summaryFromSections) {
        return {
          ok: true,
          summary: summaryFromSections,
          notes,
        };
      }
    }
  } catch {
    // fall through to raw display
  }

  return { ok: false, raw: text };
}

function formatReportDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function ReportDetailPage() {
  const router = useRouter();
  const params = useParams();
  const reportId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!reportId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    async function loadReport() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.replace("/");
        return;
      }

      const { data, error } = await supabase
        .from("reports")
        .select(
          "id, created_at, overall_score, balance_score, shoulder_score, hip_score, topline_score, leg_score, report_text",
        )
        .eq("id", reportId)
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
      } else {
        setReport(data as ReportDetail);
      }

      setLoading(false);
    }

    void loadReport();
  }, [reportId, router]);

  const parsedReportText =
    report?.report_text != null ? parseReportText(report.report_text) : null;

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <Link
        href="/my-reports"
        className="inline-block px-6 pt-6 text-sm font-medium text-accent transition hover:text-accent-hover"
      >
        ← Back to My Reports
      </Link>

      <header className="border-b border-zinc-800 bg-black px-6 py-8 text-center">
        <div className="flex justify-center">
          <Image
            src="/equiform-logo.png"
            alt="EquiForm"
            width={300}
            height={300}
            priority
            className="object-contain"
          />
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          AI-powered equine conformation analysis from a single side profile photo
        </p>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-zinc-400">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-accent" />
            Loading report…
          </div>
        ) : notFound || !report ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-6 py-12 text-center">
            <p className="text-sm text-zinc-300">Report not found</p>
            <Link
              href="/my-reports"
              className="mt-6 inline-block text-sm font-medium text-accent transition hover:text-accent-hover"
            >
              ← Back to My Reports
            </Link>
          </div>
        ) : (
          <article>
            <p className="text-sm text-zinc-400">
              {formatReportDate(report.created_at)}
            </p>

            <div className="mt-4 border-b border-zinc-800 pb-6">
              <p className="text-sm font-medium text-zinc-400">Overall score</p>
              <p className="mt-1 text-5xl font-bold text-accent">
                {report.overall_score ?? "—"}
                <span className="text-2xl font-normal text-zinc-500">/100</span>
              </p>
            </div>

            {report.report_text ? (
              <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
                <h2 className="text-lg font-semibold text-white">Report</h2>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                  {parsedReportText?.ok
                    ? parsedReportText.summary
                    : report.report_text}
                </p>
              </div>
            ) : null}

            <ul className="mt-6 space-y-4">
              {SCORE_SECTIONS.map(({ label, key, reportKey }) => {
                const sectionNotes =
                  parsedReportText?.ok === true
                    ? parsedReportText.notes[reportKey]
                    : undefined;

                return (
                  <li
                    key={key}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-medium text-zinc-200">{label}</h3>
                      <span className="text-sm font-semibold text-accent">
                        {report[key] ?? "—"}/100
                      </span>
                    </div>
                    {sectionNotes ? (
                      <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                        {sectionNotes}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </article>
        )}
      </main>
    </div>
  );
}
