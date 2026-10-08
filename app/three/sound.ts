"use client";

import { getSoundOn } from "./prefs";

// Little sounds for the 3D moments, synthesised with Web Audio (no files to
// download). Browsers only allow audio after the person has interacted with
// the page, which every moment that plays one follows.
let ctx: AudioContext | null = null;
function audio() {
  if (typeof window === "undefined" || !getSoundOn()) return null;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noise(a: AudioContext, seconds: number) {
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * seconds), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = a.createBufferSource();
  source.buffer = buffer;
  return source;
}

function envelope(a: AudioContext, at: number, peak: number, attack: number, release: number) {
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
  gain.connect(a.destination);
  return gain;
}

// Air rushing past as the crate falls, the parachute's flap.
export function whoosh(delay = 0, seconds = 1.1) {
  const a = audio();
  if (!a) return;
  const at = a.currentTime + delay;
  const src = noise(a, seconds);
  const filter = a.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(300, at);
  filter.frequency.exponentialRampToValueAtTime(1600, at + seconds * 0.7);
  src.connect(filter).connect(envelope(a, at, 0.18, seconds * 0.5, seconds * 0.5));
  src.start(at);
}

// The crate hitting the ground.
export function thud(delay = 0) {
  const a = audio();
  if (!a) return;
  const at = a.currentTime + delay;
  const osc = a.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, at);
  osc.frequency.exponentialRampToValueAtTime(45, at + 0.25);
  osc.connect(envelope(a, at, 0.5, 0.005, 0.3));
  osc.start(at);
  osc.stop(at + 0.4);
  const hit = noise(a, 0.12);
  const low = a.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 900;
  hit.connect(low).connect(envelope(a, at, 0.25, 0.002, 0.1));
  hit.start(at);
}

// A firework bursting, or the lid popping.
export function pop(delay = 0, pitch = 1) {
  const a = audio();
  if (!a) return;
  const at = a.currentTime + delay;
  const src = noise(a, 0.6);
  const filter = a.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2400 * pitch, at);
  filter.frequency.exponentialRampToValueAtTime(300, at + 0.5);
  src.connect(filter).connect(envelope(a, at, 0.35, 0.004, 0.5));
  src.start(at);
}

// A coin landing: two bright sine notes.
export function chime(delay = 0, step = 0) {
  const a = audio();
  if (!a) return;
  const at = a.currentTime + delay;
  [1318.5, 1975.5].forEach((f, i) => {
    const osc = a.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f * Math.pow(2, step / 12);
    osc.connect(envelope(a, at + i * 0.06, 0.12, 0.004, 0.35));
    osc.start(at + i * 0.06);
    osc.stop(at + i * 0.06 + 0.45);
  });
}
