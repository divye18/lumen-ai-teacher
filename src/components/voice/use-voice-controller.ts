"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { VoiceController, type VoiceState } from "@/lib/voice/controller";
import {
  createBrowserRecognizer,
  createBrowserSynthesizer,
} from "@/lib/voice/browser-speech";
import {
  createCloudRecognizer,
  createCloudSynthesizer,
} from "@/lib/voice/cloud-speech";
import {
  withRecognizerFallback,
  withSynthesizerFallback,
} from "@/lib/voice/fallback";
import {
  detectVoiceCapabilities,
  type VoiceCapabilities,
} from "@/lib/voice/capabilities";
import { mapSessionLanguageToVoiceLocale } from "@/lib/voice/language";
import type { VoiceCloudStatus } from "@/lib/voice/types";

/**
 * React binding for the `VoiceController`. Owns the voice adapters (cloud,
 * falling back transparently to browser Web Speech — see `@/lib/voice/
 * fallback`) and a Web-Audio mic-level meter, and exposes a small,
 * declarative surface to the Teaching Room. All failures surface as `error`
 * — never an exception. The Teaching Room never knows which provider spoke
 * or listened.
 */

/** Which provider is actually carrying each channel right now. */
export type ActiveVoiceProvider = "cloud" | "browser" | "none";

export interface VoiceControllerHook {
  state: VoiceState;
  capabilities: VoiceCapabilities;
  /** The real provider in effect per channel — for an honest status badge. */
  activeProvider: { stt: ActiveVoiceProvider; tts: ActiveVoiceProvider };
  partialTranscript: string;
  caption: string;
  spokenChars: number;
  /** 0..1 audio activity for the presence orb + waveform. */
  level: number;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  markProcessingDone: () => void;
  recover: () => void;
  /** Register a callback for a completed learner utterance. */
  onTranscript: (cb: (text: string) => void) => void;
}

