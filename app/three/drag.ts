"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";

// Turning a 3D piece by dragging it. The page element owns the pointer (the
// canvas never takes events); the 3D side reads this shared object each frame
// and eases back when let go. `kick` is set by the 3D side to ask for a frame
// when the scene only draws on demand.
export type DragState = { yaw: number; pitch: number; held: boolean; kick?: () => void };

const PX_TO_RAD = 0.012;

export function useDragRotate() {
  const state = useRef<DragState>({ yaw: 0, pitch: 0, held: false }).current;
  const start = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    start.current = { x: event.clientX, y: event.clientY, yaw: state.yaw, pitch: state.pitch, moved: false };
    state.held = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s) return;
    const dx = event.clientX - s.x;
    const dy = event.clientY - s.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) s.moved = true;
    state.yaw = s.yaw + dx * PX_TO_RAD;
    state.pitch = Math.max(-0.6, Math.min(0.6, s.pitch + dy * PX_TO_RAD * 0.6));
    state.kick?.();
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const s = start.current;
    start.current = null;
    state.held = false;
    state.kick?.();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    // A drag isn't a click: swallow the click it would fire on a tile button.
    if (s?.moved) {
      const swallow = (click: Event) => {
        click.stopPropagation();
        click.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    }
  };
  return {
    state,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
