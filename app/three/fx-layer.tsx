"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { onFx, sceneTier, type FxKind } from "./prefs";

// One-off 3D moments over the page, each in its own short-lived transparent
// canvas that unmounts when it ends:
//   airdrop   — a supply crate parachutes onto the mission card, lands,
//               and pops open in a beam of light with sparks.
//   celebrate — fireworks and falling confetti.
const DURATION: Record<FxKind, number> = { airdrop: 2800, celebrate: 3600 };
const easeOut = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
const clamp01 = (p: number) => Math.min(1, Math.max(0, p));

type Anchor = { x: number; y: number } | null;

export default function FxLayer() {
  const [fx, setFx] = useState<{ kind: FxKind; id: number; anchor: Anchor } | null>(null);
  useEffect(
    () =>
      onFx((kind) => {
        let anchor: Anchor = null;
        if (kind === "airdrop") {
          const card = document.querySelector(".mission");
          if (card) {
            const r = card.getBoundingClientRect();
            anchor = { x: r.left + r.width / 2, y: r.top + Math.min(r.height * 0.42, 220) };
          }
        }
        setFx({ kind, id: Date.now(), anchor });
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
  return (
    <div className="fx-layer" aria-hidden="true">
      {fx.kind === "airdrop" ? (
        <Canvas key={fx.id} orthographic camera={{ zoom: 1, position: [0, 0, 600], near: 1, far: 2000 }} dpr={low ? 1 : [1, 1.75]} gl={{ alpha: true, antialias: !low }}>
          <AirdropDrop anchor={fx.anchor} low={low} />
        </Canvas>
      ) : (
        <Canvas key={fx.id} camera={{ position: [0, 0.6, 10], fov: 50 }} dpr={low ? 1 : [1, 1.75]} gl={{ alpha: true, antialias: !low }}>
          <Fireworks low={low} />
        </Canvas>
      )}
    </div>
  );
}

// ---------- Airdrop: crate on a parachute, landing on the mission card ----------

const CANOPY_PANELS = 12;
function canopyGeometry() {
  const g = new THREE.SphereGeometry(72, 36, 10, 0, Math.PI * 2, 0, Math.PI / 2.35);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Color("#ff3d4f");
  const b = new THREE.Color("#a90f22");
  for (let i = 0; i < pos.count; i++) {
    const angle = Math.atan2(pos.getZ(i), pos.getX(i)) + Math.PI;
    const panel = Math.floor((angle / (Math.PI * 2)) * CANOPY_PANELS);
    const c = panel % 2 ? a : b;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

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
  const canopy = useMemo(canopyGeometry, []);
  // Cords from the canopy rim down to the crate's top corners.
  const cords = useMemo(() => {
    const rimY = 116 + 72 * Math.cos(Math.PI / 2.35);
    const rimR = 72 * Math.sin(Math.PI / 2.35);
    const points: number[] = [];
    const corners = [
      [-34, 36, -34],
      [34, 36, -34],
      [34, 36, 34],
      [-34, 36, 34],
    ];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const corner = corners[i % 4];
      points.push(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR, corner[0], corner[1], corner[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return g;
  }, []);
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

  const LAND = 1.15, OPEN = 1.35;
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
      chute.current.position.x = c * 70;
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
      lid.current.position.set(o * 40, 36 + easeOut(o) * 190, 0);
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
        {/* Parachute: alternating red panels with white cords. */}
        <group ref={chute}>
          <mesh geometry={canopy} position={[0, 116, 0]}>
            <meshStandardMaterial vertexColors flatShading side={THREE.DoubleSide} roughness={0.6} />
          </mesh>
          <lineSegments geometry={cords}>
            <lineBasicMaterial color="#f4f4f6" transparent opacity={0.65} />
          </lineSegments>
        </group>
        {/* The crate, turned to the same isometric angle as the site's art. */}
        <group rotation={[0.42, Math.PI / 4, 0]}>
          <RoundedBox args={[70, 58, 70]} radius={6} smoothness={3} position={[0, -6, 0]}>
            <meshStandardMaterial color="#26262d" metalness={0.55} roughness={0.45} />
          </RoundedBox>
          <mesh position={[0, -6, 0]}>
            <boxGeometry args={[12, 59, 71]} />
            <meshStandardMaterial color="#ff4655" emissive="#8f0d1d" emissiveIntensity={0.6} roughness={0.5} />
          </mesh>
          <mesh position={[0, -6, 0]}>
            <boxGeometry args={[71, 59, 12]} />
            <meshStandardMaterial color="#e3283b" emissive="#8f0d1d" emissiveIntensity={0.6} roughness={0.5} />
          </mesh>
          <group ref={lid} position={[0, 36, 0]}>
            <RoundedBox args={[76, 12, 76]} radius={4} smoothness={3}>
              <meshStandardMaterial color="#34343c" metalness={0.55} roughness={0.4} />
            </RoundedBox>
            <mesh>
              <boxGeometry args={[12, 13, 77]} />
              <meshStandardMaterial color="#ff4655" emissive="#8f0d1d" emissiveIntensity={0.6} />
            </mesh>
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
        <mesh ref={ring} position={[0, -44, -10]} rotation={[-1.2, 0, 0]} visible={false}>
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
