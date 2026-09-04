/**
 * Browser voice capability detection. Client-safe (no `server-only`).
 * Used to decide whether to offer voice at all, and which fallbacks apply.
 */

export interface VoiceCapabilities {
  /** Web Speech API `SpeechRecognition` (live STT). */
  recognition: boolean;
  /** Web Speech API `speechSynthesis` (TTS). */
  synthesis: boolean;
  /** `getUserMedia` exists (needed for the audio-level meter). */
  microphone: boolean;
  /** True when any voice input or output is possible. */
  anyVoice: boolean;
}

export function detectVoiceCapabilities(): VoiceCapabilities {
  if (typeof window === "undefined") {
    return {
      recognition: false,
      synthesis: false,
      microphone: false,
      anyVoice: false,
    };
  }
  const w = window as typeof window & {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  const recognition = Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  const synthesis =
    typeof window.speechSynthesis !== "undefined" &&
    typeof window.SpeechSynthesisUtterance !== "undefined";
  const microphone = Boolean(
    navigator.mediaDevices && navigator.mediaDevices.getUserMedia,
  );
  return {
    recognition,
    synthesis,
    microphone,
    anyVoice: recognition || synthesis,
  };
}
