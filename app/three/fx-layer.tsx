"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Crate, METAL, Parachute, displayFont, useStudioEnv } from "./models";
import { onFx, sceneTier, type FxKind } from "./prefs";
import { chime, pop, thud, whoosh } from "./sound";

// One-off 3D moments over the page, each in its own short-lived transparent
// canvas that unmounts when it ends:
//   airdrop   — a supply crate parachutes onto the mission card, lands,
//               and pops open in a beam of light with sparks.
//   celebrate — fireworks and falling confetti.
//   coins     — gold coins fly up from mid-screen into the month-points
//               chip, which then shows "+N".
const DURATION: Record<FxKind, number> = { airdrop: 2800, celebrate: 3600, coins: 2600 };
const easeOut = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
const clamp01 = (p: number) => Math.min(1, Math.max(0, p));

type Anchor = { x: number; y: number } | null;
const CRATE_PX = 70;

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
          <Fireworks low={low} />
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
    for (let i = 0; i < sparkCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const spread = 60 + Math.random() * 120;
      velocity.set([Math.cos(a) * spread, 260 + Math.random() * 260, Math.sin(a) * spread * 0.4], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(sparkCount * 3), 3));
    return { velocity, geometry: g };
  }, [sparkCount]);

  useStudioEnv();
  const LAND = 1.15, OPEN = 1.35;
  useEffect(() => {
    whoosh(0, LAND);
    thud(LAND);
    pop(OPEN, 1.4);
  }, []);
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
    if (ring.current) {
      const r = clamp01((t - LAND) / 0.7);
      ring.current.visible = t > LAND;
      ring.current.scale.setScalar(40 + r * 170);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - r);
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
        (sparks.current.material as THREE.PointsMaterial).opacity = 1 - clamp01(s / 1.2);
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
        <points ref={sparks} geometry={sparkData.geometry} visible={false}>
          <pointsMaterial color="#ffb08a" size={5} sizeAttenuation={false} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
        </points>
        {/* Landing ring on the card. */}
        <mesh ref={ring} position={[0, -36, -10]} rotation={[-1.2, 0, 0]} visible={false}>
          <ringGeometry args={[0.86, 1, 64]} />
          <meshBasicMaterial color="#ff4655" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}

// ---------- Celebration: fireworks and confetti ----------

const PALETTE = ["#ff4655", "#f5c542", "#ffffff", "#ff8a94", "#ffb547"];

