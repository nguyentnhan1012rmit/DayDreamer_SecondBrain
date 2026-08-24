export type MemoryDateSource = {
  entryDate?: Date | string | null;
  createdAt: Date | string;
};

function parseDate(value: Date | string) {
  if (value instanceof Date) return new Date(value.getTime());

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    const localDate = new Date(year, month, day);

    if (
      localDate.getFullYear() === year &&
      localDate.getMonth() === month &&
      localDate.getDate() === day
    ) {
      return localDate;
    }

    return new Date(Number.NaN);
  }

  return new Date(value);
}

export function resolveMemoryDate(entry: MemoryDateSource) {
  if (entry.entryDate) {
    const memoryDate = parseDate(entry.entryDate);
    if (Number.isFinite(memoryDate.getTime())) return memoryDate;
  }

  return parseDate(entry.createdAt);
}

export function toLocalDateKey(value: Date | string = new Date()) {
  const date = parseDate(value);
  if (!Number.isFinite(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
