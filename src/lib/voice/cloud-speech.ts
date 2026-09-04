import type {
  Recognizer,
  RecognizerHandlers,
  Synthesizer,
  SynthesizerHandlers,
} from "./controller";

/**
 * CLOUD voice adapters — `/api/voice/speak` + `/api/voice/transcribe`.
 *
 * Same `Recognizer` / `Synthesizer` shape as `browser-speech.ts`, so
 * `VoiceController` and the Teaching Room never know which one is active.
 * The cloud STT route is a single-shot REST transcription (not a streaming
 * socket), so this recognizer never emits interim results — it captures one
 * clip with `MediaRecorder`, uploads it on `stop()`, and reports the final
 * transcript. That mirrors exactly how the server-side Deepgram adapter
 * itself works (one `fetch`, no stream).
 *
 * Never sends audio anywhere but this app's own server. Never persists
 * anything client-side beyond the in-memory recording buffer, which is
 * discarded the moment the upload settles.
 */

export function createCloudSynthesizer(language?: string): Synthesizer | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    return null;
  }

  let activeAudio: HTMLAudioElement | null = null;
  let activeUrl: string | null = null;
  let activeController: AbortController | null = null;

  function teardown() {
    activeController?.abort();
    activeController = null;
    if (activeAudio) {
      activeAudio.onended = null;
      activeAudio.onerror = null;
      activeAudio.ontimeupdate = null;
      activeAudio.pause();
      activeAudio = null;
    }
    if (activeUrl) {
      URL.revokeObjectURL(activeUrl);
      activeUrl = null;
    }
  }

  return {
    supportsStreaming: () => false,
    speak(text: string, handlers: SynthesizerHandlers) {
      // A new utterance always replaces whatever was in flight — never two
      // overlapping cloud calls from one component.
      teardown();
      const controller = new AbortController();
      activeController = controller;

      void (async () => {
        let response: Response;
        try {
          response = await fetch("/api/voice/speak", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text, language }),
            signal: controller.signal,
          });
        } catch (cause) {
          if (controller.signal.aborted) return;
          handlers.onError(describeFetchError(cause));
          return;
        }
        if (!response.ok) {
          if (controller.signal.aborted) return;
          handlers.onError("Cloud voice is unavailable right now.");
          return;
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;

        const url = URL.createObjectURL(blob);
        activeUrl = url;
        const audio = new Audio(url);
        activeAudio = audio;
        audio.ontimeupdate = () => {
          if (!audio.duration || !Number.isFinite(audio.duration)) return;
          const fraction = Math.min(1, audio.currentTime / audio.duration);
          handlers.onProgress?.(Math.round(text.length * fraction));
        };
        audio.onended = () => {
          handlers.onProgress?.(text.length);
          handlers.onEnd();
        };
        audio.onerror = () => {
          handlers.onError("Playback failed.");
        };
        try {
          await audio.play();
        } catch {
          handlers.onError("Playback was blocked.");
        }
      })();
    },
    cancel: teardown,
  };
}

function describeFetchError(cause: unknown): string {
  return cause instanceof DOMException && cause.name === "AbortError"
    ? "Cancelled."
    : "Couldn't reach the voice service.";
}

/** Smallest recognizable clip — anything shorter is almost certainly noise. */
const MIN_CLIP_BYTES = 400;

export function createCloudRecognizer(language?: string): Recognizer | null {
  if (
    typeof window === "undefined" ||
    typeof MediaRecorder === "undefined" ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    return null;
  }

  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: BlobPart[] = [];
  let uploadController: AbortController | null = null;

  function releaseMic() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    recorder = null;
  }

  return {
    supportsStreaming: () => false,
    start(handlers: RecognizerHandlers) {
      chunks = [];
      uploadController?.abort();
      uploadController = null;

      void (async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          handlers.onError("Microphone permission was denied.");
          return;
        }
        const mimeType = MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
        try {
          recorder = mimeType
            ? new MediaRecorder(stream, { mimeType })
            : new MediaRecorder(stream);
        } catch {
          handlers.onError("Could not start the microphone.");
          releaseMic();
          return;
        }
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => {
          void uploadAndReport(handlers);
        };
        recorder.onerror = () => {
          handlers.onError("Recording failed.");
          releaseMic();
        };
        recorder.start();
      })();
    },
    stop() {
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
    },
  };

  async function uploadAndReport(handlers: RecognizerHandlers): Promise<void> {
    const type = recorder?.mimeType || "audio/webm";
    releaseMic();
    const blob = new Blob(chunks, { type });
    chunks = [];

    if (blob.size < MIN_CLIP_BYTES) {
      // Never fabricate a transcript from silence / a near-empty clip.
      handlers.onEnd();
      return;
    }

    const form = new FormData();
    form.append("audio", blob, "answer.webm");
    if (language) form.append("language", language);
    const controller = new AbortController();
    uploadController = controller;

    let response: Response;
    try {
      response = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
    } catch (cause) {
      if (controller.signal.aborted) return;
      handlers.onError(describeFetchError(cause));
      return;
    }
    if (controller.signal.aborted) return;
    if (!response.ok) {
      handlers.onError("Didn't catch that — try again or type your answer.");
      return;
    }
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      transcript?: string;
    } | null;
    const transcript =
      body?.ok && typeof body.transcript === "string"
        ? body.transcript.trim()
        : "";
    if (transcript.length === 0) {
      handlers.onEnd();
      return;
    }
    handlers.onFinal(transcript);
  }
}
