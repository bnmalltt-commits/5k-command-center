"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Crate, METAL, Parachute, displayFont, useStudioEnv } from "./models";
import { onFx, sceneTier, type FxKind } from "./prefs";
import { dropletMaterial, splatTexture } from "./paint";
import { chime, pop, splash, thud, whoosh } from "./sound";

// One-off 3D moments over the page, each in its own short-lived transparent
// canvas that unmounts when it ends:
//   airdrop   — a supply crate parachutes onto the mission card, lands
//               with a splash of red paint, and pops open in a beam of
//               light with flying paint droplets.
//   celebrate — red and white paint thrown at the screen, splat after
//               splat, with droplets flying and flecks drifting down.
//   coins     — gold coins fly up from mid-screen into the month-points
//               chip, which then shows "+N".
const DURATION: Record<FxKind, number> = { airdrop: 2800, celebrate: 3600, coins: 2600 };
const easeOut = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
const clamp01 = (p: number) => Math.min(1, Math.max(0, p));

type Anchor = { x: number; y: number } | null;
const CRATE_PX = 70;

// Timings shared by the animations and their sounds.
const LAND = 1.15, OPEN = 1.35; // airdrop: crate lands, lid pops
const burstGap = (low: boolean) => (low ? 0.45 : 0.32); // seconds between splats
const burstCount = (low: boolean) => (low ? 4 : 7);
const COIN_FALL = 1; // seconds a coin takes to reach the chip
const coinCount = (amount: number, low: boolean) => Math.min(low ? 8 : 14, Math.max(5, amount * 2));
const coinDelay = (i: number) => i * 0.07;

// Sounds are scheduled the moment the event arrives, on the page side, so
// they keep time even when the 3D canvas is slow to start (it only runs its
// scene once it has been measured).
function playSound(kind: FxKind, amount: number, low: boolean) {
  if (kind === "airdrop") {
    whoosh(0, LAND);
    thud(LAND);
    splash(LAND, 0.8);
    pop(OPEN, 1.4);
  } else if (kind === "celebrate") {
    for (let b = 0; b < burstCount(low); b++) splash(b * burstGap(low), 0.8 + (b % 3) * 0.2);
  } else {
    for (let i = 0; i < coinCount(amount, low); i++) chime(coinDelay(i) + COIN_FALL, i % 5);
  }
}

function anchorOf(selector: string, place: (r: DOMRect) => { x: number; y: number }): Anchor {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width ? place(r) : null;
}

export default function FxLayer() {
  const [fx, setFx] = useState<{ kind: FxKind; id: number; anchor: Anchor; amount: number } | null>(null);
  useEffect(
    () =>
      onFx(({ kind, amount = 0 }) => {
        const anchor =
          kind === "airdrop"
            ? anchorOf(".mission", (r) => ({ x: r.left + r.width / 2, y: r.top + Math.min(r.height * 0.42, 220) }))
            : kind === "coins"
              ? anchorOf(".topbar-stat", (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))
              : null;
        playSound(kind, amount, sceneTier() === "low");
        setFx({ kind, id: Date.now(), anchor, amount });
      }),
    [],
  );
  useEffect(() => {
    if (!fx) return;
    const timer = window.setTimeout(() => setFx(null), DURATION[fx.kind]);
    return () => window.clearTimeout(timer);
  }, [fx]);
  if (!fx) return null;
  const low = sceneTier() === "low";
  const flat = { orthographic: true, camera: { zoom: 1, position: [0, 0, 600] as [number, number, number], near: 1, far: 2000 } };
  const common = { dpr: (low ? 1 : [1, 1.75]) as number | [number, number], gl: { alpha: true, antialias: !low }, style: { pointerEvents: "none" as const } };
  return (
    <div className="fx-layer" aria-hidden="true">
      {fx.kind === "airdrop" ? (
        <Canvas key={fx.id} {...flat} {...common}>
          <AirdropDrop anchor={fx.anchor} low={low} />
        </Canvas>
      ) : fx.kind === "coins" ? (
        <Canvas key={fx.id} {...flat} {...common}>
          <CoinRain anchor={fx.anchor} amount={fx.amount} low={low} />
        </Canvas>
      ) : (
        <Canvas key={fx.id} camera={{ position: [0, 0.6, 10], fov: 50 }} {...common}>
          <PaintSplash low={low} />
        </Canvas>
      )}
    </div>
  );
}

// ---------- Airdrop: crate on a parachute, landing on the mission card ----------

