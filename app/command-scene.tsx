"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { SceneTier } from "./three/prefs";
import { pointer, trackPointer } from "./three/pointer";
import { NOISE, canvasTexture, glowTexture, grain, seeded, splat, swipe } from "./three/paint";

// "Paint Arena", the 3D world behind the whole app, drawn in the style of the
// 5000 brush logo: a huge red ensō (a single brush-painted ring) rising from
// behind ink-black ridges, brush-stroke ribbons sweeping through the air,
// concrete pillars splashed with red paint, a splattered floor, and flecks of
// red and white paint drifting down. The 5000 emblem floats in front. The UI
// sits on dark panels above it, so text contrast never depends on the scene.
//
// tier "low" (phones, small machines) draws fewer flecks at lower resolution;
// calm draws one still frame.

// "login", or the open page ("airdrop", "party", "score", ...), set by the
// page on <html data-scene-mode>.
function usePageMode() {
  const read = () => document.documentElement.dataset.sceneMode || "login";
  const [mode, setMode] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setMode(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-scene-mode"] });
    return () => observer.disconnect();
  }, []);
  return mode;
}

const PLAIN_VERTEX = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";

// The arena follows the gang's clock (Bangkok time): a bright orange-red
// afternoon, logo red in the evening rounds, deep crimson at night, dried
// maroon in the small hours. In the half hour before a round (17:00, 20:00,
// 23:00, 01:00) the ensō turns faster and pulses, as a nudge to get ready.
type Palette = { ink: string; sky: string; haze: string };
const PALETTES: Record<string, Palette> = {
  day: { ink: "#f0261c", sky: "#121011", haze: "#2a0e0d" },
  dusk: { ink: "#e3141b", sky: "#0f0809", haze: "#33090c" },
  night: { ink: "#c8102e", sky: "#0b0607", haze: "#27060b" },
  late: { ink: "#9a0d16", sky: "#080506", haze: "#180406" },
};
const ROUND_MINUTES = [17 * 60, 20 * 60, 23 * 60, 25 * 60]; // 01:00 is after midnight
function arenaClock(at = new Date()) {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(at)
    .split(":")
    .map(Number);
  const phase = h >= 5 && h < 16 ? "day" : h >= 16 && h < 20 ? "dusk" : h >= 20 ? "night" : "late";
  // Minutes on a clock that runs past midnight until 05:00, so 01:00 is 25:00.
  const now = (h < 5 ? h + 24 : h) * 60 + m;
  const next = ROUND_MINUTES.find((round) => round >= now);
  const until = next === undefined ? Infinity : next - now;
  return { palette: PALETTES[phase], urgency: until <= 30 ? 1 - until / 30 : 0 };
}
function useArenaClock() {
  const [clock, setClock] = useState(arenaClock);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(arenaClock()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  return clock;
}
// Ease a colour uniform towards a target (instantly when the scene is still).
const towards = (uniform: { value: THREE.Color }, hex: string, k: number) => uniform.value.lerp(new THREE.Color(hex), k);

// Sky: near-black grunge overhead, a red haze low down.
function Sky({ palette, animate }: { palette: Palette; animate: boolean }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color("#050405") },
          mid: { value: new THREE.Color("#120709") },
          haze: { value: new THREE.Color("#4a0b10") },
        },
        vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 haze; varying vec3 vDir; ${NOISE}
          void main(){
            float h = vDir.y;
            vec2 q = vec2(atan(vDir.x, -vDir.z) * 3.0, h * 6.0);
            float cloud = fbm(q * 1.7);
            vec3 c = mix(haze, mid, smoothstep(-0.02, 0.22, h + (cloud - 0.5) * 0.08));
            c = mix(c, top, smoothstep(0.2, 0.6, h));
            c *= 0.82 + 0.36 * cloud;
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  // A still scene only draws on request: redraw when the hour's colours change.
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => invalidate(), [palette, invalidate]);
  useFrame((_, delta) => {
    const k = animate ? 1 - Math.pow(0.3, delta) : 1;
    towards(material.uniforms.mid, palette.sky, k);
    towards(material.uniforms.haze, palette.haze, k);
  });
  return (
    <mesh material={material} renderOrder={-2}>
      <sphereGeometry args={[170, 32, 16]} />
    </mesh>
  );
}

