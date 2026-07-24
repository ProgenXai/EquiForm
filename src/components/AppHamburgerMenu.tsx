"use client";

import Link from "next/link";
import { FileCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

function capitalizeEmailPrefix(email: string): string {
  const prefix = email.split("@")[0]?.trim() ?? "";
  if (!prefix) return "Account";
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

function buildProfileDisplayName(
  profile: {
    first_name?: string | null;
    last_name?: string | null;
  } | null,
  user: {
    email?: string;
    user_metadata?: Record<string, unknown>;
  },
): string {
  const profileFirstName =
    typeof profile?.first_name === "string" ? profile.first_name.trim() : "";
  const profileLastName =
    typeof profile?.last_name === "string" ? profile.last_name.trim() : "";
  const metadataFirstName =
    typeof user.user_metadata?.first_name === "string"
      ? user.user_metadata.first_name.trim()
      : "";
  const metadataLastName =
    typeof user.user_metadata?.last_name === "string"
      ? user.user_metadata.last_name.trim()
      : "";

  const firstName = profileFirstName || metadataFirstName;
  const lastName = profileLastName || metadataLastName;
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  if (fullName) {
    return fullName;
  }

  return capitalizeEmailPrefix(user.email ?? "");
}

export default function AppHamburgerMenu() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();

    async function loadProfileSummary(user: {
      id: string;
      email?: string;
      user_metadata?: Record<string, unknown>;
    }) {
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("first_name, last_name, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("[AppHamburgerMenu] failed to load user profile:", profileError);
      }

      setDisplayName(buildProfileDisplayName(profile, user));
      setAvatarUrl(
        typeof profile?.avatar_url === "string" && profile.avatar_url.trim()
          ? profile.avatar_url.trim()
          : null,
      );
    }

    async function syncProfileFromSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setIsLoggedIn(false);
        setDisplayName(null);
        setAvatarUrl(null);
        return;
      }

      setIsLoggedIn(true);
      await loadProfileSummary(session.user);
    }

    void syncProfileFromSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setIsLoggedIn(false);
        setDisplayName(null);
        setAvatarUrl(null);
        return;
      }

      setIsLoggedIn(true);
      void loadProfileSummary(session.user);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <div ref={menuRef} className="fixed top-4 right-4 sm:right-[18%] z-[100]">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        className="relative z-[100] rounded bg-zinc-800 px-2 py-1 text-2xl font-bold text-white"
        aria-expanded={menuOpen}
        aria-haspopup="true"
        aria-label="Menu"
      >
        ☰
      </button>
      {menuOpen ? (
        <div className="absolute right-0 top-full z-[100] mt-2 min-w-[12rem] rounded-lg border border-zinc-800 bg-zinc-900 py-2 shadow-lg">
          {displayName ? (
            <div className="mb-2 flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full border border-zinc-700 object-cover"
                />
              ) : null}
              <span className="text-sm font-semibold text-white">{displayName}</span>
            </div>
          ) : null}
          <Link
            href="/profile"
            className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
            onClick={() => setMenuOpen(false)}
          >
            My Profile
          </Link>
          <Link
            href="/my-reports"
            className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
            onClick={() => setMenuOpen(false)}
          >
            My Reports
          </Link>
          <Link
            href="/my-horses"
            className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
            onClick={() => setMenuOpen(false)}
          >
            My Horses
          </Link>
          <Link
            href="/home"
            className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
            onClick={() => setMenuOpen(false)}
          >
            Home
          </Link>
          <Link
            href="/analyze"
            className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
            onClick={() => setMenuOpen(false)}
          >
            Analyze a Horse
          </Link>
          <Link
            href="/examples"
            className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
            onClick={() => setMenuOpen(false)}
          >
            Photo Guide
          </Link>
          <Link
            href="/buy-credits"
            className="flex items-center gap-1 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
            onClick={() => setMenuOpen(false)}
          >
            Buy Report Credits{" "}
            <FileCheck
              size={18}
              className="inline-block shrink-0 align-middle text-accent"
              aria-hidden
            />
          </Link>
          <Link
            href="/faq"
            className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
            onClick={() => setMenuOpen(false)}
          >
            FAQ
          </Link>
          <Link
            href="/contact"
            className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
            onClick={() => setMenuOpen(false)}
          >
            Contact & Feedback
          </Link>
          {isLoggedIn ? (
            <button
              type="button"
              onClick={async () => {
                setMenuOpen(false);
                const supabase = createClient();
                await supabase.auth.signOut();
                router.push("/");
              }}
              className="block w-full px-4 py-2 text-left text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Sign Out
            </button>
          ) : (
            <Link
              href="/auth"
              className="block px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
              onClick={() => setMenuOpen(false)}
            >
              Login
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}
