"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { sceneTier, useSceneMode, webglAvailable, type SceneTier } from "./prefs";
import type { WidgetArgs, WidgetKind } from "./widget-view";

// The 3D code loads on its own, after the page, and only when 3D is on.
const WidgetView = dynamic(() => import("./widget-view"), { ssr: false });
const WidgetLayer = dynamic(() => import("./widget-layer"), { ssr: false });

// "full" or "calm" while 3D pieces should show, null when 3D is off or the
// browser has no WebGL.
export function useWidgets3D() {
  const mode = useSceneMode();
  const [webgl, setWebgl] = useState(false);
  useEffect(() => setWebgl(webglAvailable()), []);
  return mode !== "off" && webgl ? mode : null;
}

// A 3D piece laid out like any element: the wrapper takes its size from
// `className`; `fallback` shows instead when 3D is off.
export function Widget3D({
  kind,
  args = {},
  className = "",
  fallback = null,
}: {
  kind: WidgetKind;
  args?: WidgetArgs;
  className?: string;
  fallback?: ReactNode;
}) {
  const mode = useWidgets3D();
  if (!mode) return <>{fallback}</>;
  return (
    <div className={`w3d ${className}`} aria-hidden="true">
      <WidgetView kind={kind} args={args} calm={mode === "calm"} />
    </div>
  );
}

// Mount once inside the signed-in app: the canvas every Widget3D draws into.
export function WidgetStage() {
  const mode = useWidgets3D();
  const [tier, setTier] = useState<SceneTier | null>(null);
  useEffect(() => setTier(sceneTier()), []);
  if (!mode || !tier) return null;
  return <WidgetLayer tier={tier} calm={mode === "calm"} />;
}