// An ensō: one ring painted with a loaded brush, thick and wet where it
// starts, breaking into dry bristle streaks towards the open end, with a few
// droplets thrown off. `reveal` paints it in around the circle.
const ENSO_END = 0.93;
function ensoMaterial(color: string) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ink: { value: new THREE.Color(color) }, reveal: { value: ENSO_END }, opacity: { value: 1 } },
    vertexShader: PLAIN_VERTEX,
    fragmentShader: `uniform vec3 ink; uniform float reveal; uniform float opacity; varying vec2 vUv; ${NOISE}
      void main(){
        vec2 p = vUv - 0.5;
        float r = length(p);
        // Position along the stroke, clockwise from the lower left.
        float s = fract((-2.6 - atan(p.y, p.x)) / 6.28318);
        float R = 0.37;
        float w = mix(0.095, 0.03, s) * (0.8 + 0.45 * noise(vec2(s * 7.0, 3.1)));
        float d = (r - R + (fbm(vec2(s * 90.0, r * 40.0)) - 0.5) * 0.045) / w;
        float body = 1.0 - smoothstep(0.78, 1.0, abs(d) + (noise(vec2(s * 160.0, d * 2.0)) - 0.5) * 0.35);
        // Bristle streaks run along the stroke and open up as the brush dries.
        float bristle = noise(vec2(d * 8.0 + 11.0, s * 1.6)) * 0.55 + noise(vec2(d * 31.0, s * 4.0)) * 0.45;
        float dry = 0.12 + smoothstep(0.2, 1.0, s) * 0.62;
        body *= smoothstep(dry - 0.05, dry + 0.05, bristle);
        body *= smoothstep(0.0, 0.012, s) * smoothstep(reveal, reveal - 0.05, s);
        // Droplets near the ring, only where it has been painted.
        vec2 g = p * 30.0;
        vec2 cell = floor(g);
        vec2 f = fract(g) - 0.5 - (vec2(hash(cell + 7.0), hash(cell + 13.0)) - 0.5) * 0.5;
        float size = 0.06 + 0.2 * hash(cell + 3.0);
        float drop = step(hash(cell), 0.07) * (1.0 - smoothstep(size, size + 0.05, length(f)));
        drop *= smoothstep(0.17, 0.05, abs(r - R)) * step(s, reveal);
        float a = max(body, drop) * opacity;
        if (a < 0.01) discard;
        vec3 c = ink * (0.62 + 0.38 * fbm(p * 9.0 + 4.0)) * (0.7 + 0.45 * noise(vec2(d * 19.0, s * 3.0)));
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`,
  });
}

// The big ensō behind the ridges, where the old sun used to set. It paints
// itself in as the scene opens.
function Enso({ animate, palette, urgency }: { animate: boolean; palette: Palette; urgency: number }) {
  const material = useMemo(() => ensoMaterial("#e3141b"), []);
  const halo = useMemo(() => glowTexture("rgba(227,20,27,0.22)", "rgba(227,20,27,0)"), []);
  const ring = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const painted = useRef(animate ? 0 : ENSO_END);
  useFrame(({ clock }, delta) => {
    painted.current = Math.min(ENSO_END, painted.current + delta * 0.42);
    // Ease out so the brush slows as it lifts off.
    const p = painted.current / ENSO_END;
    material.uniforms.reveal.value = ENSO_END * (1 - Math.pow(1 - p, 2.2));
    towards(material.uniforms.ink, palette.ink, animate ? 1 - Math.pow(0.3, delta) : 1);
    if (ring.current && animate) ring.current.rotation.z -= delta * (0.018 + urgency * 0.12);
    // A heartbeat in the halo as a round gets close.
    if (haloRef.current) haloRef.current.scale.setScalar(1 + (animate ? urgency * 0.14 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 5)) : 0));
  });
  return (
    <group position={[0, 9, -86]}>
      <mesh ref={haloRef} renderOrder={-1}>
        <planeGeometry args={[110, 110]} />
        <meshBasicMaterial map={halo} transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
      </mesh>
      <mesh ref={ring} material={material} rotation={[0, 0, 0.4]}>
        <planeGeometry args={[42, 42]} />
      </mesh>
    </group>
  );
}

