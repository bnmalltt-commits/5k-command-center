"use client";

// Where the mouse is over the window, -1..1 on both axes (y up). The 3D
// canvases never take pointer events (the page under them must stay
// clickable), so they read this instead of their own pointer.
export const pointer = { x: 0, y: 0, active: false };

let tracking = false;
export function trackPointer() {
  if (tracking || typeof window === "undefined") return;
  tracking = true;
  window.addEventListener(
    "pointermove",
    (event) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
      pointer.active = event.pointerType === "mouse";
    },
    { passive: true },
  );
}
