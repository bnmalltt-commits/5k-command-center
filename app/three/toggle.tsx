"use client";

import { useEffect, useState } from "react";
import { SCENE_MODES, setSceneMode, useSceneMode } from "./prefs";

// The 3D switch: moving / still / off, remembered per browser.
export function SceneToggle({ className = "" }: { className?: string }) {
  const mode = useSceneMode();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <div className={`scene-toggle ${className}`} role="radiogroup" aria-label="ฉากหลัง 3D">
      <span className="scene-toggle__label">3D</span>
      {SCENE_MODES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={ready && mode === id}
          className="scene-toggle__opt"
          onClick={() => setSceneMode(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
