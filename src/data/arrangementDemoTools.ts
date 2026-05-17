export const manualStorageKey = "arkme-demo.arrangements.manual";
export const preferenceStorageKey = "arkme-demo.arrangements.preferences";
export const autoEnabledStorageKey = "arkme-demo.arrangements.autoEnabled";
export const acknowledgedGeneratedStorageKey = "arkme-demo.arrangements.acknowledgedGenerated";
export const deletedGeneratedStorageKey = "arkme-demo.arrangements.deletedGenerated";
export const acceptedLowConfidenceStorageKey = "arkme-demo.arrangements.acceptedLowConfidence";
export const demoResetVersionStorageKey = "arkme-demo.arrangements.demoResetVersion";
export const arrangementDeliveredReminderStorageKey = "arkme-demo.arrangements.deliveredReminders";
export const arrangementDemoStateChangedEvent = "arkme-demo:arrangements-demo-state-updated";

const currentDemoResetVersion = "sample-arrangements-2026-05-17";

function notifyArrangementDemoStateChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(arrangementDemoStateChangedEvent));
}

function resetArrangementDemoState() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(preferenceStorageKey);
    window.localStorage.removeItem(acknowledgedGeneratedStorageKey);
    window.localStorage.removeItem(deletedGeneratedStorageKey);
    window.localStorage.removeItem(acceptedLowConfidenceStorageKey);
    window.localStorage.removeItem(arrangementDeliveredReminderStorageKey);
    window.localStorage.removeItem("arkme-demo.arrangements.testTime");
    window.localStorage.setItem(autoEnabledStorageKey, "true");
    window.localStorage.setItem(demoResetVersionStorageKey, currentDemoResetVersion);
  } catch {
    // Keep the in-memory UI responsive if storage writes are blocked.
  }

  notifyArrangementDemoStateChanged();
}

export function ensureCurrentArrangementDemoState() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem("arkme-demo.arrangements.testTime");
    if (window.localStorage.getItem(demoResetVersionStorageKey) === currentDemoResetVersion) return;
    resetArrangementDemoState();
  } catch {
    // Fall back to component defaults.
  }
}

export function getDeliveredArrangementReminderIds() {
  if (typeof window === "undefined") return [];

  try {
    const value = window.localStorage.getItem(arrangementDeliveredReminderStorageKey);
    if (!value) return [];
    const parsedValue = JSON.parse(value);
    return Array.isArray(parsedValue)
      ? parsedValue.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function readJsonArrayValue<T>(key: string): T[] {
  if (typeof window === "undefined") return [];

  try {
    const value = window.localStorage.getItem(key);
    if (!value) return [];
    const parsedValue = JSON.parse(value);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

export function setDeliveredArrangementReminderIds(ids: string[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(arrangementDeliveredReminderStorageKey, JSON.stringify([...new Set(ids)]));
  } catch {
    // Keep reminders in memory if storage is unavailable.
  }
}