// Ink-black ridges in layers, torn-paper edges, low in the middle so the
// ensō shows through the valley. The far layer has a thin red outline.
function ridgeShape(width: number, height: number, seed: number, valley: number) {
  const rand = seeded(seed);
  const shape = new THREE.Shape();
  const steps = 140;
  const top: THREE.Vector2[] = [];
  shape.moveTo(-width / 2, -4);
  let wobble = 0;
  for (let i = 0; i <= steps; i++) {
    const x = -width / 2 + (i / steps) * width;
    wobble = wobble * 0.6 + (rand() - 0.5) * 0.9;
    const n = Math.sin(x * 0.13 + seed) * 0.5 + Math.sin(x * 0.051 + seed * 2) * 0.8 + Math.sin(x * 0.37) * 0.2 + 1.2;
    const y = Math.max(0.15, n * height * THREE.MathUtils.smoothstep(Math.abs(x), valley * 0.4, valley * 1.6) + wobble * 0.35);
    shape.lineTo(x, y);
    top.push(new THREE.Vector2(x, y));
  }
  shape.lineTo(width / 2, -4);
  shape.lineTo(-width / 2, -4);
  return { geometry: new THREE.ShapeGeometry(shape), outline: new THREE.BufferGeometry().setFromPoints(top.map((v) => new THREE.Vector3(v.x, v.y, 0.05))) };
}
function Ridges() {
  const far = useMemo(() => ridgeShape(260, 5.5, 3, 30), []);
  const near = useMemo(() => ridgeShape(200, 3.2, 9, 22), []);
  const outline = useMemo(
    () => new THREE.Line(far.outline, new THREE.LineBasicMaterial({ color: "#e3141b", transparent: true, opacity: 0.4, fog: false })),
    [far],
  );
  return (
    <>
      <group position={[0, -1.74, -66]}>
        <mesh geometry={far.geometry}>
          <meshBasicMaterial color="#0b0709" />
        </mesh>
        <primitive object={outline} />
      </group>
      <group position={[0, -1.74, -48]}>
        <mesh geometry={near.geometry}>
          <meshBasicMaterial color="#09060a" />
        </mesh>
      </group>
    </>
  );
}

// A flat ribbon along a curve through `points`, facing the viewer, twisting
// a little along its length. u runs along the ribbon, v across it.
function ribbonGeometry(points: [number, number, number][], width: number, twist: number) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const steps = 72;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const side = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    side.crossVectors(tangent, forward).normalize().applyAxisAngle(tangent, Math.sin(t * Math.PI) * twist);
    const half = (width / 2) * (1 - t * 0.25);
    positions.push(p.x + side.x * half, p.y + side.y * half, p.z + side.z * half, p.x - side.x * half, p.y - side.y * half, p.z - side.z * half);
    uvs.push(t, 1, t, 0);
    if (i < steps) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

// Brush strokes hanging in the air like the sweeps around the logo, painted
// in one after another as the scene opens, then swaying slowly.
type Stroke = { points: [number, number, number][]; width: number; twist: number; color: string; opacity: number; delay: number };
const STROKES: Stroke[] = [
  { points: [[-34, -5, -36], [-22, 4, -32], [-12, 13, -36], [-2, 22, -40]], width: 7, twist: 0.35, color: "#c8101a", opacity: 0.78, delay: 0.5 },
  { points: [[9, -4, -26], [19, 1, -29], [29, 8, -31], [40, 15, -36]], width: 5, twist: -0.3, color: "#a80d16", opacity: 0.62, delay: 0.9 },
  { points: [[7, 17, -42], [17, 13.5, -38], [28, 15, -38], [38, 19, -42]], width: 2.2, twist: 0.2, color: "#f1ecea", opacity: 0.42, delay: 1.3 },
  { points: [[-30, 15, -44], [-20, 18, -42], [-9, 17, -44]], width: 1.6, twist: -0.2, color: "#f1ecea", opacity: 0.3, delay: 1.6 },
];
function ribbonMaterial(map: THREE.Texture, stroke: Stroke) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { map: { value: map }, color: { value: new THREE.Color(stroke.color) }, opacity: { value: stroke.opacity }, reveal: { value: 1.1 } },
    vertexShader: PLAIN_VERTEX,
    fragmentShader: `uniform sampler2D map; uniform vec3 color; uniform float opacity; uniform float reveal; varying vec2 vUv;
      void main(){
        float a = texture2D(map, vUv).a * opacity * smoothstep(reveal, reveal - 0.08, vUv.x);
        if (a < 0.01) discard;
        gl_FragColor = vec4(color, a);
        #include <colorspace_fragment>
      }`,
  });
}
function Strokes({ animate }: { animate: boolean }) {
  const brush = useTexture("/art/brush.png");
  brush.colorSpace = THREE.SRGBColorSpace;
  const items = useMemo(
    () => STROKES.map((stroke) => ({ stroke, geometry: ribbonGeometry(stroke.points, stroke.width, stroke.twist), material: ribbonMaterial(brush, stroke) })),
    [brush],
  );
  const group = useRef<THREE.Group>(null);
  const age = useRef(animate ? 0 : 99);
  useFrame(({ clock }, delta) => {
    age.current += delta;
    for (const { stroke, material } of items) {
      const p = THREE.MathUtils.clamp((age.current - stroke.delay) / 0.9, 0, 1);
      material.uniforms.reveal.value = (1 - Math.pow(1 - p, 3)) * 1.1;
    }
    if (group.current && animate) {
      const t = clock.elapsedTime;
      group.current.rotation.z = Math.sin(t * 0.12) * 0.015;
      group.current.position.y = Math.sin(t * 0.2) * 0.35;
    }
  });
  return (
    <group ref={group}>
      {items.map(({ geometry, material }, i) => (
        <mesh key={i} geometry={geometry} material={material} />
      ))}
    </group>
  );
}

