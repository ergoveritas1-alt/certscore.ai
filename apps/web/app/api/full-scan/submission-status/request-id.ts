export function validRequestId(value: string | null) {
  return Boolean(value && value.length >= 20 && value.length <= 120 && /^[A-Za-z0-9_-]+$/.test(value));
}
