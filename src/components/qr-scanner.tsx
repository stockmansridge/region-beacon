import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

type Props = {
  onDecode: (text: string) => void;
  onError?: (kind: "permission" | "unsupported" | "error", message: string) => void;
};

export function QrScanner({ onDecode, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const decodedRef = useRef(false);
  const [status, setStatus] = useState<"requesting" | "scanning" | "error">("requesting");

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
        streamRef.current = null;
      }
    };

    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        onError?.("unsupported", "Camera API not available in this browser.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play().catch(() => undefined);
        setStatus("scanning");

        const canvas = canvasRef.current ?? document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          setStatus("error");
          onError?.("error", "Canvas 2D context unavailable.");
          return;
        }

        const tick = () => {
          if (cancelled || decodedRef.current) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            const w = video.videoWidth;
            const h = video.videoHeight;
            if (w && h) {
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(video, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
              if (code?.data) {
                decodedRef.current = true;
                stop();
                onDecode(code.data);
                return;
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        if (cancelled) return;
        const err = e as DOMException;
        if (err?.name === "NotAllowedError" || err?.name === "SecurityError") {
          setStatus("error");
          onError?.("permission", err.message || "Camera permission denied.");
        } else {
          setStatus("error");
          onError?.("error", err?.message || "Could not start camera.");
        }
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [onDecode, onError]);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        muted
        playsInline
      />
      <canvas ref={canvasRef} className="hidden" />
      <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      {status === "requesting" && (
        <div className="absolute inset-0 grid place-items-center text-xs text-white">
          Requesting camera…
        </div>
      )}
    </div>
  );
}
