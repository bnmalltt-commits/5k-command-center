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
    // Development only: ?force3d shows the scene even with reduced motion set,
    // so it can be checked on machines that have that setting on.
    const forced =
      process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).has("force3d");
    const update = () => setEnabled(!mobile.matches && (forced || !reduced.matches));
    update();
    mobile.addEventListener("change", update);
    reduced.addEventListener("change", update);
    return () => {
      mobile.removeEventListener("change", update);
      reduced.removeEventListener("change", update);
    };
  }, []);

  // Lets CSS drop the flat background image while the live scene is showing.
  useEffect(() => {
    document.documentElement.dataset.scene = enabled ? "on" : "off";
  }, [enabled]);

  if (!enabled) return null;
  return <CommandScene />;
}
