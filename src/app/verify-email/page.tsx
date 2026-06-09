"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { formatAuthError } from "@/lib/user-facing-errors";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialSendDone = useRef(false);

  async function sendVerificationEmail(email: string) {
    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (resendError) {
      throw new Error(formatAuthError(resendError.message));
    }
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.email) {
        setHasSession(false);
        setLoading(false);
        return;
      }

      setHasSession(true);
      setSessionEmail(session.user.email);

      if (session.user.email_confirmed_at) {
        router.replace("/auth");
        return;
      }

      if (!initialSendDone.current) {
        initialSendDone.current = true;
        try {
          await sendVerificationEmail(session.user.email);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : formatAuthError(err),
          );
        }
      }

      setLoading(false);
    }

    void init();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email_confirmed_at) {
        router.replace("/auth");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleResend() {
    if (!sessionEmail) return;

    setResending(true);
    setError(null);

    try {
      await sendVerificationEmail(sessionEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : formatAuthError(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100">
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

      <main className="mx-auto max-w-md px-4 py-10">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          {loading ? (
            <p className="text-center text-sm text-zinc-400">Loading…</p>
          ) : !hasSession ? (
            <>
              <h1 className="text-lg font-semibold text-white">Verify Your Email</h1>
              <p className="mt-4 text-sm text-zinc-400">
                Please log in to verify your email.
              </p>
              <Link
                href="/auth"
                className="mt-6 inline-block w-full rounded-lg bg-accent px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                Log In
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-white">Verify Your Email</h1>
              <p className="mt-4 text-sm text-zinc-400">
                We&apos;ve sent a verification email to{" "}
                <span className="font-medium text-zinc-200">{sessionEmail}</span>.
                Please check your inbox and click the link to verify your account.
              </p>

              {error ? (
                <p className="mt-4 text-sm text-red-400" role="alert">
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={resending}
                className="mt-6 w-full rounded-lg border border-accent px-4 py-3 text-sm font-semibold text-accent transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {resending ? "Sending…" : "Resend Email"}
              </button>

              <Link
                href="/dashboard"
                className="mt-4 inline-block w-full text-center text-sm font-medium text-accent transition hover:text-accent-hover"
              >
                Back to Dashboard
              </Link>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
