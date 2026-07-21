"use client";

import { useEffect, useState } from "react";

export const HORSE_AGE_OPTIONS = [
  "Weanling",
  "Yearling",
  ...Array.from({ length: 29 }, (_, index) => {
    const years = index + 2;
    return `${years} years`;
  }),
] as const;

export type HorseAgeOption = (typeof HORSE_AGE_OPTIONS)[number];

const OTHER_SELECT_VALUE = "__other__";
const CUSTOM_AGE_MIN = 0;
const CUSTOM_AGE_MAX = 40;

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

function isPresetAge(value: string): boolean {
  return (HORSE_AGE_OPTIONS as readonly string[]).includes(value);
}

function parseCustomYears(value: string): number | null {
  const match = /^(\d+)\s+years$/i.exec(value.trim());
  if (!match) return null;
  const years = Number(match[1]);
  if (
    !Number.isInteger(years) ||
    years < CUSTOM_AGE_MIN ||
    years > CUSTOM_AGE_MAX
  ) {
    return null;
  }
  return years;
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
  const customId = `${id}-custom`;
  const ageLabel = deceased
    ? "Age at death / last known age"
    : "Age";

  const customYearsFromAge = parseCustomYears(age);
  const [otherSelected, setOtherSelected] = useState(
    () => Boolean(age) && !isPresetAge(age),
  );
  const [customInput, setCustomInput] = useState(
    () => (customYearsFromAge !== null ? String(customYearsFromAge) : ""),
  );

  useEffect(() => {
    if (isPresetAge(age)) {
      setOtherSelected(false);
      setCustomInput("");
      return;
    }

    const parsed = parseCustomYears(age);
    if (parsed !== null) {
      setOtherSelected(true);
      setCustomInput(String(parsed));
      return;
    }

    if (!age.trim() && !otherSelected) {
      setCustomInput("");
    }
  }, [age, otherSelected]);

  const selectValue = otherSelected
    ? OTHER_SELECT_VALUE
    : isPresetAge(age)
      ? age
      : "";

  function handleSelectChange(value: string) {
    if (value === OTHER_SELECT_VALUE) {
      setOtherSelected(true);
      onAgeChange(
        customInput !== "" && parseCustomYears(`${customInput} years`) !== null
          ? `${Number(customInput)} years`
          : "",
      );
      return;
    }

    setOtherSelected(false);
    setCustomInput("");
    onAgeChange(value);
  }

  function handleCustomInputChange(raw: string) {
    // Allow clearing and typing digits only (no decimals / fractions).
    if (raw === "") {
      setCustomInput("");
      onAgeChange("");
      return;
    }

    if (!/^\d+$/.test(raw)) {
      return;
    }

    const years = Number(raw);
    if (!Number.isInteger(years)) {
      return;
    }

    setCustomInput(raw);

    if (years < CUSTOM_AGE_MIN || years > CUSTOM_AGE_MAX) {
      onAgeChange("");
      return;
    }

    onAgeChange(`${years} years`);
  }

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
          value={selectValue}
          onChange={(event) => handleSelectChange(event.target.value)}
          required={required && !otherSelected}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
        >
          <option value="">Select age</option>
          {HORSE_AGE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={OTHER_SELECT_VALUE}>Other (enter age)</option>
        </select>
        <p className="mt-1.5 text-xs text-zinc-500">
          Choose a category, a listed age, or Other to type a specific age in
          whole years (0–{CUSTOM_AGE_MAX}).
        </p>
      </div>

      {otherSelected ? (
        <div>
          <label
            htmlFor={customId}
            className="mb-2 block text-xs font-medium text-zinc-400"
          >
            Age in years{" "}
            {required ? <span className="text-red-500">*</span> : null}
          </label>
          <input
            id={customId}
            type="number"
            inputMode="numeric"
            min={CUSTOM_AGE_MIN}
            max={CUSTOM_AGE_MAX}
            step={1}
            value={customInput}
            onChange={(event) => handleCustomInputChange(event.target.value)}
            required={required}
            placeholder={`e.g. 7 (0–${CUSTOM_AGE_MAX})`}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
          />
        </div>
      ) : null}

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
          For breeding-record or historical analysis. Still select or enter the
          horse&apos;s age at death or last known age above, if known.
        </p>
      ) : null}
    </div>
  );
}
