import type { StoredOpenPlatformSession } from "@/types/openPlatform";

const STORAGE_KEY = "inspection-open-platform-session";

export function readOpenPlatformSession(): StoredOpenPlatformSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredOpenPlatformSession;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function writeOpenPlatformSession(session: StoredOpenPlatformSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearOpenPlatformSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}
