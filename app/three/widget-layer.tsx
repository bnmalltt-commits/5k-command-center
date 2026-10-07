"use client";

import { View } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import type { SceneTier } from "./prefs";

// Keeps an on-demand canvas drawing: on scroll and resize (so each view
// stays pinned to its element), and on a timer that is the frame rate on
// the low tier, or a slow refresh for layout changes when still.
function Pump({ interval }: { interval: number }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const kick = () => invalidate();
    window.addEventListener("scroll", kick, { passive: true, capture: true });
    window.addEventListener("resize", kick);
    const timer = window.setInterval(kick, interval);
    return () => {
      window.removeEventListener("scroll", kick, { capture: true });
      window.removeEventListener("resize", kick);
      window.clearInterval(timer);
    };
  }, [invalidate, interval]);
  return null;
}

// One transparent canvas over the app (under the phone bar and dialogs)
// that draws every small 3D piece on the page, each clipped to its element.
// One WebGL context for all of them instead of one per icon.
export default function WidgetLayer({ tier, calm }: { tier: SceneTier; calm: boolean }) {
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  const high = tier === "high";
  const frameloop = !tabVisible ? "never" : calm || !high ? "demand" : "always";
  return (
    <div className="widget-layer" aria-hidden="true">
      <Canvas
        style={{ pointerEvents: "none" }}
        frameloop={frameloop}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true, powerPreference: high ? "high-performance" : "low-power" }}
      >
        <View.Port />
        {frameloop === "demand" && <Pump interval={calm ? 400 : 1000 / 30} />}
      </Canvas>
    </div>
  );
}