// Concrete pillars down both sides, tagged with red and white paint that
// glows faintly, so they read as silhouettes with splashes on them.
const PILLARS: [number, number, number, number, number][] = [
  // x, z, width, height, depth
  [-7.5, -10, 1.5, 6.5, 1.2],
  [-11.5, -19, 2.4, 11, 1.6],
  [-17, -31, 3, 16, 2],
  [-9.5, -41, 2, 9, 1.5],
  [8, -13, 1.8, 8.5, 1.3],
  [12.5, -23, 2.6, 5.5, 2],
  [18, -35, 3.2, 17, 2],
  [10.5, -46, 2, 12, 1.5],
];
function pillarTextures(seed: number) {
  const rand = seeded(seed);
  const w = 256, h = 512;
  const base = document.createElement("canvas");
  base.width = w;
  base.height = h;
  grain(base.getContext("2d")!, rand, w, h, "#1a1719", 5000);
  const paint = document.createElement("canvas");
  paint.width = w;
  paint.height = h;
  const ctx = paint.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  swipe(ctx, rand, 10, 120 + rand() * 220, 240, 34 + rand() * 20, -0.5 + rand() * 0.3, "#e3141b");
  splat(ctx, rand, 40 + rand() * 176, 60 + rand() * 360, 14 + rand() * 18, "#e3141b", Math.floor(rand() * 2));
  if (rand() > 0.4) swipe(ctx, rand, 20, 260 + rand() * 180, 200, 12, -0.3 + rand() * 0.2, "#d9d4d2");
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = rand() > 0.5 ? "#e3141b" : "#d9d4d2";
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, 0.6 + rand() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  return { map: canvasTexture(base), paint: canvasTexture(paint) };
}
function Pillars() {
  const textures = useMemo(() => [pillarTextures(11), pillarTextures(23), pillarTextures(37)], []);
  return (
    <>
      {PILLARS.map(([x, z, w, h, d], i) => {
        const t = textures[i % textures.length];
        return (
          <mesh key={i} position={[x, -1.74 + h / 2, z]} rotation={[0, (i % 2 ? 1 : -1) * (0.15 + (i % 3) * 0.1), 0]}>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial map={t.map} emissive="#ffffff" emissiveMap={t.paint} emissiveIntensity={0.42} roughness={0.92} metalness={0} />
          </mesh>
        );
      })}
    </>
  );
}

