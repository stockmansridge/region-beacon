// Center-burst confetti pop. Renders bright pieces that explode outward
// from the center of the parent (the progress ring), then fade. Parent
// must be `position: relative`.

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

export function RingConfetti() {
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
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
