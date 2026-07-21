"use client";

export const HORSE_AGE_OPTIONS = [
  "Weanling",
  "Yearling",
  ...Array.from({ length: 29 }, (_, index) => {
    const years = index + 2;
    return `${years} years`;
  }),
] as const;

export type HorseAgeOption = (typeof HORSE_AGE_OPTIONS)[number];

/** Formats the stored/submitted age string for reports, prompts, and PDFs. */
export function formatHorseAgeForStorage(
  ageSelection: string,
  deceased: boolean,
): string {
  const trimmed = ageSelection.trim();
  if (!trimmed) {
    return deceased ? "Deceased" : "";
  }
  return deceased ? `${trimmed} (deceased)` : trimmed;
}

type HorseAgeFieldProps = {
  id: string;
  age: string;
  deceased: boolean;
  onAgeChange: (age: string) => void;
  onDeceasedChange: (deceased: boolean) => void;
  required?: boolean;
};

export default function HorseAgeField({
  id,
  age,
  deceased,
  onAgeChange,
  onDeceasedChange,
  required = true,
}: HorseAgeFieldProps) {
  const deceasedId = `${id}-deceased`;
  const ageLabel = deceased
    ? "Age at death / last known age"
    : "Age";

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor={id}
          className="mb-2 block text-xs font-medium text-zinc-400"
        >
          {ageLabel}{" "}
          {required ? <span className="text-red-500">*</span> : null}
          {!required && deceased ? (
            <span className="font-normal text-zinc-500">(optional)</span>
          ) : null}
        </label>
        <select
          id={id}
          value={age}
          onChange={(event) => onAgeChange(event.target.value)}
          required={required}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
        >
          <option value="">Select age</option>
          {HORSE_AGE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-zinc-500">
          Choose the closest category or age in whole years (up to 30).
        </p>
      </div>

      <label
        htmlFor={deceasedId}
        className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300"
      >
        <input
          id={deceasedId}
          type="checkbox"
          checked={deceased}
          onChange={(event) => onDeceasedChange(event.target.checked)}
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 text-accent focus:ring-accent"
        />
        Deceased
      </label>
      {deceased ? (
        <p className="text-xs text-zinc-500">
          For breeding-record or historical analysis. Still select the horse&apos;s
          age at death or last known age above, if known.
        </p>
      ) : null}
    </div>
  );
}
