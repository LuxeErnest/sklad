import { useEffect, useRef } from "react";

export const BackgroundGlow = () => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      el.style.setProperty("--mouse-x", `${x}px`);
      el.style.setProperty("--mouse-y", `${y}px`);
    };

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return; // Respect reduced motion

    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return <div ref={ref} className="absolute inset-0 pointer-events-none bg-gradient-primary opacity-40" aria-hidden />;
};

export default BackgroundGlow;
