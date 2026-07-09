"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { raceGetSession } from "@/lib/supabase/bootstrap-auth-session";
import { createClient } from "@/lib/supabase/client";

type BalanceResponse = {
  single_view_balance?: number;
  full_report_balance?: number;
};

function hasAnyCredits(balances: {
  single_view_balance: number;
  single_view_3d_balance: number;
  full_report_balance: number;
  full_report_3d_balance: number;
}): boolean {
  return (
    balances.single_view_balance > 0 ||
    balances.single_view_3d_balance > 0 ||
    balances.full_report_balance > 0 ||
    balances.full_report_3d_balance > 0
  );
}

export default function PhotoGuideCta() {
  const [href, setHref] = useState("/buy-credits");
  const [label, setLabel] = useState("I'm Ready, Buy Credits");

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function updateFromSession(session: Session) {
      if (!session.user) return;

      try {
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

        if (cancelled) return;

        const balances = {
          single_view_balance: balanceData.single_view_balance ?? 0,
          single_view_3d_balance:
            singleView3DResult.data?.single_view_3d_balance ?? 0,
          full_report_balance: balanceData.full_report_balance ?? 0,
          full_report_3d_balance:
            fullReport3DResult.data?.full_report_3d_balance ?? 0,
        };

        console.log("[PhotoGuideCta] resolved balances:", balances);

        if (hasAnyCredits(balances)) {
          setHref("/analyze");
          setLabel("Start Analyzing");
        }
      } catch (error) {
        console.error("[PhotoGuideCta] balance check failed:", error);
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) return;

      // Defer Supabase/data work outside the auth-js notification lock (same as Analyze).
      window.setTimeout(() => {
        if (cancelled) return;
        void updateFromSession(session);
      }, 0);
    });

    void (async () => {
      const raced = await raceGetSession(supabase);
      if (cancelled) return;

      if (raced.status === "ok" && raced.session?.user) {
        await updateFromSession(raced.session);
        return;
      }

      console.log(
        "[PhotoGuideCta] raceGetSession deferred to onAuthStateChange:",
        raced.status,
      );
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <Link
      href={href}
      className="w-full max-w-sm rounded-xl bg-accent px-8 py-5 text-center text-lg font-bold text-white transition hover:bg-accent-hover sm:w-auto"
    >
      {label}
    </Link>
  );
}
