'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

export interface SignaturePadHandle {
  toDataURL: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

// A small dependency-free signature canvas (pointer events → strokes). Exposes
// toDataURL/clear/isEmpty through a ref so a parent can capture the drawing and
// upload it as a PNG. Kept deliberately minimal — no external library.
export function SignaturePad({
  ref,
  height = 160,
  onChange,
}: {
  ref?: Ref<SignaturePadHandle>;
  height?: number;
  onChange?: (empty: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [, setTick] = useState(0);

  useImperativeHandle(ref, () => ({
    toDataURL: () => (dirty.current ? (canvasRef.current?.toDataURL('image/png') ?? null) : null),
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      dirty.current = false;
      onChange?.(true);
      setTick((t) => t + 1);
    },
    isEmpty: () => !dirty.current,
  }));

  // Size the backing store to the element for crisp lines on HiDPI screens.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#0f172a';
    }
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!dirty.current) {
      dirty.current = true;
      onChange?.(false);
    }
  }

  function end() {
    drawing.current = false;
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ height, touchAction: 'none' }}
      className="w-full cursor-crosshair rounded-lg border border-slate-300 bg-white"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerLeave={end}
    />
  );
}
