"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { sceneTier, useSceneMode, webglAvailable, type SceneTier } from "./three/prefs";

const CommandScene = dynamic(() => import("./command-scene"), { ssr: false });
const FxLayer = dynamic(() => import("./three/fx-layer"), { ssr: false });

export default function CommandSceneLoader() {
  // 3D is on for everyone by default, phones included (at a lighter tier).
  // Each person can switch it to still or off from the toggle; only a
  // browser without WebGL gets the flat image regardless.
  const mode = useSceneMode();
  const [support, setSupport] = useState<{ webgl: boolean; tier: SceneTier } | null>(null);
  useEffect(() => setSupport({ webgl: webglAvailable(), tier: sceneTier() }), []);
  const enabled = mode !== "off" && !!support?.webgl;

  // Lets CSS drop the flat background image while the live scene is showing.
  useEffect(() => {
    document.documentElement.dataset.scene = enabled ? "on" : "off";
    document.documentElement.dataset.sceneMotion = enabled ? mode : "off";
    document.documentElement.dataset.sceneTier = support?.tier || "low";
  }, [enabled, mode, support]);

  if (!enabled || !support) return null;
  return (
    <>
      <CommandScene tier={support.tier} calm={mode === "calm"} />
      {mode === "full" && <FxLayer />}
    </>
  );
}
