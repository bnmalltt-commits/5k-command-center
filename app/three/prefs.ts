"use client";

import { useEffect, useState } from "react";

// How the 3D layer runs, chosen per browser:
//   full — the animated arena plus the 3D moments (crate drop, podium,
//          fireworks, sign-in fly-in). The default for everyone.
//   calm — the same arena drawn once, standing still; no 3D moments.
//   off  — no WebGL at all; a still image of the arena instead.
export type SceneMode = "full" | "calm" | "off";
export const SCENE_MODES: { id: SceneMode; label: string }[] = [
  { id: "full", label: "เคลื่อนไหว" },
  { id: "calm", label: "นิ่ง" },
  { id: "off", label: "ปิด" },
];

const KEY = "fivek_3d";
const EVENT = "fivek-3d";

export function getSceneMode(): SceneMode {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "full" || saved === "calm" || saved === "off") return saved;
  } catch {}
  return "full";
}

export function setSceneMode(mode: SceneMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }));
}

export function useSceneMode(): SceneMode {
  // "off" until mounted, so the server render and the first client render agree.
  const [mode, setMode] = useState<SceneMode>("off");
  useEffect(() => {
    setMode(getSceneMode());
    const onChange = () => setMode(getSceneMode());
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return mode;
}

// "low" on phones and small or software-rendered machines: fewer particles,
// lower resolution, 30 frames a second.
export type SceneTier = "high" | "low";
let cachedTier: SceneTier | null = null;
let cachedWebgl: boolean | null = null;

function probe() {
  if (cachedWebgl !== null) return;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as WebGLRenderingContext | null;
    cachedWebgl = !!gl;
    let software = false;
    if (gl) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      software = /swiftshader|llvmpipe|software|basic render/i.test(renderer);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
    const small = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
    const weak = (navigator.hardwareConcurrency || 8) <= 4;
    cachedTier = small || weak || software ? "low" : "high";
  } catch {
    cachedWebgl = false;
    cachedTier = "low";
  }
}

export function webglAvailable() {
  probe();
  return cachedWebgl === true;
}

export function sceneTier(): SceneTier {
  probe();
  return cachedTier || "low";
}

// One-off 3D moments, played by the overlay in fx-layer.tsx.
export type FxKind = "airdrop" | "celebrate";
const FX_EVENT = "fivek-fx";

export function playFx(kind: FxKind) {
  if (typeof window === "undefined" || getSceneMode() !== "full") return;
  window.dispatchEvent(new CustomEvent(FX_EVENT, { detail: kind }));
}

export function onFx(handler: (kind: FxKind) => void) {
  const listener = (event: Event) => handler((event as CustomEvent).detail as FxKind);
  window.addEventListener(FX_EVENT, listener);
  return () => window.removeEventListener(FX_EVENT, listener);
}
