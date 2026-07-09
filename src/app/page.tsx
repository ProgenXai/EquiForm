"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { formatAuthError } from "@/lib/user-facing-errors";

type AuthMode = "login" | "signup";

export default function Home() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<AuthMode>("login");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notifyUpdates, setNotifyUpdates] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const trimmedEmail = email.trim();
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();

    if (mode === "signup" && (!trimmedFirstName || !trimmedLastName)) {
      setLoading(false);
      setError("First name and last name are required.");
      return;
    }

    const { data: authData, error: authError } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          })
        : await supabase.auth.signUp({
            email: trimmedEmail,
            password,
            options: {
              data: {
                first_name: trimmedFirstName,
                last_name: trimmedLastName,
              },
            },
          });

    setLoading(false);

    if (authError) {
      setError(formatAuthError(authError.message));
      return;
    }

    if (mode === "signup") {
      void fetch("/api/email/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, name: trimmedFirstName }),
      });

      const session =
        authData.session ??
        (await supabase.auth.getSession()).data.session;

      if (!session?.access_token) {
        setError(
          "Account created! Please check your email to confirm your account, then log in.",
        );
        return;
      }

      try {
        await fetch("/api/signup-preferences", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            notifyUpdates,
            firstName: trimmedFirstName,
            lastName: trimmedLastName,
          }),
        });
      } catch {
        // Profile setup can continue even if preferences fail.
      }

      window.location.assign("/profile?setup=1");
      return;
    }

    if (mode === "login") {
      router.push("/home");
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
        The most advanced AI equine conformation analysis available
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
          {mode === "signup" ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="first-name"
                  className="mb-2 block text-xs font-medium text-zinc-400"
                >
                  First name
                </label>
                <input
                  id="first-name"
                  type="text"
                  value={firstName}
                  onChange={(event) => {
                    setFirstName(event.target.value);
                    if (error) setError(null);
                  }}
                  autoComplete="given-name"
                  autoCapitalize="words"
                  required
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="last-name"
                  className="mb-2 block text-xs font-medium text-zinc-400"
                >
                  Last name
                </label>
                <input
                  id="last-name"
                  type="text"
                  value={lastName}
                  onChange={(event) => {
                    setLastName(event.target.value);
                    if (error) setError(null);
                  }}
                  autoComplete="family-name"
                  autoCapitalize="words"
                  required
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          ) : null}

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

          {mode === "signup" ? (
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={notifyUpdates}
                onChange={(event) => setNotifyUpdates(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-950 text-accent focus:ring-accent"
              />
              <span className="text-sm text-zinc-400">
                Notify me about new features and updates to EquiForm.
              </span>
            </label>
          ) : null}

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
    </div>
  );
}