function Fireworks({ low }: { low: boolean }) {
  const viewport = useThree((state) => state.viewport);
  const bursts = low ? 4 : 7;
  const perBurst = low ? 90 : 170;
  const total = bursts * perBurst;
  // Wall-clock time since the moment started, so a slow device skips frames
  // instead of running late past the layer closing.
  const started = useRef(performance.now());
  const sim = useMemo(() => {
    const origin = new Float32Array(total * 3);
    const velocity = new Float32Array(total * 3);
    const base = new Float32Array(total * 3);
    const start = new Float32Array(total);
    const w = Math.max(6, viewport.width * 0.42);
    for (let b = 0; b < bursts; b++) {
      const ox = (Math.random() * 2 - 1) * w;
      const oy = 0.6 + Math.random() * Math.max(2.2, viewport.height * 0.32);
      const oz = -Math.random() * 2;
      const color = new THREE.Color(PALETTE[b % PALETTE.length]);
      const t0 = b * (low ? 0.45 : 0.32);
      for (let i = 0; i < perBurst; i++) {
        const k = b * perBurst + i;
        const dir = new THREE.Vector3().randomDirection();
        const speed = 2.4 + Math.random() * 1.6;
        origin.set([ox, oy, oz], k * 3);
        velocity.set([dir.x * speed, dir.y * speed, dir.z * speed], k * 3);
        base.set([color.r, color.g, color.b], k * 3);
        start[k] = t0;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(total * 3), 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(total * 3), 3));
    return { origin, velocity, base, start, geometry };
  }, [total, bursts, perBurst, low, viewport.width, viewport.height]);

  // Confetti: little paper rectangles tumbling down.
  const confettiCount = low ? 70 : 160;
  const confetti = useRef<THREE.InstancedMesh>(null);
  const paper = useMemo(() => {
    const items = Array.from({ length: confettiCount }, () => ({
      x: (Math.random() * 2 - 1) * viewport.width * 0.55,
      y: viewport.height * 0.6 + Math.random() * viewport.height * 0.8,
      z: -Math.random() * 3,
      fall: 1.4 + Math.random() * 1.4,
      sway: Math.random() * Math.PI * 2,
      spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
    }));
    return items;
  }, [confettiCount, viewport.width, viewport.height]);
  useEffect(() => {
    const mesh = confetti.current;
    if (!mesh) return;
    const color = new THREE.Color();
    for (let i = 0; i < confettiCount; i++) mesh.setColorAt(i, color.set(PALETTE[i % PALETTE.length]));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [confettiCount]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    for (let b = 0; b < bursts; b++) pop(b * (low ? 0.45 : 0.32), 0.8 + (b % 3) * 0.25);
  }, [bursts, low]);

  useFrame(() => {
    const t = (performance.now() - started.current) / 1000;
    const pos = sim.geometry.attributes.position as THREE.BufferAttribute;
    const col = sim.geometry.attributes.color as THREE.BufferAttribute;
    const drag = 1.7;
    for (let k = 0; k < total; k++) {
      const s = t - sim.start[k];
      if (s <= 0) {
        col.setXYZ(k, 0, 0, 0);
        continue;
      }
      const spread = (1 - Math.exp(-drag * s)) / drag;
      pos.setXYZ(
        k,
        sim.origin[k * 3] + sim.velocity[k * 3] * spread,
        sim.origin[k * 3 + 1] + sim.velocity[k * 3 + 1] * spread - 0.9 * s * s,
        sim.origin[k * 3 + 2] + sim.velocity[k * 3 + 2] * spread,
      );
      // Additive blending: dimming the colour fades the spark out.
      const life = Math.max(0, 1 - s / 1.7);
      const flicker = 0.75 + 0.25 * Math.sin(k * 12.9 + t * 30);
      const f = life * life * flicker;
      col.setXYZ(k, sim.base[k * 3] * f, sim.base[k * 3 + 1] * f, sim.base[k * 3 + 2] * f);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    const mesh = confetti.current;
    if (mesh) {
      for (let i = 0; i < confettiCount; i++) {
        const p = paper[i];
        dummy.position.set(p.x + Math.sin(t * 2 + p.sway) * 0.35, p.y - p.fall * t, p.z);
        dummy.rotation.set(p.spin.x * t, p.spin.y * t, p.spin.z * t);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <ambientLight intensity={1.2} />
      <points geometry={sim.geometry}>
        <pointsMaterial vertexColors size={low ? 0.15 : 0.12} sizeAttenuation transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
      <instancedMesh ref={confetti} args={[undefined, undefined, confettiCount]}>
        <planeGeometry args={[0.22, 0.11]} />
        <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
      </instancedMesh>
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
  const count = Math.min(low ? 8 : 14, Math.max(5, amount * 2));
  const coins = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: (Math.random() * 2 - 1) * Math.min(320, size.width * 0.35),
        y: -size.height * 0.1 + (Math.random() * 2 - 1) * 90,
        arc: 60 + Math.random() * 120,
        delay: i * 0.07,
        spin: 6 + Math.random() * 6,
      })),
    [count, size.width, size.height],
  );
  const refs = useRef<(THREE.Group | null)[]>([]);
  const label = useRef<THREE.Mesh>(null);
  const started = useRef(performance.now());
  const FALL = 1;
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
  useEffect(() => {
    coins.forEach((c, i) => chime(c.delay + FALL, i % 5));
  }, [coins]);
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
