import type { SupabaseClient } from "@supabase/supabase-js";

function capitalizeEmailPrefix(email: string): string {
  const prefix = email.split("@")[0]?.trim() ?? "";
  if (!prefix) return "there";
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

export function getWelcomeNameFromUser(user: {
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

export async function fetchWelcomeName(
  supabase: SupabaseClient,
  userId: string,
  user: {
    email?: string;
    user_metadata?: Record<string, unknown>;
  },
): Promise<string> {
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("first_name")
    .eq("user_id", userId)
    .maybeSingle();

  const profileFirstName =
    typeof profile?.first_name === "string" ? profile.first_name.trim() : "";

  return profileFirstName || getWelcomeNameFromUser(user);
}
