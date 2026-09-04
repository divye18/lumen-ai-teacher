"use client";

import type { SceneState } from "@/lib/scene";

/**
 * 2D fallback for a `SceneState` — used when WebGL is unavailable or the 3D
 * canvas errors. Same data, laid out top-to-bottom by y-position, so the
 * lesson still teaches the structure.
 */
export function SceneFallback({
  scene,
  selectedKey,
  onSelect,
}: {
  scene: SceneState;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const ordered = [...scene.objects].sort(
    (a, b) => b.position[1] - a.position[1],
  );
  return (
    <div className="flex flex-col gap-1.5">
      {ordered.map((o) => {
        const active = o.highlighted || selectedKey === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onSelect(o.key === selectedKey ? "" : o.key)}
            aria-pressed={selectedKey === o.key}
            className="w-full text-left"
            style={{ opacity: o.dimmed ? 0.45 : 1 }}
          >
            <div
              className="rounded-[var(--radius-sm)] border px-3 py-2"
              style={{
                marginInline: `${Math.max(0, 3 - o.size) * 8}px`,
                borderColor: active
                  ? "var(--color-accent)"
                  : "var(--color-border)",
                background: active
                  ? "var(--color-accent-soft)"
                  : "var(--color-surface)",
              }}
            >
              <p className="text-[12px] font-medium text-[var(--color-ink)]">
                {o.label}
              </p>
              {o.detail ? (
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-ink-muted)]">
                  {o.detail}
                </p>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
