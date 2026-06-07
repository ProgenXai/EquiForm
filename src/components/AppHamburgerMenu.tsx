"use client";

import Link from "next/link";
import { FileCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export default function AppHamburgerMenu() {
  const router = useRouter();
  const supabase = createClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <div ref={menuRef} className="fixed top-4 right-[18%] z-[100]">
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
          <Link
            href="/dashboard"
            className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
            onClick={() => setMenuOpen(false)}
          >
            Home
          </Link>
          <Link
            href="/buy-rosettes"
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
            href="/examples"
            className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
            onClick={() => setMenuOpen(false)}
          >
            Examples
          </Link>
          <Link
            href="/analyze"
            className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
            onClick={() => setMenuOpen(false)}
          >
            Analyze a Horse
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
            href="/contact"
            className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
            onClick={() => setMenuOpen(false)}
          >
            Contact Us
          </Link>
          <button
            type="button"
            onClick={async () => {
              setMenuOpen(false);
              await supabase.auth.signOut();
              router.push("/");
            }}
            className="block w-full px-4 py-2 text-left text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Sign Out
          </button>
        </div>
      ) : null}
    </div>
  );
}