// The floor: dark concrete splattered with paint, creeping towards the
// viewer; a long red brush stroke on it pointing at the ensō; and a pool of
// red light (plus a real light for the pillars) that follows the mouse.
function floorTexture() {
  const rand = seeded(5);
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  grain(ctx, rand, size, size, "#0b0a0a", 9000);
  // Draw each splat at its wrapped positions too, so the tile has no seams.
  const wrapped = (x: number, y: number, r: number, color: string) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      const local = seeded(Math.floor(x * 1000 + y));
      splat(ctx, local, x + ox, y + oy, r, color);
    }
  };
  for (let i = 0; i < 7; i++) wrapped(rand() * size, rand() * size, 10 + rand() * 26, `rgba(227,20,27,${0.12 + rand() * 0.22})`);
  for (let i = 0; i < 5; i++) wrapped(rand() * size, rand() * size, 3 + rand() * 8, `rgba(235,230,228,${0.1 + rand() * 0.15})`);
  const texture = canvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 12);
  return texture;
}
function Floor({ animate, urgency }: { animate: boolean; urgency: number }) {
  const texture = useMemo(floorTexture, []);
  const brush = useTexture("/art/brush.png");
  const spot = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const spotGlow = useMemo(() => glowTexture("rgba(227,20,27,0.4)", "rgba(227,20,27,0)"), []);
  useFrame((_, delta) => {
    if (animate) texture.offset.y = (texture.offset.y + delta * 0.045 * (1 + urgency * 2.5)) % 1;
    const k = 1 - Math.pow(0.02, delta);
    const x = pointer.x * 7;
    const z = 1.5 - (pointer.y + 1) * 5;
    if (spot.current) {
      spot.current.position.x = THREE.MathUtils.lerp(spot.current.position.x, x, k);
      spot.current.position.z = THREE.MathUtils.lerp(spot.current.position.z, z, k);
      const m = spot.current.material as THREE.MeshBasicMaterial;
      m.opacity = THREE.MathUtils.lerp(m.opacity, animate && pointer.active ? 0.85 : 0, k);
    }
    if (light.current) {
      light.current.position.x = THREE.MathUtils.lerp(light.current.position.x, x * 1.4, k);
      light.current.position.z = THREE.MathUtils.lerp(light.current.position.z, z - 6, k);
    }
  });
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.76, -60]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[0, -1.72, -34]}>
        <planeGeometry args={[56, 9]} />
        <meshBasicMaterial map={brush} transparent depthWrite={false} opacity={0.26} />
      </mesh>
      <mesh ref={spot} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.7, -2]}>
        <planeGeometry args={[9, 9]} />
        <meshBasicMaterial map={spotGlow} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <pointLight ref={light} position={[0, 3, -8]} color="#ff5a4a" intensity={animate ? 22 : 12} distance={30} decay={1.7} />
    </>
  );
}

