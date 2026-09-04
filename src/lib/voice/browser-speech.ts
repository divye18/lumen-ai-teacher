import type {
  Recognizer,
  RecognizerHandlers,
  Synthesizer,
  SynthesizerHandlers,
} from "./controller";

/**
 * Browser Web Speech API adapters for the `VoiceController`.
 *
 * These are the zero-config, zero-key voice providers: they run entirely in
 * the browser. Cloud providers (Deepgram / ElevenLabs) implement the same
 * adapter shape server-side behind `@/lib/voice` and are swapped in when keys
 * exist — the controller and UI never change.
 */

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as typeof window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function createBrowserRecognizer(language = "en-US"): Recognizer | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;

  let recognition: SpeechRecognitionLike | null = null;
  let finalText = "";
  let delivered = false;

  return {
    supportsStreaming: () => true,
    start(handlers: RecognizerHandlers) {
      finalText = "";
      delivered = false;
      try {
        recognition = new Ctor();
      } catch {
        handlers.onError("Could not start the microphone.");
        return;
      }
      recognition.lang = language;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const transcript = result[0]?.transcript ?? "";
          if (result.isFinal) finalText += transcript;
          else interim += transcript;
        }
        if (interim) handlers.onPartial?.((finalText + interim).trim());
      };
      recognition.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") return;
        handlers.onError(
          event.error === "not-allowed"
            ? "Microphone permission was denied."
            : "Speech recognition failed.",
        );
      };
      recognition.onend = () => {
        if (delivered) return;
        delivered = true;
        if (finalText.trim().length > 0) handlers.onFinal(finalText.trim());
        else handlers.onEnd();
      };

      try {
        recognition.start();
      } catch {
        handlers.onError("Could not start the microphone.");
      }
    },
    stop() {
      try {
        recognition?.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}

export function createBrowserSynthesizer(
  language = "en-US",
): Synthesizer | null {
  if (
    typeof window === "undefined" ||
    typeof window.speechSynthesis === "undefined"
  ) {
    return null;
  }
  const synth = window.speechSynthesis;

  return {
    supportsStreaming: () => true,
    speak(text: string, handlers: SynthesizerHandlers) {
      try {
        synth.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language;
        utterance.rate = 1;
        utterance.pitch = 1;

        const voices = synth.getVoices();
        const preferred =
          voices.find(
            (v) =>
              v.lang.startsWith(language.slice(0, 2)) &&
              /natural|neural|google/i.test(v.name),
          ) ?? voices.find((v) => v.lang.startsWith(language.slice(0, 2)));
        if (preferred) utterance.voice = preferred;

        utterance.onboundary = (event) => {
          if (typeof event.charIndex === "number") {
            handlers.onProgress?.(event.charIndex);
          }
        };
        utterance.onend = () => handlers.onEnd();
        utterance.onerror = () => handlers.onError("Speech playback failed.");

        synth.speak(utterance);
      } catch {
        handlers.onError("Speech playback failed.");
      }
    },
    cancel() {
      try {
        synth.cancel();
      } catch {
        /* nothing playing */
      }
    },
  };
}
