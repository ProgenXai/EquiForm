"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

export default function Home() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const trimmedEmail = email.trim();

    const { error: authError } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          })
        : await supabase.auth.signUp({
            email: trimmedEmail,
            password,
          });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (mode === "signup") {
      void fetch("/api/email/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      router.push("/buy-rosettes");
      return;
    }

    if (mode === "login") {
      router.push("/examples");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-zinc-100">
      <Image
        src="/equiform-logo.png"
        alt="EquiForm"
        width={600}
        height={600}
        priority
        className="object-contain"
      />
      <p className="mt-3 max-w-md text-center text-sm text-zinc-400">
        The most advanced AI equine conformation analysis available — four views, one complete report, in 3D
      </p>

      <section className="mt-10 w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h1 className="text-lg font-semibold text-white">
          {mode === "login" ? "Log in" : "Sign up"}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          {mode === "login"
            ? "Access your EquiForm account"
            : "Create your EquiForm account"}
        </p>

        <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div>
            <label htmlFor="email" className="mb-2 block text-xs font-medium text-zinc-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) setError(null);
              }}
              autoComplete="email"
              required
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-xs font-medium text-zinc-400"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) setError(null);
                }}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={6}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 pr-12 text-sm text-zinc-100 focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400 transition hover:text-zinc-200"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading
              ? mode === "login"
                ? "Logging in…"
                : "Signing up…"
              : mode === "login"
                ? "Log in"
                : "Sign up"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-zinc-400">
          {mode === "login" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
                className="font-medium text-accent transition hover:text-accent-hover"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className="font-medium text-accent transition hover:text-accent-hover"
              >
                Log in
              </button>
            </>
          )}
        </p>
      </section>

      <p className="mt-8 text-xs text-zinc-600">
        AQHA-style conformation scoring with landmark overlay
      </p>
    </div>
  );
}
