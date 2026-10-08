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

// One-off 3D moments, played by the overlay in fx-layer.tsx. "coins" carries
// the points just gained.
export type FxKind = "airdrop" | "celebrate" | "coins";
export type FxEvent = { kind: FxKind; amount?: number };
const FX_EVENT = "fivek-fx";

export function playFx(kind: FxKind, amount?: number) {
  if (typeof window === "undefined" || getSceneMode() !== "full") return;
  window.dispatchEvent(new CustomEvent(FX_EVENT, { detail: { kind, amount } satisfies FxEvent }));
}

export function onFx(handler: (event: FxEvent) => void) {
  const listener = (event: Event) => handler((event as CustomEvent).detail as FxEvent);
  window.addEventListener(FX_EVENT, listener);
  return () => window.removeEventListener(FX_EVENT, listener);
}

// Sound for the 3D moments: on unless switched off, remembered per browser.
const SOUND_KEY = "fivek_sound";
const SOUND_EVENT = "fivek-sound";
export function getSoundOn() {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}
export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event(SOUND_EVENT));
}
export function useSoundOn() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(getSoundOn());
    const onChange = () => setOn(getSoundOn());
    window.addEventListener(SOUND_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(SOUND_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return on;
}
