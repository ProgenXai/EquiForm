export function formatDisciplineList(discipline: string): string {
  return discipline
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}
