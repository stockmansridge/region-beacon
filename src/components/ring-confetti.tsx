export function RingConfetti() {
  const pieces: Array<{ top: string; left: string; rot: number; color: string; w: number; h: number; delay: string }> = [
    { top: "4%", left: "10%", rot: -18, color: "var(--event-accent)", w: 10, h: 4, delay: "0s" },
    { top: "14%", left: "88%", rot: 22, color: "var(--event-button-primary-bg)", w: 6, h: 6, delay: "0.3s" },
    { top: "48%", left: "-2%", rot: 8, color: "#F5B841", w: 8, h: 3, delay: "0.6s" },
    { top: "56%", left: "94%", rot: -30, color: "#E76F51", w: 4, h: 8, delay: "0.15s" },
    { top: "86%", left: "18%", rot: 12, color: "var(--event-accent)", w: 6, h: 6, delay: "0.45s" },
    { top: "90%", left: "78%", rot: -8, color: "#F5B841", w: 9, h: 4, delay: "0.75s" },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece absolute block rounded-[2px]"
          style={{
            top: p.top,
            left: p.left,
            width: p.w,
            height: p.h,
            backgroundColor: p.color,
            ["--confetti-rot" as never]: `${p.rot}deg`,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  );
}
