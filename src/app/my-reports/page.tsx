"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type ReportRow = {
  id: string;
  created_at: string;
  overall_score: number | null;
};

function formatReportDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function MyReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ReportRow[]>([]);

  useEffect(() => {
    async function loadReports() {
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
        .select("id, created_at, overall_score")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setReports(data as ReportRow[]);
      }

      setLoading(false);
    }

    void loadReports();
  }, [router]);

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <Link
        href="/analyze"
        className="inline-block px-6 pt-6 text-sm font-medium text-accent transition hover:text-accent-hover"
      >
        ← Back to Analyze
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
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-white">My Reports</h1>
          <p className="mt-2 text-sm text-zinc-400">
            View your past horse conformation analyses
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-zinc-400">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-accent" />
            Loading your reports…
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-6 py-12 text-center">
            <p className="text-sm text-zinc-300">
              No reports yet. Analyze your first horse!
            </p>
            <Link
              href="/analyze"
              className="mt-6 inline-block rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              Go to Analyze
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {reports.map((report) => (
              <li
                key={report.id}
                className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-white">
                    {formatReportDate(report.created_at)}
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Overall score:{" "}
                    <span className="font-semibold text-accent">
                      {report.overall_score ?? "—"}
                    </span>
                  </p>
                </div>
                <Link
                  href={`/my-reports/${report.id}`}
                  className="inline-block rounded-lg bg-accent px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-accent-hover sm:shrink-0"
                >
                  View Report
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
