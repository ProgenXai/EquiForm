"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import AppHamburgerMenu from "@/components/AppHamburgerMenu";
import PurchaseTierGrid from "@/components/PurchaseTierGrid";

function capitalizeEmailPrefix(email: string): string {
  const prefix = email.split("@")[0]?.trim() ?? "";
  if (!prefix) return "there";
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

function getWelcomeName(user: {
  email?: string;
  user_metadata?: Record<string, unknown>;
}): string {
  const firstName =
    typeof user.user_metadata?.first_name === "string"
      ? user.user_metadata.first_name.trim()
      : "";
  if (firstName) return firstName;
  return capitalizeEmailPrefix(user.email ?? "");
}

type CreditBalances = {
  single_view_balance: number;
  single_view_3d_balance: number;
  full_report_balance: number;
  full_report_3d_balance: number;
};

function formatBalanceBadge(
  count: number,
  labelSingular: string,
  labelPlural: string,
): string {
  const label = count === 1 ? labelSingular : labelPlural;
  return `${count} ${label} remaining`;
}

function getBalanceBadges(balances: CreditBalances): string[] {
  const badges: string[] = [];

  if (balances.single_view_balance > 0) {
    badges.push(
      formatBalanceBadge(
        balances.single_view_balance,
        "Single View Report",
        "Single View Reports",
      ),
    );
  }

  if (balances.single_view_3d_balance > 0) {
    badges.push(
      formatBalanceBadge(
        balances.single_view_3d_balance,
        "Single View + 3D Report",
        "Single View + 3D Reports",
      ),
    );
  }

  if (balances.full_report_balance > 0) {
    badges.push(
      formatBalanceBadge(
        balances.full_report_balance,
        "Four-View Report",
        "Four-View Reports",
      ),
    );
  }

  if (balances.full_report_3d_balance > 0) {
    badges.push(
      formatBalanceBadge(
        balances.full_report_3d_balance,
        "Four-View + 3D Report",
        "Four-View + 3D Reports",
      ),
    );
  }

  return badges;
}

export default function DashboardPage() {
  const router = useRouter();
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const [balances, setBalances] = useState<CreditBalances | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.replace("/");
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("first_name")
        .eq("user_id", session.user.id)
        .maybeSingle();

      const profileFirstName =
        typeof profile?.first_name === "string" ? profile.first_name.trim() : "";
      setWelcomeName(
        profileFirstName || getWelcomeName(session.user),
      );

      const { data: tokenRow } = await supabase
        .from("user_tokens")
        .select(
          "single_view_balance, single_view_3d_balance, full_report_balance, full_report_3d_balance",
        )
        .eq("user_id", session.user.id)
        .maybeSingle();

      setBalances({
        single_view_balance: tokenRow?.single_view_balance ?? 0,
        single_view_3d_balance: tokenRow?.single_view_3d_balance ?? 0,
        full_report_balance: tokenRow?.full_report_balance ?? 0,
        full_report_3d_balance: tokenRow?.full_report_3d_balance ?? 0,
      });
      setLoading(false);
    }

    void loadSession();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-400">
        Loading…
      </div>
    );
  }

  const balanceBadges = balances ? getBalanceBadges(balances) : [];

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <AppHamburgerMenu />
      <header className="border-b border-zinc-800 bg-black px-6 py-4 text-center sm:py-8">
        <div className="flex justify-center">
          <Image
            src="/equiform-logo.png"
            alt="EquiForm"
            width={300}
            height={300}
            priority
            className="h-52 w-52 object-contain sm:h-[300px] sm:w-[300px]"
          />
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          The most advanced AI equine conformation analysis available
        </p>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-semibold text-white">
            Welcome back{welcomeName ? `, ${welcomeName}` : ""}!
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Choose a report package or jump straight into your next analysis
          </p>
        </div>

        <nav className="mb-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/examples"
            className="w-52 rounded-lg bg-zinc-600 px-10 py-4 text-center text-lg font-semibold text-zinc-200 transition hover:bg-zinc-500"
          >
            Examples
          </Link>
          <Link
            href="/analyze"
            className="w-52 rounded-lg bg-accent px-10 py-4 text-center text-lg font-semibold text-white transition hover:bg-accent-hover"
          >
            Analyze
          </Link>
        </nav>

        <div className="mb-6 text-center">
          <h2 className="text-xl font-semibold text-white">Choose Your Report</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Select the analysis package that fits your needs
          </p>
        </div>

        {balances ? (
          <div className="mb-8 flex flex-col items-center gap-3">
            {balanceBadges.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-2">
                {balanceBadges.map((badge) => (
                  <span
                    key={badge}
                    className="rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-400">
                No reports remaining — choose a package below.
              </p>
            )}
          </div>
        ) : null}

        <PurchaseTierGrid authRedirectPath="/" checkoutMode="cart" />
      </main>
    </div>
  );
}
