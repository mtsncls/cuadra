const PREFIX = "cuadra:";
const LEGACY_PREFIX = "openquip:";

/**
 * Reads a preference, transparently migrating values stored under the app's
 * previous name ("openquip:") so nobody loses their display name or layout.
 */
export function getStored(key: string): string | null {
  const value = localStorage.getItem(PREFIX + key);
  if (value !== null) return value;
  const legacy = localStorage.getItem(LEGACY_PREFIX + key);
  if (legacy !== null) {
    localStorage.setItem(PREFIX + key, legacy);
    localStorage.removeItem(LEGACY_PREFIX + key);
  }
  return legacy;
}

export function setStored(key: string, value: string): void {
  localStorage.setItem(PREFIX + key, value);
}
