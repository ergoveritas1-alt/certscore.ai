function camelToSnakeKey(input: string) {
  return input
    .replace(/([a-zA-Z])(\d+)/g, "$1_$2")
    .replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function snakeToCamelKey(input: string) {
  return input.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function camelToSnakeRecord<T extends Record<string, unknown>>(record: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [camelToSnakeKey(key), value]));
}

export function snakeToCamelRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [snakeToCamelKey(key), value]));
}
