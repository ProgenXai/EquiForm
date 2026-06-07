import type { createServiceRoleClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

type HorseProfileFields = {
  name: string;
  breed: string | null;
  coat_color: string;
  age: string;
  sex: string;
  discipline: string | null;
};

export async function linkReportToHorse(
  serviceClient: ServiceClient,
  userId: string,
  reportId: string,
  profile: HorseProfileFields,
): Promise<void> {
  const trimmedName = profile.name.trim();
  if (!trimmedName) {
    return;
  }

  const { data: existingHorse, error: lookupError } = await serviceClient
    .from("horses")
    .select("id")
    .eq("user_id", userId)
    .eq("name", trimmedName)
    .maybeSingle();

  if (lookupError) {
    console.error("[horses] lookup failed:", lookupError);
    return;
  }

  let horseId: string;

  if (existingHorse) {
    const { error: updateError } = await serviceClient
      .from("horses")
      .update({
        breed: profile.breed,
        coat_color: profile.coat_color,
        age: profile.age,
        sex: profile.sex,
        discipline: profile.discipline,
      })
      .eq("id", existingHorse.id);

    if (updateError) {
      console.error("[horses] update failed:", updateError);
      return;
    }

    horseId = existingHorse.id;
  } else {
    const { data: newHorse, error: insertError } = await serviceClient
      .from("horses")
      .insert({
        user_id: userId,
        name: trimmedName,
        breed: profile.breed,
        coat_color: profile.coat_color,
        age: profile.age,
        sex: profile.sex,
        discipline: profile.discipline,
      })
      .select("id")
      .single();

    if (insertError || !newHorse) {
      console.error("[horses] insert failed:", insertError);
      return;
    }

    horseId = newHorse.id;
  }

  const { error: reportUpdateError } = await serviceClient
    .from("reports")
    .update({ horse_id: horseId })
    .eq("id", reportId);

  if (reportUpdateError) {
    console.error("[horses] report link failed:", reportUpdateError);
  }
}
