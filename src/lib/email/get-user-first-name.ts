import type { createServiceRoleClient } from "@/lib/supabase/server";

export async function getUserFirstName(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  userId: string,
): Promise<string | undefined> {
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("first_name")
    .eq("user_id", userId)
    .maybeSingle();

  const firstName =
    typeof profile?.first_name === "string" ? profile.first_name.trim() : "";

  return firstName || undefined;
}

export function getEmailGreetingName(
  firstName: string | undefined,
  email: string,
): string {
  if (firstName?.trim()) {
    return firstName.trim();
  }

  const localPart = email.split("@")[0]?.trim();
  return localPart || "there";
}