// Flecks of red and white paint drifting down through the arena, each a
// slightly lumpy droplet. Moved entirely on the GPU.
function Flecks({ count, animate }: { count: number; animate: boolean }) {
  const height = useThree((state) => state.size.height);
  const dpr = useThree((state) => state.viewport.dpr);
  const { geometry, material } = useMemo(() => {
    const rand = seeded(77);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);
    const red = new THREE.Color("#e3141b");
    const white = new THREE.Color("#eeeae8");
    for (let i = 0; i < count; i++) {
      positions.set([(rand() - 0.5) * 34, rand() * 13, -2 - rand() * 30], i * 3);
      const c = rand() < 0.62 ? red : white;
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = 0.05 + Math.pow(rand(), 3) * 0.2;
      seeds[i] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { time: { value: 0 }, scale: { value: 600 } },
      vertexShader: `uniform float time; uniform float scale; attribute vec3 aColor; attribute float aSize; attribute float aSeed;
        varying vec3 vColor; varying float vSeed; varying float vFade;
        void main(){
          vec3 p = position;
          p.y = mod(p.y - time * (0.12 + aSeed * 0.3), 13.0) - 2.0;
          p.x += sin(time * 0.25 + aSeed * 40.0) * 0.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = aSize * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
          vColor = aColor; vSeed = aSeed;
          vFade = smoothstep(-2.0, -1.0, p.y) * smoothstep(11.0, 9.0, p.y);
        }`,
      fragmentShader: `varying vec3 vColor; varying float vSeed; varying float vFade; ${NOISE}
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float edge = 0.3 + noise(c * 5.0 + vSeed * 60.0) * 0.16;
          float a = (1.0 - smoothstep(edge, edge + 0.05, length(c))) * vFade * 0.85;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
          #include <colorspace_fragment>
        }`,
    });
    return { geometry: g, material: m };
  }, [count]);
  useFrame((_, delta) => {
    if (animate) material.uniforms.time.value += delta;
    material.uniforms.scale.value = height * dpr * 0.9;
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

// Where the emblem floats on each page, so moving between pages feels like
// moving through the arena. Inside the app it keeps to the edges at half
// strength so it never sits bright behind a list someone is reading; on the
// sign-in screen it hides, since the sign-in card carries the logo.
const pose = (x: number, y: number, z: number, scale: number, glow = 0.55) => ({ position: new THREE.Vector3(x, y, z), scale, glow });
const POSES: Record<string, { position: THREE.Vector3; scale: number; glow: number }> = {
  login: pose(0, 2.1, -2, 0.001, 0),
  airdrop: pose(3.5, -0.4, -3.2, 0.85),
  party: pose(-3.5, -0.35, -3.2, 0.85),
  score: pose(0, 2.3, -4.5, 0.9),
  summary: pose(-3.4, 1.3, -3.6, 0.85),
  mine: pose(3.5, 0.8, -3.4, 0.85),
  leave: pose(-3.4, 1.0, -3.4, 0.8),
  log: pose(3.2, 1.5, -3.6, 0.85),
  admin: pose(3.5, -0.6, -3.6, 0.85),
  more: pose(-3.2, -0.4, -3.2, 0.85),
};

// The 5000 logo inside its own small ensō, with a dark wash behind it so
// the white letters stand off the strokes behind.
function Emblem({ mode, animate }: { mode: string; animate: boolean }) {
  const rig = useRef<THREE.Group>(null);
  const badge = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const logoMat = useRef<THREE.MeshBasicMaterial>(null);
  const washMat = useRef<THREE.MeshBasicMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const start = POSES[mode] || POSES.airdrop;
  const glow = useRef(start.glow);
  const logo = useTexture("/art/5000.png");
  logo.colorSpace = THREE.SRGBColorSpace;
  logo.anisotropy = 8;
  const enso = useMemo(() => ensoMaterial("#e3141b"), []);
  const wash = useMemo(() => glowTexture("rgba(6,4,5,0.9)", "rgba(6,4,5,0)"), []);
  const target = useRef(new THREE.Vector3()).current;
  // A full turn whenever the page changes, easing out, and the ring repaints.
  const spin = useRef(0);
  const painted = useRef(ENSO_END);
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    if (animate) {
      spin.current += Math.PI * 2;
      painted.current = 0;
    }
  }, [mode, animate]);

  useFrame(({ clock }, delta) => {
    const t = animate ? clock.getElapsedTime() : 0;
    const pose = POSES[mode] || POSES.airdrop;
    spin.current *= Math.pow(0.04, delta);
    painted.current = Math.min(ENSO_END, painted.current + delta * 0.9);
    enso.uniforms.reveal.value = painted.current;
    // Glide between poses (frame-rate independent); a still scene snaps.
    const ease = animate ? 1 - Math.pow(0.02, delta) : 1;
    if (rig.current) {
      target.copy(pose.position);
      target.y += Math.sin(t * 1.1) * 0.06;
      rig.current.position.lerp(target, ease);
      rig.current.scale.setScalar(THREE.MathUtils.lerp(rig.current.scale.x, pose.scale, ease));
    }
    glow.current = THREE.MathUtils.lerp(glow.current, pose.glow, ease);
    const g = glow.current;
    enso.uniforms.opacity.value = g * 1.4;
    if (logoMat.current) logoMat.current.opacity = Math.min(1, g * 1.8);
    if (washMat.current) washMat.current.opacity = Math.min(1, g * 1.6);
    if (light.current) light.current.intensity = 9 * g;
    // The badge sways but keeps facing the viewer so the logo stays legible.
    if (badge.current) {
      badge.current.rotation.y = Math.sin(t * 0.45) * 0.38 + spin.current;
      badge.current.rotation.x = Math.sin(t * 0.3) * 0.08;
    }
    if (ring.current) ring.current.rotation.z = -t * 0.25;
  });

  return (
    <group ref={rig} position={start.position.toArray()} scale={start.scale}>
      <pointLight ref={light} color="#ff2a2a" intensity={9} distance={7} position={[0, 0, 1.4]} />
      <group ref={badge}>
        <mesh position={[0, 0, -0.05]}>
          <planeGeometry args={[3.4, 3.4]} />
          <meshBasicMaterial ref={washMat} map={wash} transparent depthWrite={false} />
        </mesh>
        <mesh ref={ring} material={enso}>
          <planeGeometry args={[3, 3]} />
        </mesh>
        <mesh position={[0, 0, 0.05]}>
          <planeGeometry args={[1.62, 0.93]} />
          <meshBasicMaterial ref={logoMat} map={logo} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// Camera: on the sign-in screen it first flies in from high above the arena
// (the sign-in card waits for it via <html data-flyin>); afterwards it drifts
// a little with the mouse.
const REST = new THREE.Vector3(0, 0.9, 7);
const FLY_FROM = new THREE.Vector3(0, 11, 46);
const LOOK = new THREE.Vector3(0, 1.1, -12);
function CameraRig({ animate, flyIn }: { animate: boolean; flyIn: boolean }) {
  const flight = useRef<{ start: number | null; done: boolean }>({ start: null, done: !flyIn });
  const aim = useRef(new THREE.Vector3()).current;
  const look = useRef(LOOK.clone()).current;
  useEffect(() => {
    if (!flyIn) return;
    document.documentElement.dataset.flyin = "1";
    // Never leave the sign-in card hidden, even if frames stop arriving.
    const safety = window.setTimeout(() => {
      document.documentElement.dataset.flyin = "0";
    }, 4500);
    return () => {
      window.clearTimeout(safety);
      document.documentElement.dataset.flyin = "0";
    };
  }, [flyIn]);
  useEffect(trackPointer, []);
  useFrame(({ camera, clock }, delta) => {
    const f = flight.current;
    if (!f.done) {
      if (f.start === null) f.start = clock.getElapsedTime();
      const p = Math.min(1, (clock.getElapsedTime() - f.start) / 3.2);
      const eased = 1 - Math.pow(1 - p, 3);
      camera.position.lerpVectors(FLY_FROM, REST, eased);
      look.set(0, THREE.MathUtils.lerp(-6, LOOK.y, eased), LOOK.z);
      camera.lookAt(look);
      if (p >= 1) {
        f.done = true;
        document.documentElement.dataset.flyin = "0";
      }
      return;
    }
    if (!animate) {
      camera.position.copy(REST);
      camera.lookAt(LOOK);
      return;
    }
    const ease = 1 - Math.pow(0.05, delta);
    aim.set(pointer.x * 0.6, REST.y + pointer.y * 0.25, REST.z);
    camera.position.lerp(aim, ease);
    camera.lookAt(LOOK);
  });
  return null;
}

// Draw on demand at a fixed frame rate instead of every display frame.
function Ticker({ fps }: { fps: number }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const timer = window.setInterval(() => invalidate(), 1000 / fps);
    return () => window.clearInterval(timer);
  }, [fps, invalidate]);
  return null;
}

