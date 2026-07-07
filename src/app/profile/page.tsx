"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import AppHamburgerMenu from "@/components/AppHamburgerMenu";
import TypeaheadInput from "@/components/TypeaheadInput";
import { formatDisciplineList } from "@/lib/format-discipline";
import {
  BREED_SUGGESTIONS,
  DISCIPLINE_SUGGESTIONS,
} from "@/lib/horse-form-suggestions";
import { createClient } from "@/lib/supabase/client";
import {
  AUTH_LOAD_ERROR_MESSAGE,
  bootstrapAuthSession,
  DataLoadTimeoutError,
  DATA_LOAD_TIMEOUT_MS,
  raceWithDataLoadTimeout,
} from "@/lib/supabase/bootstrap-auth-session";
import { formatProfileError } from "@/lib/user-facing-errors";

const AVATAR_BUCKET = "avatars";
const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const PROFILE_LOAD_ERROR_MESSAGE =
  "We had trouble loading your profile. Please refresh.";
const PROFILE_LOAD_TIMEOUT_MESSAGE =
  "Your profile is taking longer than expected to load. Please refresh.";

type UserProfile = {
  user_id: string;
  first_name: string;
  last_name: string;
  barn_name: string | null;
  preferred_breeds: string | null;
  preferred_disciplines: string | null;
  avatar_url: string | null;
};

