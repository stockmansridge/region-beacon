// Shared milestone celebration burst — the ONLY confetti implementation.
//
// Center-burst confetti pop: bright pieces explode outward from the centre of
// the parent (the progress ring), then fade. Parent must be `position:
// relative`.
//
// Behaviour rules (identical for every event — legacy or brand new):
//   * Fires on a participant state transition, not on every page load. Pass a
//     `celebrationKey` describing the achieved state (e.g. "stamps-5" or
//     "prize-<id>"); once seen, that key never replays for that visitor.
//   * Plays a finite number of cycles, then stops — it never loops forever.
//   * Respects `prefers-reduced-motion` (renders nothing).
//   * Purely decorative and `pointer-events-none`, so it can never block
//     navigation on mobile.

import { useEffect, useState } from "react";

const COLORS = [
  "#FF3D7F", // hot pink
  "#FFD23F", // sunflower
  "#3BCEAC", // mint
  "#2EC4F1", // sky
  "#FF7A00", // orange
  "#B95CFF", // purple
  "#FF4D4D", // red
  "#00E676", // green
];

// Deterministic burst so SSR/CSR match. 22 pieces, spread over 360deg.
const PIECES = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2 + (i % 2 === 0 ? 0 : 0.15);
  const distance = 90 + ((i * 37) % 60); // 90–150px
  const tx = Math.cos(angle) * distance;
  const ty = Math.sin(angle) * distance;
  const rot = ((i * 53) % 360) - 180;
  const size = 6 + (i % 4) * 2; // 6–12px
  const shape = i % 3; // 0 square, 1 rect, 2 dot
  return {
    color: COLORS[i % COLORS.length],
    tx,
    ty,
    rot,
    size,
    shape,
    delay: (i % 6) * 40, // ms
  };
});

const CYCLE_MS = 1600;
const STORAGE_PREFIX = "gs-celebrated:";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function alreadyCelebrated(key: string): boolean {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function markCelebrated(key: string) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, "1");
  } catch {
    /* private mode — celebrate again next time rather than crashing */
  }
}

export function RingConfetti({
  celebrationKey,
  cycles = 2,
}: {
  /**
   * Identifies the achieved state. When provided, the burst plays once per
   * milestone per visitor instead of on every page load. Omit only for
   * always-decorative usage.
   */
  celebrationKey?: string;
  cycles?: number;
}) {
  // Never render during SSR: the decision depends on motion preference and
  // per-visitor celebration history.
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (celebrationKey && alreadyCelebrated(celebrationKey)) return;
    setPlaying(true);
    if (celebrationKey) markCelebrated(celebrationKey);
    const t = window.setTimeout(() => setPlaying(false), CYCLE_MS * cycles + 200);
    return () => window.clearTimeout(t);
  }, [celebrationKey, cycles]);

  if (!playing) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-visible"
    >
      <div className="absolute left-1/2 top-1/2 h-0 w-0">
        {PIECES.map((p, i) => {
          const w = p.shape === 1 ? p.size + 4 : p.size;
          const h = p.shape === 2 ? p.size : p.size;
          const radius = p.shape === 2 ? "9999px" : "2px";
          return (
            <span
              key={i}
              className="confetti-burst absolute block"
              style={{
                width: w,
                height: h,
                marginLeft: -w / 2,
                marginTop: -h / 2,
                backgroundColor: p.color,
                borderRadius: radius,
                boxShadow: `0 0 8px ${p.color}, 0 0 2px rgba(255,255,255,0.6)`,
                ["--cf-tx" as never]: `${p.tx}px`,
                ["--cf-ty" as never]: `${p.ty}px`,
                ["--cf-rot" as never]: `${p.rot}deg`,
                animationDelay: `${p.delay}ms`,
                animationIterationCount: cycles,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