export default function CommandScene({ tier, calm }: { tier: SceneTier; calm: boolean }) {
  // Pause entirely while the tab is in the background.
  const [tabVisible, setTabVisible] = useState(true);
  const mode = usePageMode();
  const { palette, urgency } = useArenaClock();
  const high = tier === "high";
  const animate = !calm;
  // Fly in only when the scene opens on the sign-in screen.
  const [flyIn] = useState(() => animate && (document.documentElement.dataset.sceneMode || "login") === "login");

  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Drawn on demand at 30 frames a second on every machine: the arena moves
  // slowly, and a full-screen canvas behind the whole app at the display's
  // full rate cost more than it showed.
  const frameloop = !tabVisible ? "never" : "demand";
  return (
    <div className="command-scene" aria-hidden="true">
      <Canvas
        style={{ pointerEvents: "none" }}
        dpr={high ? [1, 1.25] : [0.75, 1]}
        camera={{ position: (flyIn ? FLY_FROM : REST).toArray(), fov: 45, near: 0.1, far: 400 }}
        gl={{ alpha: false, antialias: high, powerPreference: high ? "high-performance" : "low-power" }}
        frameloop={frameloop}
        onCreated={({ gl }) => gl.setClearColor("#080607")}
      >
        <fog attach="fog" args={["#080607", 22, 140]} />
        <ambientLight intensity={0.25} />
        <hemisphereLight args={["#3a2a2c", "#000000", 0.55]} />
        {/* Red light from the ensō, catching the tops and backs of the pillars. */}
        <directionalLight position={[0, 14, -70]} color="#e3141b" intensity={1.1} />
        {!calm && tabVisible && <Ticker fps={30} />}
        <CameraRig animate={animate} flyIn={flyIn} />
        <Sky palette={palette} animate={animate} />
        <Enso animate={animate} palette={palette} urgency={urgency} />
        <Ridges />
        <Pillars />
        {/* The brush and logo textures load asynchronously. */}
        <Suspense fallback={null}>
          <Strokes animate={animate} />
          <Floor animate={animate} urgency={urgency} />
          <Emblem mode={mode} animate={animate} />
        </Suspense>
        <Flecks count={high ? 260 : 110} animate={animate} />
      </Canvas>
    </div>
  );
}
