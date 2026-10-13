"use client";

import * as THREE from "three";

// Procedural paint for the 3D scenes, drawn into canvases at runtime (no
// image files): splats with thrown droplets and drips, dry-brush swipes,
// grainy concrete, soft glows, all in the style of the 5000 brush logo.

// Small seeded random, so the generated paint looks the same on every visit.
export function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(canvas: HTMLCanvasElement, srgb = true) {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// A soft round glow, drawn once into a texture.
export function glowTexture(inner: string, outer: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return canvasTexture(canvas);
}

// One paint splat: a lumpy blob, droplets thrown around it and, on walls,
// drips running down from it.
export function splat(ctx: CanvasRenderingContext2D, rand: () => number, x: number, y: number, r: number, color: string, drips = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.45;
    ctx.moveTo(x + Math.cos(a) * d + r * 0.6, y + Math.sin(a) * d);
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.45 + rand() * 0.35), 0, Math.PI * 2);
  }
  ctx.fill();
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const d = r * (0.9 + rand() * 1.6);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.6, r * 0.12 * rand() * (1.6 - d / (r * 2.6))), 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < drips; i++) {
    const dx = x + (rand() - 0.5) * r * 1.2;
    const w = 1.5 + rand() * r * 0.12;
    const len = r * (0.8 + rand() * 3.5);
    ctx.fillRect(dx - w / 2, y, w, len);
    ctx.beginPath();
    ctx.arc(dx, y + len, w * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
}

// A brush swipe: many thin bristle lines dragged side by side, thinning out
// towards the end of the stroke.
export function swipe(ctx: CanvasRenderingContext2D, rand: () => number, x: number, y: number, length: number, width: number, angle: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  for (let i = 0; i < 40; i++) {
    const off = (rand() - 0.5) * width;
    ctx.globalAlpha = 0.35 + rand() * 0.65;
    ctx.lineWidth = 1 + rand() * (width / 9);
    ctx.beginPath();
    ctx.moveTo(rand() * length * 0.1, off);
    ctx.lineTo(length * (0.55 + rand() * 0.45), off + (rand() - 0.5) * 4);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// Grainy dark concrete.
export function grain(ctx: CanvasRenderingContext2D, rand: () => number, w: number, h: number, base: string, specks: number) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < specks; i++) {
    const light = rand() > 0.5;
    ctx.fillStyle = light ? `rgba(255,255,255,${rand() * 0.05})` : `rgba(0,0,0,${rand() * 0.25})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}

// GLSL value noise shared by the painted shaders.
export const NOISE = `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
`;
// One splat on a transparent square, for decals that land on the page.
export function splatTexture(seed: number, color: string, drips = 0) {
  const rand = seeded(seed);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  splat(canvas.getContext("2d")!, rand, 128, 118, 46, color, drips);
  return canvasTexture(canvas);
}

// Points drawn as lumpy paint droplets, each with its own world size, colour
// and opacity (attributes aSize, aColor, aAlpha). `scale` turns world size
// into pixels at distance 1: viewport height in pixels / (2·tan(fov/2)), or
// just pixels per unit for an orthographic camera (set `ortho`).
export function dropletMaterial(ortho = false) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { scale: { value: 600 } },
    vertexShader: `uniform float scale; attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
      varying vec3 vColor; varying float vAlpha; varying float vSeed;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * scale${ortho ? "" : " / -mv.z"};
        gl_Position = projectionMatrix * mv;
        vColor = aColor; vAlpha = aAlpha; vSeed = fract(position.x * 0.137 + aSize * 7.3);
      }`,
    fragmentShader: `varying vec3 vColor; varying float vAlpha; varying float vSeed; ${NOISE}
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float edge = 0.3 + noise(c * 5.0 + vSeed * 60.0) * 0.16;
        float a = (1.0 - smoothstep(edge, edge + 0.05, length(c))) * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a);
        #include <colorspace_fragment>
      }`,
  });
}
