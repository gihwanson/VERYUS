import React, { useEffect, useRef } from 'react';
import './Snowfall.css';

type Flake = {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
  phase: number;
  wobble: number;
  opacity: number;
};

function makeFlake(width: number, height: number, scattered: boolean): Flake {
  return {
    x: Math.random() * width,
    y: scattered ? Math.random() * height : -8 - Math.random() * 40,
    r: 1.1 + Math.random() * 2.6,
    vy: 0.55 + Math.random() * 1.35,
    vx: -0.25 + Math.random() * 0.5,
    phase: Math.random() * Math.PI * 2,
    wobble: 0.006 + Math.random() * 0.018,
    opacity: 0.55 + Math.random() * 0.4,
  };
}

const Snowfall: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let flakes: Flake[] = [];
    let frame = 0;
    let running = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(28, Math.min(80, Math.floor(width / 18)));
      flakes = Array.from({ length: reducedMotion ? Math.ceil(count / 3) : count }, () =>
        makeFlake(width, height, true)
      );
    };

    const draw = () => {
      if (!running) return;
      frame = window.requestAnimationFrame(draw);
      if (document.hidden) return;

      context.clearRect(0, 0, width, height);
      context.shadowColor = 'rgba(55, 75, 110, 0.35)';
      context.shadowBlur = 3;

      for (const flake of flakes) {
        flake.phase += flake.wobble;
        flake.y += reducedMotion ? flake.vy * 0.35 : flake.vy;
        flake.x += flake.vx + Math.sin(flake.phase) * 0.35;

        if (flake.y - flake.r > height || flake.x < -20 || flake.x > width + 20) {
          const next = makeFlake(width, height, false);
          flake.x = next.x;
          flake.y = next.y;
          flake.r = next.r;
          flake.vy = next.vy;
          flake.vx = next.vx;
          flake.phase = next.phase;
          flake.wobble = next.wobble;
          flake.opacity = next.opacity;
        }

        context.beginPath();
        context.fillStyle = `rgba(255, 255, 255, ${flake.opacity})`;
        context.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
        context.fill();
      }
    };

    resize();
    frame = window.requestAnimationFrame(draw);
    window.addEventListener('resize', resize);

    return () => {
      running = false;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="snowfall" aria-hidden="true" />;
};

export default Snowfall;
