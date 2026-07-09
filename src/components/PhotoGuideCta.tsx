"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { raceGetSession } from "@/lib/supabase/bootstrap-auth-session";
import { createClient } from "@/lib/supabase/client";

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

    async function updateFromUserId(userId: string) {
      const { data: tokenRow } = await supabase
        .from("user_tokens")
        .select(
          "single_view_balance, single_view_3d_balance, full_report_balance, full_report_3d_balance",
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (cancelled) return;

      if (
        hasAnyCredits({
          single_view_balance: tokenRow?.single_view_balance ?? 0,
          single_view_3d_balance: tokenRow?.single_view_3d_balance ?? 0,
          full_report_balance: tokenRow?.full_report_balance ?? 0,
          full_report_3d_balance: tokenRow?.full_report_3d_balance ?? 0,
        })
      ) {
        setHref("/analyze");
        setLabel("Start Analyzing");
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) return;
      void updateFromUserId(session.user.id);
    });

    void (async () => {
      const raced = await raceGetSession(supabase);
      if (cancelled || raced.status !== "ok" || !raced.session?.user) {
        return;
      }
      await updateFromUserId(raced.session.user.id);
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
