"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useSceneMode, webglAvailable } from "./prefs";

const PodiumScene = dynamic(() => import("./podium-scene"), { ssr: false });

// Drop inside a .podium: draws its pillars and medals in 3D over the HTML
// ones, which stay in the layout (hidden) so sizes and positions come from
// the same CSS. `watch` changes whenever the top three or scores change.
export function Podium3D({ watch }: { watch: string }) {
  const mode = useSceneMode();
  const [webgl, setWebgl] = useState(false);
  useEffect(() => setWebgl(webglAvailable()), []);
  if (mode === "off" || !webgl) return null;
  return <PodiumScene calm={mode === "calm"} watch={watch} />;
}