function AirdropDrop({ anchor, low }: { anchor: Anchor; low: boolean }) {
  const size = useThree((state) => state.size);
  const target = useMemo(
    () => (anchor ? new THREE.Vector3(anchor.x - size.width / 2, size.height / 2 - anchor.y, 0) : new THREE.Vector3(0, 0, 0)),
    [anchor, size.width, size.height],
  );
  const drop = useRef<THREE.Group>(null);
  const chute = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const sparks = useRef<THREE.Points>(null);
  // Wall-clock time since the moment started, so a slow device skips frames
  // instead of running late past the layer closing.
  const started = useRef(performance.now());
  const sparkCount = low ? 40 : 90;
  const sparkData = useMemo(() => {
    const velocity = new Float32Array(sparkCount * 3);
    const colors = new Float32Array(sparkCount * 3);
    const sizes = new Float32Array(sparkCount);
    const red = new THREE.Color("#e3141b");
    const white = new THREE.Color("#f4efec");
    for (let i = 0; i < sparkCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const spread = 60 + Math.random() * 120;
      velocity.set([Math.cos(a) * spread, 260 + Math.random() * 260, Math.sin(a) * spread * 0.4], i * 3);
      const c = Math.random() < 0.65 ? red : white;
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = 4 + Math.random() * Math.random() * 10;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(sparkCount * 3), 3));
    g.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
    g.setAttribute("aAlpha", new THREE.Float32BufferAttribute(new Float32Array(sparkCount).fill(1), 1));
    const material = dropletMaterial(true);
    material.uniforms.scale.value = 1;
    return { velocity, geometry: g, material };
  }, [sparkCount]);
  const landing = useMemo(() => splatTexture(41, "#e3141b", 2), []);
  useEffect(() => () => landing.dispose(), [landing]);

  useStudioEnv();
  useFrame(() => {
    const t = (performance.now() - started.current) / 1000;
    if (drop.current) {
      const p = easeOut(t / LAND);
      const startY = target.y + size.height / 2 + 320;
      drop.current.position.set(target.x + Math.sin(t * 3) * 18 * (1 - p), THREE.MathUtils.lerp(startY, target.y, p), 0);
      drop.current.rotation.z = Math.sin(t * 4.5) * 0.09 * (1 - p);
      // A small bounce on landing.
      const bounce = t > LAND ? Math.sin(Math.min(1, (t - LAND) / 0.25) * Math.PI) * 0.06 : 0;
      // Then it sinks into the card before the layer closes.
      const keep = Math.max(0.001, 1 - easeOut((t - 2.3) / 0.4));
      drop.current.scale.set((1 + bounce) * keep, (1 - bounce) * keep, (1 + bounce) * keep);
    }
    if (chute.current) {
      const c = clamp01((t - LAND) / 0.4);
      chute.current.scale.set(1 - c * 0.4, Math.max(0.001, 1 - c), 1 - c * 0.4);
      chute.current.position.x = c;
      chute.current.visible = c < 1;
    }
    // The paint splash where it lands: out fast, then soaks away.
    if (ring.current) {
      const r = clamp01((t - LAND) / 0.12);
      ring.current.visible = t > LAND;
      ring.current.scale.setScalar(60 + easeOut(r) * 150);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - clamp01((t - LAND - 0.7) / 0.6));
    }
    if (lid.current) {
      const o = clamp01((t - OPEN) / 0.7);
      // In crate units (the crate is drawn 70px wide), from its hinge.
      lid.current.position.set(o * 0.57, 0.41 + easeOut(o) * 2.7, -0.54);
      lid.current.rotation.set(o * 0.9, 0, -o * 1.4);
      lid.current.visible = o < 1;
    }
    if (beam.current) {
      const b = clamp01((t - OPEN) / 0.25) * (1 - clamp01((t - OPEN - 0.55) / 0.6));
      beam.current.visible = b > 0;
      (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.42 * b;
    }
    if (sparks.current) {
      const s = t - OPEN;
      sparks.current.visible = s > 0 && s < 1.2;
      if (s > 0) {
        const pos = sparkData.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < sparkCount; i++) {
          pos.setXYZ(
            i,
            sparkData.velocity[i * 3] * s,
            40 + sparkData.velocity[i * 3 + 1] * s - 420 * s * s,
            sparkData.velocity[i * 3 + 2] * s,
          );
        }
        pos.needsUpdate = true;
        const alpha = sparkData.geometry.attributes.aAlpha as THREE.BufferAttribute;
        (alpha.array as Float32Array).fill(1 - clamp01((s - 0.5) / 0.7));
        alpha.needsUpdate = true;
      }
    }
  });

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[120, 400, 300]} intensity={2.2} />
      <pointLight position={[0, 0, 160]} color="#ff4655" intensity={2.5} distance={600} decay={0} />
      <group ref={drop}>
        <group scale={CRATE_PX}>
          <group ref={chute}>
            <Parachute />
          </group>
          {/* The crate, turned to the same isometric angle as the site's art. */}
          <group rotation={[0.42, Math.PI / 4, 0]}>
            <Crate lidRef={lid} />
          </group>
        </group>
        {/* The light pouring out of the open crate. */}
        <mesh ref={beam} position={[0, 190, 0]} visible={false}>
          <cylinderGeometry args={[70, 30, 300, 32, 1, true]} />
          <meshBasicMaterial color="#ff7a5c" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <points ref={sparks} geometry={sparkData.geometry} material={sparkData.material} visible={false} frustumCulled={false} />
        {/* Paint splashed on the card where it lands, behind the crate. */}
        <mesh ref={ring} position={[0, -30, -200]} rotation={[0, 0, 0.5]} visible={false}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={landing} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </>
  );
}

