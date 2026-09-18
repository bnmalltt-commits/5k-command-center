"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const CommandScene = dynamic(() => import("./command-scene"), { ssr: false });

export default function CommandSceneLoader() {
  // Gate the dynamic import itself (not just the render) behind these checks
  // so the three.js/react-three-fiber chunk is never fetched on small
  // screens or for viewers who asked for less motion.
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 900px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(!mobile.matches && !reduced.matches);
    update();
    mobile.addEventListener("change", update);
    reduced.addEventListener("change", update);
    return () => {
      mobile.removeEventListener("change", update);
      reduced.removeEventListener("change", update);
    };
  }, []);

  if (!enabled) return null;
  return <CommandScene />;
}
