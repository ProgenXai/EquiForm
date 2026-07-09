"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import AppHamburgerMenu from "@/components/AppHamburgerMenu";
import {
  type CreditBalances,
  getNonZeroCreditRows,
} from "@/lib/credit-balances";
import { fetchWelcomeName } from "@/lib/get-welcome-name";
import {
  AUTH_LOAD_ERROR_MESSAGE,
  bootstrapAuthSession,
} from "@/lib/supabase/bootstrap-auth-session";
import { createClient } from "@/lib/supabase/client";

type BalanceResponse = {
  single_view_balance?: number;
  full_report_balance?: number;
};

type RecentReport = {
  id: string;
  horse_name: string | null;
  overall_score: number | null;
};

async function fetchCreditBalances(
  session: Session,
  supabase: ReturnType<typeof createClient>,
): Promise<CreditBalances> {
  const balanceResponse = await fetch("/api/get-balance", {
    headers: {
      Authorization: `Bearer ${session.access_token ?? ""}`,
    },
  });
  const balanceData = (await balanceResponse.json()) as BalanceResponse;

  const [singleView3DResult, fullReport3DResult] = await Promise.all([
    supabase
      .from("user_tokens")
      .select("single_view_3d_balance")
      .eq("user_id", session.user.id)
      .maybeSingle(),
    supabase
      .from("user_tokens")
      .select("full_report_3d_balance")
      .eq("user_id", session.user.id)
      .maybeSingle(),
  ]);

  return {
    single_view_balance: balanceData.single_view_balance ?? 0,
    single_view_3d_balance:
      singleView3DResult.data?.single_view_3d_balance ?? 0,
    full_report_balance: balanceData.full_report_balance ?? 0,
    full_report_3d_balance:
      fullReport3DResult.data?.full_report_3d_balance ?? 0,
  };
}

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [welcomeName, setWelcomeName] = useState<string>("");
  const [balances, setBalances] = useState<CreditBalances | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [recentReport, setRecentReport] = useState<RecentReport | null>(null);

  useEffect(() => {
    const cleanup = bootstrapAuthSession({
      logPrefix: "[home]",
      onUnauthenticated: () => {
        router.replace("/");
      },
      onTimeout: () => {
        setLoading(false);
        setLoadError(AUTH_LOAD_ERROR_MESSAGE);
      },
      onAuthenticated: async (session) => {
        setLoading(true);
        setLoadError(null);

        try {
          const supabase = createClient();

          const [name, creditBalances, adminResponse, reportsResult] =
            await Promise.all([
              fetchWelcomeName(supabase, session.user.id, session.user),
              fetchCreditBalances(session, supabase),
              fetch("/api/check-admin", {
                headers: {
                  Authorization: `Bearer ${session.access_token ?? ""}`,
                },
              }),
              supabase
                .from("reports")
                .select("id, horse_name, overall_score")
                .eq("user_id", session.user.id)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
            ]);

          const adminData = (await adminResponse.json()) as {
            isAdmin?: boolean;
          };

          setWelcomeName(name);
          setBalances(creditBalances);
          setIsAdmin(adminData.isAdmin === true);
          setRecentReport(reportsResult.data ?? null);
        } catch (error) {
          console.error("[home] failed to load:", error);
          setLoadError(AUTH_LOAD_ERROR_MESSAGE);
        } finally {
          setLoading(false);
        }
      },
    });

    return cleanup;
  }, [router]);

  const creditRows =
    balances === null ? [] : getNonZeroCreditRows(balances);

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <AppHamburgerMenu />

      <main className="mx-auto max-w-lg px-4 py-10 sm:py-14">
        <div className="mb-8 flex justify-center">
          <Image
            src="/equiform-logo.png"
            alt="EquiForm"
            width={300}
            height={300}
            priority
            className="h-48 w-48 object-contain sm:h-64 sm:w-64"
          />
        </div>

        {loading ? (
          <p className="text-center text-zinc-400">Loading…</p>
        ) : loadError ? (
          <p className="text-center text-red-400">{loadError}</p>
        ) : (
          <>
            <h1 className="text-center text-3xl font-semibold text-white sm:text-4xl">
              Welcome back{welcomeName ? `, ${welcomeName}` : ""}!
            </h1>

            <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
              <h2 className="text-center text-lg font-semibold text-white">
                Your Report Credits
              </h2>

              <div className="mt-5">
                {isAdmin ? (
                  <p className="text-center text-base font-medium text-accent">
                    Unlimited credits (admin)
                  </p>
                ) : creditRows.length > 0 ? (
                  <ul className="space-y-3">
                    {creditRows.map((row) => (
                      <li
                        key={row.key}
                        className="flex items-center justify-between rounded-lg border border-accent/40 bg-accent/10 px-5 py-4"
                      >
                        <span className="text-base font-medium text-zinc-100">
                          {row.label}
                        </span>
                        <span className="text-3xl font-bold tabular-nums text-accent">
                          {balances![row.key]}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-center text-lg font-medium text-zinc-300">
                    You have no credits
                  </p>
                )}
              </div>
            </section>

            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Link
                href="/analyze"
                className="rounded-xl bg-accent px-6 py-4 text-center text-base font-semibold text-white transition hover:bg-accent-hover"
              >
                Analyze a Horse
              </Link>
              <Link
                href="/buy-credits"
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-6 py-4 text-center text-base font-semibold text-zinc-200 transition hover:bg-zinc-800"
              >
                Buy More Credits
              </Link>
            </div>

            {recentReport ? (
              <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Latest Report
                </h2>
                <div className="mt-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-white">
                      {recentReport.horse_name?.trim() || "Unnamed Horse"}
                    </p>
                    {recentReport.overall_score !== null ? (
                      <p className="mt-1 text-2xl font-bold text-accent">
                        {recentReport.overall_score}
                        <span className="text-base font-medium text-zinc-400">
                          /100
                        </span>
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href={`/my-reports/${recentReport.id}`}
                    className="shrink-0 rounded-lg border border-accent/50 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10"
                  >
                    View
                  </Link>
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