// ---------- Celebration: paint thrown at the screen ----------

const PAINT = ["#e3141b", "#f4efec", "#c40f17", "#e3141b", "#ffffff", "#9e0c12", "#e3141b"];

function PaintSplash({ low }: { low: boolean }) {
  const viewport = useThree((state) => state.viewport);
  const height = useThree((state) => state.size.height);
  const dpr = useThree((state) => state.viewport.dpr);
  const bursts = burstCount(low);
  const perBurst = low ? 36 : 70;
  const flecks = low ? 50 : 120;
  const total = bursts * perBurst + flecks;
  // Wall-clock time since the moment started, so a slow device skips frames
  // instead of running late past the layer closing.
  const started = useRef(performance.now());
  const sim = useMemo(() => {
    const w = Math.max(3, viewport.width * 0.36);
    const splats = Array.from({ length: bursts }, (_, b) => ({
      x: (Math.random() * 2 - 1) * w,
      y: (Math.random() * 2 - 1) * viewport.height * 0.3 + 0.4,
      z: -Math.random() * 1.5,
      size: 2.4 + Math.random() * 1.8,
      turn: Math.random() * Math.PI * 2,
      color: PAINT[b % PAINT.length],
      t0: b * burstGap(low),
      texture: splatTexture(101 + b * 7 + Math.floor(Math.random() * 1000), PAINT[b % PAINT.length], 3),
    }));
    const origin = new Float32Array(total * 3);
    const velocity = new Float32Array(total * 3);
    const start = new Float32Array(total);
    const colors = new Float32Array(total * 3);
    const sizes = new Float32Array(total);
    const c = new THREE.Color();
    splats.forEach((sp, b) => {
      c.set(sp.color);
      for (let i = 0; i < perBurst; i++) {
        const k = b * perBurst + i;
        const a = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 5;
        origin.set([sp.x, sp.y, sp.z + 0.1], k * 3);
        velocity.set([Math.cos(a) * speed, Math.sin(a) * speed + 1.2, (Math.random() - 0.5) * 2], k * 3);
        colors.set([c.r, c.g, c.b], k * 3);
        sizes[k] = 0.05 + Math.pow(Math.random(), 2.5) * 0.3;
        start[k] = sp.t0;
      }
    });
    // Flecks drifting down from the top the whole time; their "velocity" is
    // (sway phase, fall speed).
    for (let i = bursts * perBurst; i < total; i++) {
      c.set(PAINT[i % PAINT.length]);
      origin.set([(Math.random() * 2 - 1) * viewport.width * 0.55, viewport.height * 0.55 + Math.random() * viewport.height * 0.7, -Math.random() * 3], i * 3);
      velocity.set([Math.random() * Math.PI * 2, 1.3 + Math.random() * 1.4, 0], i * 3);
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = 0.05 + Math.random() * 0.09;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(total * 3), 3));
    geometry.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute("aAlpha", new THREE.Float32BufferAttribute(new Float32Array(total), 1));
    return { splats, origin, velocity, start, geometry, material: dropletMaterial() };
  }, [total, bursts, perBurst, low, viewport.width, viewport.height]);
  useEffect(() => () => sim.splats.forEach((sp) => sp.texture.dispose()), [sim]);
  const decals = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const t = (performance.now() - started.current) / 1000;
    // Camera fov is 50°: pixels per world unit at distance 1.
    sim.material.uniforms.scale.value = (height * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(25)));
    sim.splats.forEach((sp, b) => {
      const m = decals.current[b];
      if (!m) return;
      const s = t - sp.t0;
      m.visible = s > 0;
      if (s <= 0) return;
      // Hits hard, then slides down a little and fades.
      const hit = easeOut(s / 0.1);
      m.scale.set(sp.size * hit, sp.size * hit * (1 + Math.min(0.25, s * 0.15)), 1);
      m.position.set(sp.x, sp.y - Math.min(0.5, s * 0.25), sp.z);
      (m.material as THREE.MeshBasicMaterial).opacity = 1 - clamp01((s - 0.9) / 0.7);
    });
    const pos = sim.geometry.attributes.position as THREE.BufferAttribute;
    const alpha = sim.geometry.attributes.aAlpha as THREE.BufferAttribute;
    const drag = 3;
    const thrown = bursts * perBurst;
    for (let k = 0; k < total; k++) {
      if (k >= thrown) {
        pos.setXYZ(
          k,
          sim.origin[k * 3] + Math.sin(t * 2 + sim.velocity[k * 3]) * 0.25,
          sim.origin[k * 3 + 1] - sim.velocity[k * 3 + 1] * t,
          sim.origin[k * 3 + 2],
        );
        alpha.setX(k, 0.9 * (1 - clamp01((t - 2.8) / 0.7)));
        continue;
      }
      const s = t - sim.start[k];
      if (s <= 0) {
        alpha.setX(k, 0);
        continue;
      }
      const spread = (1 - Math.exp(-drag * s)) / drag;
      pos.setXYZ(
        k,
        sim.origin[k * 3] + sim.velocity[k * 3] * spread,
        sim.origin[k * 3 + 1] + sim.velocity[k * 3 + 1] * spread - 2.2 * s * s,
        sim.origin[k * 3 + 2] + sim.velocity[k * 3 + 2] * spread,
      );
      alpha.setX(k, 1 - clamp01((s - 0.8) / 0.6));
    }
    pos.needsUpdate = true;
    alpha.needsUpdate = true;
  });

  return (
    <>
      {sim.splats.map((sp, b) => (
        <mesh key={b} ref={(el) => { decals.current[b] = el; }} rotation={[0, 0, sp.turn]} visible={false}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={sp.texture} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <points geometry={sim.geometry} material={sim.material} frustumCulled={false} />
    </>
  );
}

// ---------- Coins: points just gained, collected into the points chip ----------

function CoinRain({ anchor, amount, low }: { anchor: Anchor; amount: number; low: boolean }) {
  const size = useThree((state) => state.size);
  const target = useMemo(
    () => (anchor ? { x: anchor.x - size.width / 2, y: size.height / 2 - anchor.y } : { x: size.width / 2 - 120, y: size.height / 2 - 60 }),
    [anchor, size.width, size.height],
  );
  const count = coinCount(amount, low);
  const coins = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: (Math.random() * 2 - 1) * Math.min(320, size.width * 0.35),
        y: -size.height * 0.1 + (Math.random() * 2 - 1) * 90,
        arc: 60 + Math.random() * 120,
        delay: coinDelay(i),
        spin: 6 + Math.random() * 6,
      })),
    [count, size.width, size.height],
  );
  const refs = useRef<(THREE.Group | null)[]>([]);
  const label = useRef<THREE.Mesh>(null);
  const started = useRef(performance.now());
  const FALL = COIN_FALL;
  const text = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const c = canvas.getContext("2d")!;
    c.font = `700 84px ${displayFont()}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineWidth = 10;
    c.strokeStyle = "rgba(20,10,0,0.85)";
    c.strokeText(`+${amount}`, 128, 66);
    c.fillStyle = "#ffe17a";
    c.fillText(`+${amount}`, 128, 66);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [amount]);
  useEffect(() => () => text.dispose(), [text]);
  useStudioEnv();
  useFrame(() => {
    const t = (performance.now() - started.current) / 1000;
    refs.current.forEach((g, i) => {
      if (!g) return;
      const c = coins[i];
      const p = clamp01((t - c.delay) / FALL);
      g.visible = p > 0 && p < 1;
      // Pop out, then swoop into the chip along an arc.
      const e = p * p * (3 - 2 * p);
      g.position.set(
        THREE.MathUtils.lerp(c.x, target.x, e),
        THREE.MathUtils.lerp(c.y, target.y, e) + Math.sin(Math.PI * p) * c.arc,
        0,
      );
      g.rotation.set(0.4, t * c.spin, 0);
      g.scale.setScalar(1 - Math.max(0, p - 0.8) * 3);
    });
    if (label.current) {
      const l = clamp01((t - FALL) / 1.2);
      label.current.visible = t > FALL * 0.8;
      label.current.position.set(target.x, target.y + 34 + easeOut(l) * 40, 10);
      (label.current.material as THREE.MeshBasicMaterial).opacity = 1 - clamp01((l - 0.6) / 0.4);
    }
  });
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[100, 300, 400]} intensity={2} />
      {coins.map((_, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }} visible={false}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[15, 15, 4, 32]} />
            {/* A little glow of its own, so a coin never reads as a dark disc. */}
            <meshStandardMaterial color={METAL.gold} metalness={0.85} roughness={0.25} emissive="#8a5a00" emissiveIntensity={0.7} />
          </mesh>
        </group>
      ))}
      {amount > 0 && (
        <mesh ref={label} visible={false}>
          <planeGeometry args={[128, 64]} />
          <meshBasicMaterial map={text} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </>
  );
}
