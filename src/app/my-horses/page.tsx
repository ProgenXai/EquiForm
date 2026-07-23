"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formatDisciplineList } from "@/lib/format-discipline";
import AppHamburgerMenu from "@/components/AppHamburgerMenu";
import { getReportPdfStoragePath } from "@/lib/reports/pdf-storage";
import { createClient } from "@/lib/supabase/client";
import {
  AUTH_LOAD_ERROR_MESSAGE,
  bootstrapAuthSession,
  DataLoadTimeoutError,
  DATA_LOAD_TIMEOUT_MS,
  raceWithDataLoadTimeout,
} from "@/lib/supabase/bootstrap-auth-session";

type HorseRow = {
  id: string;
  name: string;
  breed: string | null;
  coat_color: string | null;
  age: string | null;
  sex: string | null;
  discipline: string | null;
};

function formatHorseDetailLines(horse: HorseRow): string[] {
  return [
    horse.breed?.trim() ? `Breed: ${horse.breed.trim()}` : null,
    horse.coat_color?.trim() ? `Coat Color: ${horse.coat_color.trim()}` : null,
    horse.age?.trim() ? `Age: ${horse.age.trim()}` : null,
    horse.sex?.trim() ? `Sex: ${horse.sex.trim()}` : null,
    horse.discipline?.trim()
      ? `Discipline: ${formatDisciplineList(horse.discipline)}`
      : null,
  ].filter((line): line is string => line !== null);
}

const HORSES_LOAD_ERROR_MESSAGE =
  "We had trouble loading your horses. Please refresh.";
const HORSES_LOAD_TIMEOUT_MESSAGE =
  "Horses are taking longer than expected to load. Please refresh.";

export default function MyHorsesPage() {
  const router = useRouter();
  const [horses, setHorses] = useState<HorseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const effectRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.log("[my-horses] auth/data effect run", { effectRunId });

    setLoading(true);
    setHorses([]);
    setLoadError(null);

    const cleanup = bootstrapAuthSession({
      logPrefix: `[my-horses:${effectRunId}]`,
      onUnauthenticated: () => {
        router.replace("/");
      },
      onTimeout: () => {
        setLoading(false);
        setLoadError(AUTH_LOAD_ERROR_MESSAGE);
      },
      onAuthenticated: async (session) => {
        console.log("[my-horses] loading horses data...", {
          effectRunId,
          userId: session.user.id,
        });

        setLoading(true);

        try {
          const supabase = createClient();
          const { data, error } = await raceWithDataLoadTimeout(
            supabase
              .from("horses")
              .select("id, name, breed, coat_color, age, sex, discipline")
              .eq("user_id", session.user.id)
              .order("name", { ascending: true }),
          );

          if (error) {
            throw error;
          }

          console.log("[my-horses] horses data loaded", {
            effectRunId,
            count: data?.length ?? 0,
          });

          if (data) {
            setHorses(data as HorseRow[]);
          }
        } catch (error) {
          if (error instanceof DataLoadTimeoutError) {
            console.error(
              `[my-horses] horses query timed out after ${DATA_LOAD_TIMEOUT_MS}ms`,
              { effectRunId },
            );
            setLoadError(HORSES_LOAD_TIMEOUT_MESSAGE);
          } else {
            console.error("[my-horses] horses query failed", {
              effectRunId,
              error,
            });
            setLoadError(HORSES_LOAD_ERROR_MESSAGE);
          }
        } finally {
          setLoading(false);
        }
      },
    });

    return cleanup;
  }, [router]);

  async function handleDeleteHorse(horse: HorseRow) {
    if (confirmDeleteId !== horse.id) {
      setConfirmDeleteId(horse.id);
      return;
    }
    setConfirmDeleteId(null);

    setDeletingId(horse.id);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) return;

      const bucket = "horse-photos";

      const extractPath = (url: string | null) => {
        if (!url) return null;
        const marker = `/storage/v1/object/public/${bucket}/`;
        try {
          const parsed = new URL(url);
          const idx = parsed.pathname.indexOf(marker);
          if (idx === -1) return null;
          return decodeURIComponent(parsed.pathname.slice(idx + marker.length));
        } catch {
          return null;
        }
      };

      // Get all reports for this horse
      const { data: reports } = await supabase
        .from("reports")
        .select("id, overlay_url, glb_url, pdf_url")
        .eq("user_id", session.user.id)
        .eq("horse_name", horse.name);

      if (reports && reports.length > 0) {
        const pathsToDelete: string[] = [];

        for (const report of reports) {
          const overlayPath = extractPath(report.overlay_url);
          const glbPath = extractPath(report.glb_url);
          if (overlayPath) pathsToDelete.push(overlayPath);
          if (glbPath) pathsToDelete.push(glbPath);
          if (report.pdf_url) {
            pathsToDelete.push(
              getReportPdfStoragePath(session.user.id, report.id),
            );
          }
        }

        if (pathsToDelete.length > 0) {
          await supabase.storage.from(bucket).remove(pathsToDelete);
        }

        await supabase
          .from("reports")
          .delete()
          .eq("user_id", session.user.id)
          .eq("horse_name", horse.name);
      }

      // Delete the horse
      await supabase
        .from("horses")
        .delete()
        .eq("id", horse.id)
        .eq("user_id", session.user.id);

      setHorses((current) => current.filter((h) => h.id !== horse.id));
    } catch (err) {
      console.error("Failed to delete horse:", err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <AppHamburgerMenu />
      <Link
        href="/analyze"
        className="inline-block px-6 pt-6 text-sm font-medium text-accent transition hover:text-accent-hover"
      >
        ← Back to Analyze
      </Link>

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

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-white">My Horses</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Track conformation progress for each of your horses
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-zinc-400">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-accent" />
            Loading your horses…
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-6 py-12 text-center">
            <p className="text-sm text-zinc-300">{loadError}</p>
          </div>
        ) : horses.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-6 py-12 text-center">
            <p className="text-sm text-zinc-300">
              No horses yet. Analyze your first horse to start tracking progress!
            </p>
            <Link
              href="/analyze"
              className="mt-6 inline-block rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              Go to Analyze
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {horses.map((horse) => (
              <li
                key={horse.id}
                className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-white">
                    {horse.name.trim() || "Unnamed Horse"}
                  </p>
                  {formatHorseDetailLines(horse).map((line) => (
                    <p key={line} className="mt-1 text-xs text-zinc-400">
                      {line}
                    </p>
                  ))}
                </div>
                <Link
                  href={`/my-horses/${horse.id}`}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-accent/50 bg-accent/15 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/25"
                >
                  View Progress
                </Link>
                {confirmDeleteId === horse.id ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDeleteHorse(horse)}
                      disabled={deletingId === horse.id}
                      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-red-800 bg-red-900/20 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {deletingId === horse.id ? "Deleting…" : "Confirm Delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleDeleteHorse(horse)}
                    disabled={deletingId === horse.id}
                    className="inline-flex shrink-0 items-center justify-center rounded-lg border border-red-800 bg-red-900/20 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
