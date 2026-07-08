"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function loadCta() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setReady(true);
        return;
      }

      const { data: tokenRow } = await supabase
        .from("user_tokens")
        .select(
          "single_view_balance, single_view_3d_balance, full_report_balance, full_report_3d_balance",
        )
        .eq("user_id", session.user.id)
        .maybeSingle();

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

      setReady(true);
    }

    void loadCta();
  }, []);

  if (!ready) {
    return <div className="h-14 w-full max-w-sm" aria-hidden="true" />;
  }

  return (
    <Link
      href={href}
      className="w-full max-w-sm rounded-xl bg-accent px-8 py-5 text-center text-lg font-bold text-white transition hover:bg-accent-hover sm:w-auto"
    >
      {label}
    </Link>
  );
}