function getAvatarExtension(file: File): string {
  switch (file.type) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

function capitalizeNameWords(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function ProfilePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSetupFlow = searchParams.get("setup") === "1";
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [barnName, setBarnName] = useState("");
  const [preferredBreeds, setPreferredBreeds] = useState("");
  const [preferredDisciplines, setPreferredDisciplines] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const effectRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.log("[profile] auth/data effect run", { effectRunId });

    setLoading(true);
    setLoadError(null);

    const cleanup = bootstrapAuthSession({
      logPrefix: `[profile:${effectRunId}]`,
      onUnauthenticated: () => {
        router.replace("/");
      },
      onTimeout: () => {
        setLoading(false);
        setLoadError(AUTH_LOAD_ERROR_MESSAGE);
      },
      onAuthenticated: async (session) => {
        console.log("[profile] loading profile data...", {
          effectRunId,
          userId: session.user.id,
        });

        try {
          setUserId(session.user.id);
          setEmail(session.user.email ?? "");

          const { data: profile, error: profileError } =
            await raceWithDataLoadTimeout(
              supabase
                .from("user_profiles")
                .select(
                  "user_id, first_name, last_name, barn_name, preferred_breeds, preferred_disciplines, avatar_url",
                )
                .eq("user_id", session.user.id)
                .maybeSingle(),
            );

          if (profileError) {
            throw profileError;
          }

          console.log("[profile] profile data loaded", { effectRunId });

          if (profile) {
            applyProfile(profile as UserProfile);
          } else {
            const metadataFirstName =
              typeof session.user.user_metadata?.first_name === "string"
                ? session.user.user_metadata.first_name.trim()
                : "";
            const metadataLastName =
              typeof session.user.user_metadata?.last_name === "string"
                ? session.user.user_metadata.last_name.trim()
                : "";

            setFirstName(metadataFirstName);
            setLastName(metadataLastName);
          }
        } catch (error) {
          if (error instanceof DataLoadTimeoutError) {
            console.error(
              `[profile] profile query timed out after ${DATA_LOAD_TIMEOUT_MS}ms`,
              { effectRunId },
            );
            setLoadError(PROFILE_LOAD_TIMEOUT_MESSAGE);
          } else {
            console.error("[profile] profile query failed", {
              effectRunId,
              error,
            });
            setLoadError(PROFILE_LOAD_ERROR_MESSAGE);
          }
        } finally {
          setLoading(false);
        }
      },
    });

    return cleanup;
  }, [router, supabase]);

  function applyProfile(profile: UserProfile) {
    setFirstName(profile.first_name ?? "");
    setLastName(profile.last_name ?? "");
    setBarnName(profile.barn_name ?? "");
    setPreferredBreeds(profile.preferred_breeds ?? "");
    setPreferredDisciplines(profile.preferred_disciplines ?? "");
    setAvatarUrl(profile.avatar_url ?? null);
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !userId) return;

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setError("Only JPG, PNG, and WEBP images are allowed.");
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setError("Profile photo must be 5MB or smaller.");
      return;
    }

    setUploadingAvatar(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const extension = getAvatarExtension(file);
      const storagePath = `${userId}/avatar.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(storagePath, file, {
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(storagePath);

      const nextAvatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      const { error: profileError } = await supabase.from("user_profiles").upsert(
        {
          user_id: userId,
          avatar_url: publicUrlData.publicUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (profileError) {
        throw new Error(profileError.message);
      }

      setAvatarUrl(nextAvatarUrl);
      setSuccessMessage("Profile photo updated.");
    } catch (err) {
      setError(formatProfileError(err, "upload"));
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!userId) return;

    const trimmedFirstName = capitalizeNameWords(firstName);
    const trimmedLastName = capitalizeNameWords(lastName);

    if (!trimmedFirstName || !trimmedLastName) {
      setError("First name and last name are required.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { error: saveError } = await supabase.from("user_profiles").upsert(
        {
          user_id: userId,
          first_name: trimmedFirstName,
          last_name: trimmedLastName,
          barn_name: barnName.trim() || null,
          preferred_breeds: preferredBreeds.trim()
            ? formatDisciplineList(preferredBreeds)
            : null,
          preferred_disciplines: preferredDisciplines.trim()
            ? formatDisciplineList(preferredDisciplines)
            : null,
          avatar_url: avatarUrl?.split("?")[0] ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (saveError) {
        throw new Error(saveError.message);
      }

      setFirstName(trimmedFirstName);
      setLastName(trimmedLastName);
      setPreferredBreeds(
        preferredBreeds.trim() ? formatDisciplineList(preferredBreeds) : "",
      );
      setPreferredDisciplines(
        preferredDisciplines.trim()
          ? formatDisciplineList(preferredDisciplines)
          : "",
      );

      if (isSetupFlow) {
        router.push("/welcome");
        return;
      }

      setSuccessMessage("Profile saved successfully.");
    } catch (err) {
      setError(formatProfileError(err, "save"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-400">
        Loading…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6 text-center text-zinc-400">
        <p className="text-sm text-zinc-300">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <AppHamburgerMenu />
      <button
        type="button"
        onClick={() => router.back()}
        className="px-6 pt-6 text-sm font-medium text-accent transition hover:text-accent-hover"
      >
        ← Back
      </button>
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

      <main className="mx-auto max-w-xl px-4 py-10">
        {isSetupFlow ? (
          <p className="mb-6 text-center text-sm font-medium text-accent">
            Complete your profile to get started
          </p>
        ) : null}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-white">My Profile</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Update your account details and preferences
          </p>
        </div>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <div className="flex flex-col items-center gap-4">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt="Profile photo"
                  className="h-24 w-24 rounded-full border border-zinc-700 object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-dashed border-zinc-700 bg-zinc-950 text-xs text-zinc-500">
                  No photo
                </div>
              )}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => void handleAvatarChange(event)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar || saving}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {uploadingAvatar ? "Uploading…" : "Upload profile photo"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="profile-first-name"
                  className="mb-2 block text-xs font-medium text-zinc-400"
                >
                  First name <span className="text-red-500">*</span>
                </label>
                <input
                  id="profile-first-name"
                  type="text"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  autoComplete="given-name"
                  required
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="profile-last-name"
                  className="mb-2 block text-xs font-medium text-zinc-400"
                >
                  Last name <span className="text-red-500">*</span>
                </label>
                <input
                  id="profile-last-name"
                  type="text"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  autoComplete="family-name"
                  required
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="profile-barn-name"
                className="mb-2 block text-xs font-medium text-zinc-400"
              >
                Barn/farm name
              </label>
              <input
                id="profile-barn-name"
                type="text"
                value={barnName}
                onChange={(event) => setBarnName(event.target.value)}
                placeholder="e.g. Hennis Performance Horses"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
              />
            </div>

            <TypeaheadInput
              id="profile-preferred-breeds"
              label="Preferred breeds (optional)"
              value={preferredBreeds}
              onChange={setPreferredBreeds}
              placeholder="e.g. Quarter Horse, Thoroughbred, Paint"
              suggestions={BREED_SUGGESTIONS}
              appendOnSelect
              hint="Select one or more breeds."
            />

            <TypeaheadInput
              id="profile-preferred-disciplines"
              label="Preferred disciplines (optional)"
              value={preferredDisciplines}
              onChange={setPreferredDisciplines}
              placeholder="e.g. Barrel Racing, Dressage, Broodmare"
              suggestions={DISCIPLINE_SUGGESTIONS}
              appendOnSelect
              hint="Select one or more disciplines."
            />

            <div>
              <label
                htmlFor="profile-email"
                className="mb-2 block text-xs font-medium text-zinc-400"
              >
                Email
              </label>
              <input
                id="profile-email"
                type="email"
                value={email}
                readOnly
                className="w-full cursor-not-allowed rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-500"
              />
            </div>

            {error ? (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            ) : null}

            {successMessage ? (
              <p className="text-sm text-accent" role="status">
                {successMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={saving || uploadingAvatar}
              className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save profile"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-zinc-400">
          Loading…
        </div>
      }
    >
      <ProfilePageContent />
    </Suspense>
  );
}
