import { afterEach, describe, expect, it, vi } from "vitest";

import {
  VOICE_PREFERENCE_KEY,
  getVoicePreference,
  setVoicePreference,
} from "./use-voice-preference";

function fakeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
}

function stubWindowEvents() {
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent,
  });
  return dispatchEvent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getVoicePreference", () => {
  it("no stored value -> false (the default)", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(getVoicePreference()).toBe(false);
  });

  it('a stored "true" -> true', () => {
    const storage = fakeStorage();
    storage.setItem(VOICE_PREFERENCE_KEY, "true");
    vi.stubGlobal("localStorage", storage);
    expect(getVoicePreference()).toBe(true);
  });

  it('anything other than the literal string "true" -> false', () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    for (const v of ["TRUE", "1", "false", "yes", ""]) {
      storage.setItem(VOICE_PREFERENCE_KEY, v);
      expect(getVoicePreference()).toBe(false);
    }
  });

  it("a storage read failure never throws — resolves to false", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError: storage is disabled");
      },
    });
    expect(() => getVoicePreference()).not.toThrow();
    expect(getVoicePreference()).toBe(false);
  });

  it("is deterministic for the same stored value", () => {
    const storage = fakeStorage();
    storage.setItem(VOICE_PREFERENCE_KEY, "true");
    vi.stubGlobal("localStorage", storage);
    expect(getVoicePreference()).toBe(getVoicePreference());
  });
});

describe("setVoicePreference", () => {
  it("writing true then reading back returns true (round-trip)", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    stubWindowEvents();
    setVoicePreference(true);
    expect(getVoicePreference()).toBe(true);
  });

  it("writing false then reading back returns false", () => {
    const storage = fakeStorage();
    storage.setItem(VOICE_PREFERENCE_KEY, "true");
    vi.stubGlobal("localStorage", storage);
    stubWindowEvents();
    setVoicePreference(false);
    expect(getVoicePreference()).toBe(false);
  });

  it("accepts a functional updater resolved against the CURRENT stored value, not a stale one", () => {
    const storage = fakeStorage();
    storage.setItem(VOICE_PREFERENCE_KEY, "true");
    vi.stubGlobal("localStorage", storage);
    stubWindowEvents();
    setVoicePreference((prev) => !prev);
    expect(getVoicePreference()).toBe(false);
    setVoicePreference((prev) => !prev);
    expect(getVoicePreference()).toBe(true);
  });

  it("a storage write failure never throws — degrades to session-only", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    stubWindowEvents();
    expect(() => setVoicePreference(true)).not.toThrow();
  });

  it("notifies subscribers via the same event-dispatch pattern as the theme hook", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    const dispatchEvent = stubWindowEvents();
    setVoicePreference(true);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0][0] as Event;
    expect(event.type).toBe("lumen-voice-enabled-change");
  });
});
