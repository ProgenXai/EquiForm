"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { createClient } from "@/lib/supabase/client";

type HorseDetail = {
  id: string;
  name: string;
  breed: string | null;
  coat_color: string | null;
  age: string | null;
  sex: string | null;
  discipline: string | null;
};

type ReportRow = {
  id: string;
  created_at: string;
  overall_score: number | null;
};

function formatReportDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatHorseDetailLines(horse: HorseDetail): string[] {
  return [
    horse.breed?.trim() ? `Breed: ${horse.breed.trim()}` : null,
    horse.coat_color?.trim() ? `Coat Color: ${horse.coat_color.trim()}` : null,
    horse.age?.trim() ? `Age: ${horse.age.trim()}` : null,
    horse.sex?.trim() ? `Sex: ${horse.sex.trim()}` : null,
    horse.discipline?.trim() ? `Discipline: ${horse.discipline.trim()}` : null,
  ].filter((line): line is string => line !== null);
}

export default function HorseProgressPage() {
  const router = useRouter();
  const params = useParams();
  const horseId = typeof params.id === "string" ? params.id : "";

  const [horse, setHorse] = useState<HorseDetail | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function loadHorseProgress() {
      if (!horseId) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setLoading(true);

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.replace("/");
        return;
      }

      const { data: horseData, error: horseError } = await supabase
        .from("horses")
        .select("id, name, breed, coat_color, age, sex, discipline")
        .eq("id", horseId)
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (horseError || !horseData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setHorse(horseData as HorseDetail);

      const { data: reportData, error: reportError } = await supabase
        .from("reports")
        .select("id, created_at, overall_score")
        .eq("horse_id", horseId)
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true });

      if (!reportError && reportData) {
        setReports(reportData as ReportRow[]);
      }

      setLoading(false);
    }

    void loadHorseProgress();
  }, [horseId, router]);

  const chartData = useMemo(
    () =>
      reports.map((report) => ({
        date: formatReportDate(report.created_at),
        score: report.overall_score ?? 0,
        createdAt: report.created_at,
      })),
    [reports],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-sm text-zinc-400">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-accent" />
        <span className="ml-3">Loading horse progress…</span>
      </div>
    );
  }

  if (notFound || !horse) {
    return (
      <div className="min-h-screen bg-black px-6 py-10 text-zinc-100">
        <Link
          href="/my-horses"
          className="text-sm font-medium text-accent transition hover:text-accent-hover"
        >
          ← Back to My Horses
        </Link>
        <p className="mt-8 text-sm text-zinc-400">Horse not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <Link
        href="/my-horses"
        className="inline-block px-6 pt-6 text-sm font-medium text-accent transition hover:text-accent-hover"
      >
        ← Back to My Horses
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
          The most advanced AI equine conformation analysis available
        </p>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h1 className="text-2xl font-bold text-white">
            {horse.name.trim() || "Unnamed Horse"}
          </h1>
          {formatHorseDetailLines(horse).map((line) => (
            <p key={line} className="mt-1 text-sm text-zinc-400">
              {line}
            </p>
          ))}
        </div>

        <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h2 className="text-lg font-semibold text-white">Score History</h2>
          {chartData.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-400">
              No reports linked to this horse yet.
            </p>
          ) : (
            <div className="mt-6 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#a1a1aa", fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "#a1a1aa", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      border: "1px solid #3f3f46",
                      borderRadius: "8px",
                      color: "#fafafa",
                    }}
                    formatter={(value) => [`${value}/100`, "Overall Score"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#00d4c8"
                    strokeWidth={2}
                    dot={{ fill: "#00d4c8", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-white">Reports</h2>
          {reports.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-400">No reports yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {[...reports].reverse().map((report) => (
                <li
                  key={report.id}
                  className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm text-zinc-300">
                      {formatReportDate(report.created_at)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-accent">
                      {report.overall_score ?? "—"}/100
                    </p>
                  </div>
                  <Link
                    href={`/my-reports/${report.id}`}
                    className="inline-flex shrink-0 items-center justify-center rounded-lg border border-accent/50 bg-accent/15 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/25"
                  >
                    View Report
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
