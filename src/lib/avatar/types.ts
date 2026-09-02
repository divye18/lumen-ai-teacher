import type { Result } from "@/lib/result";

/**
 * PROVIDER ABSTRACTION — talking avatar / presenter.
 * Vendor implementations are added in a later phase.
 */

export interface AvatarRenderOptions {
  /** Text the avatar should speak. */
  text: string;
  /** Pre-synthesised audio, if TTS was run separately. */
  audio?: ArrayBuffer;
  /** Provider-known avatar/persona id. */
  avatarId?: string;
  language?: string;
  signal?: AbortSignal;
}

export type AvatarRenderResult =
  | {
      kind: "video";
      /** Short-lived URL or data reference to the rendered clip. */
      ref: string;
      mimeType: string;
      durationMs?: number;
    }
  | {
      kind: "stream";
      /** Session id for a realtime avatar stream. */
      sessionId: string;
    };

export interface AvatarProvider {
  readonly id: string;
  render(options: AvatarRenderOptions): Promise<Result<AvatarRenderResult>>;
}
