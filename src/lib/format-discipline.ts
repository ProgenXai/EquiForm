import {
  DISCIPLINE_OTHER,
  DISCIPLINE_SUGGESTIONS,
} from "@/lib/horse-form-suggestions";

const PREDEFINED_DISCIPLINE_LOOKUP = new Map(
  DISCIPLINE_SUGGESTIONS.map((discipline) => [
    discipline.toLowerCase(),
    discipline,
  ]),
);

export function formatDisciplineList(discipline: string): string {
  return discipline
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

export function parseDisciplineValue(value: string): {
  predefined: string;
  custom: string;
} {
  const predefinedParts: string[] = [];
  const customParts: string[] = [];

  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.toLowerCase() === DISCIPLINE_OTHER.toLowerCase()) {
      continue;
    }

    const predefined = PREDEFINED_DISCIPLINE_LOOKUP.get(trimmed.toLowerCase());
    if (predefined) {
      if (
        !predefinedParts.some(
          (existing) => existing.toLowerCase() === predefined.toLowerCase(),
        )
      ) {
        predefinedParts.push(predefined);
      }
      continue;
    }

    customParts.push(trimmed);
  }

  return {
    predefined: formatDisciplineList(predefinedParts.join(", ")),
    custom: formatDisciplineList(customParts.join(", ")),
  };
}

export function combineDisciplineValue(
  predefined: string,
  custom: string,
): string {
  const parts = [
    ...predefined
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
    ...custom
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  ];

  return formatDisciplineList(parts.join(", "));
}

export function getDisciplineParts(value: string): {
  predefined: string[];
  custom: string[];
} {
  const parsed = parseDisciplineValue(value);
  return {
    predefined: parsed.predefined
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
    custom: parsed.custom
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  };
}

export function addPredefinedDiscipline(
  value: string,
  discipline: string,
): string {
  const { predefined, custom } = getDisciplineParts(value);
  if (
    predefined.some(
      (existing) => existing.toLowerCase() === discipline.toLowerCase(),
    )
  ) {
    return value;
  }

  return combineDisciplineValue(
    [...predefined, discipline].join(", "),
    custom.join(", "),
  );
}

export function removeDiscipline(value: string, discipline: string): string {
  const target = discipline.toLowerCase();
  const { predefined, custom } = getDisciplineParts(value);

  return combineDisciplineValue(
    predefined
      .filter((part) => part.toLowerCase() !== target)
      .join(", "),
    custom.filter((part) => part.toLowerCase() !== target).join(", "),
  );
}

export function setCustomDisciplines(value: string, custom: string): string {
  const { predefined } = getDisciplineParts(value);
  return combineDisciplineValue(predefined.join(", "), custom);
}
