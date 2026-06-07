"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
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

      setWelcomeName(getWelcomeName(session.user));
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
            className="w-full max-w-xs rounded-lg border border-zinc-700 bg-zinc-900/60 px-6 py-3 text-center text-sm font-semibold text-zinc-200 transition hover:border-accent/60 hover:bg-accent/10 sm:w-auto"
          >
            Examples
          </Link>
          <Link
            href="/analyze"
            className="w-full max-w-xs rounded-lg bg-accent px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-hover sm:w-auto"
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

        <PurchaseTierGrid authRedirectPath="/" />
      </main>
    </div>
  );
}
