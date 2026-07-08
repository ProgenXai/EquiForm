"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AppHamburgerMenu from "@/components/AppHamburgerMenu";
import { createClient } from "@/lib/supabase/client";

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

export default function DashboardPage() {
  const router = useRouter();
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
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
      setWelcomeName(profileFirstName || getWelcomeName(session.user));
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

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <AppHamburgerMenu />
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 py-10 text-center">
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">
          Welcome back{welcomeName ? `, ${welcomeName}` : ""}!
        </h1>
        <Link
          href="/analyze"
          className="mt-8 w-full max-w-xs rounded-lg bg-accent px-8 py-3 text-center text-base font-semibold text-white transition hover:bg-accent-hover sm:w-auto"
        >
          Analyze
        </Link>
      </main>
    </div>
  );
}
