"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

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
    horse.discipline?.trim() ? `Discipline: ${horse.discipline.trim()}` : null,
  ].filter((line): line is string => line !== null);
}

export default function MyHorsesPage() {
  const router = useRouter();
  const [horses, setHorses] = useState<HorseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHorses() {
      setLoading(true);

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.replace("/");
        return;
      }

      const { data, error } = await supabase
        .from("horses")
        .select("id, name, breed, coat_color, age, sex, discipline")
        .eq("user_id", session.user.id)
        .order("name", { ascending: true });

      if (!error && data) {
        setHorses(data as HorseRow[]);
      }

      setLoading(false);
    }

    void loadHorses();
  }, [router]);

  return (
    <div className="min-h-screen bg-black text-zinc-100">
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
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