export function useVoiceController(
  voiceCloud?: VoiceCloudStatus,
  /** The session's `language` field (`"en" | "hi" | "hinglish"`) — the ONLY
   * source of truth for voice locale; never inferred from the transcript,
   * browser locale, or UI locale. */
  language?: string,
): VoiceControllerHook {
  const [state, setState] = useState<VoiceState>("IDLE");
  const [partialTranscript, setPartial] = useState("");
  const [caption, setCaption] = useState("");
  const [spokenChars, setSpokenChars] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const capabilities = useMemo(() => detectVoiceCapabilities(), []);
  const audioRef = useRef<{
    ctx: AudioContext;
    analyser: AnalyserNode;
    stream: MediaStream;
    raf: number;
  } | null>(null);
  const speakStartRef = useRef(0);
  const speakRafRef = useRef(0);

  // Built exactly once per mount — cloud adapters are only attempted when
  // the server says a provider is actually configured, and each factory
  // itself degrades to `null` when the underlying browser API is missing.
  // Deliberately mount-only: `capabilities`/`voiceCloud` don't change after
  // the first render, and the adapters below start real browser APIs.
  const voiceDeps = useMemo(() => {
    // The ONLY place `session.language` is mapped to a voice locale — every
    // adapter below (browser + cloud, primary + fallback) is built from this
    // one resolved tag, so a mid-utterance fallback never changes language.
    const voiceLocale = mapSessionLanguageToVoiceLocale(language);
    const browserRecognizer = capabilities.recognition
      ? createBrowserRecognizer(voiceLocale)
      : null;
    const browserSynthesizer = capabilities.synthesis
      ? createBrowserSynthesizer(voiceLocale)
      : null;
    const cloudRecognizer =
      voiceCloud?.stt && capabilities.microphone
        ? createCloudRecognizer(voiceLocale)
        : null;
    const cloudSynthesizer = voiceCloud?.tts
      ? createCloudSynthesizer(voiceLocale)
      : null;
    return {
      browserRecognizer,
      browserSynthesizer,
      cloudRecognizer,
      cloudSynthesizer,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [activeProvider, setActiveProvider] = useState<{
    stt: ActiveVoiceProvider;
    tts: ActiveVoiceProvider;
  }>(() => ({
    stt: voiceDeps.cloudRecognizer
      ? "cloud"
      : voiceDeps.browserRecognizer
        ? "browser"
        : "none",
    tts: voiceDeps.cloudSynthesizer
      ? "cloud"
      : voiceDeps.browserSynthesizer
        ? "browser"
        : "none",
  }));

  const [controller] = useState<VoiceController>(() => {
    const recognizer = voiceDeps.cloudRecognizer
      ? withRecognizerFallback(
          voiceDeps.cloudRecognizer,
          voiceDeps.browserRecognizer,
          () => setActiveProvider((p) => ({ ...p, stt: "browser" })),
        )
      : voiceDeps.browserRecognizer;
    const synthesizer = voiceDeps.cloudSynthesizer
      ? withSynthesizerFallback(
          voiceDeps.cloudSynthesizer,
          voiceDeps.browserSynthesizer,
          () => setActiveProvider((p) => ({ ...p, tts: "browser" })),
        )
      : voiceDeps.browserSynthesizer;

    return new VoiceController({
      recognizer,
      synthesizer,
      events: {
        onStateChange: (next) => setState(next),
        onPartialTranscript: (text) => setPartial(text),
        onTranscript: () => setPartial(""),
        onCaption: ({ text, spokenChars: n }) => {
          setCaption(text);
          setSpokenChars(n);
        },
        onError: (message) => setError(message),
      },
    });
  });

  const stopMicMeter = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    cancelAnimationFrame(a.raf);
    a.stream.getTracks().forEach((t) => t.stop());
    void a.ctx.close();
    audioRef.current = null;
    setLevel(0);
  }, []);

  const startMicMeter = useCallback(async () => {
    if (!capabilities.microphone || audioRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel((prev) => prev * 0.7 + Math.min(1, rms * 3.2) * 0.3);
        audioRef.current!.raf = requestAnimationFrame(loop);
      };
      audioRef.current = {
        ctx,
        analyser,
        stream,
        raf: requestAnimationFrame(loop),
      };
    } catch {
      // Mic denied — recognition may still work; the meter just stays flat.
    }
  }, [capabilities.microphone]);

  // Synthetic level while speaking (no output-tap in the browser).
  useEffect(() => {
    if (state !== "SPEAKING") {
      cancelAnimationFrame(speakRafRef.current);
      return;
    }
    speakStartRef.current = performance.now();
    const loop = () => {
      const t = (performance.now() - speakStartRef.current) / 1000;
      const wobble =
        0.45 +
        0.28 * Math.sin(t * 9) +
        0.16 * Math.sin(t * 21 + 1) +
        0.1 * Math.sin(t * 37);
      setLevel(Math.min(1, Math.max(0.08, wobble)));
      speakRafRef.current = requestAnimationFrame(loop);
    };
    speakRafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(speakRafRef.current);
  }, [state]);

  useEffect(() => {
    if (state === "LISTENING") void startMicMeter();
    else stopMicMeter();
  }, [state, startMicMeter, stopMicMeter]);

  useEffect(() => {
    return () => {
      stopMicMeter();
      cancelAnimationFrame(speakRafRef.current);
      controller.abort();
    };
  }, [stopMicMeter, controller]);

  const startListening = useCallback(() => {
    setError(null);
    setPartial("");
    controller.startListening();
  }, [controller]);
  const stopListening = useCallback(() => {
    controller.stopListening();
  }, [controller]);
  const speak = useCallback(
    (text: string) => {
      setError(null);
      controller.speak(text);
    },
    [controller],
  );
  const stopSpeaking = useCallback(() => {
    controller.stopSpeaking();
  }, [controller]);
  const markProcessingDone = useCallback(() => {
    // If the API round-trip failed, don't strand the machine in PROCESSING.
    const c = controller;
    if (c.getState() === "PROCESSING") c.abort();
  }, [controller]);
  const recover = useCallback(() => {
    setError(null);
    controller.recover();
  }, [controller]);
  const onTranscript = useCallback(
    (cb: (text: string) => void) => {
      controller.setUtteranceHandler(cb);
    },
    [controller],
  );

  return {
    state,
    capabilities,
    activeProvider,
    partialTranscript,
    caption,
    spokenChars,
    level,
    error,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    markProcessingDone,
    recover,
    onTranscript,
  };
}
