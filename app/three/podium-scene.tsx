"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { corsUrl } from "./models";
import { sceneTier } from "./prefs";

// Pillars and medals for the top three, drawn in an orthographic camera
// whose units are CSS pixels of the .podium box, so every 3D piece sits
// exactly where its hidden HTML twin is laid out.
type Spot = { order: number; rank: number; delay: number; x: number; y: number; w: number; h: number; medal: { x: number; y: number; size: number } | null; avatar: { x: number; y: number; size: number; src: string } | null };

const METAL: Record<number, { color: string; glow: string; text: string }> = {
  1: { color: "#f5c542", glow: "#ffe17a", text: "#4a3200" },
  2: { color: "#cfd6de", glow: "#ffffff", text: "#2b3036" },
  3: { color: "#db8f52", glow: "#f0a868", text: "#3d1d06" },
};
const metal = (rank: number) => METAL[rank] || METAL[3];
const DEPTH_TILT = 0.34;
// next/font gives Chakra Petch a generated family name; read it off the page.
const displayFont = () =>
  (getComputedStyle(document.documentElement).getPropertyValue("--font-chakra").trim() || '"Chakra Petch"') +
  ", system-ui, sans-serif";

function offsetWithin(el: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  if (node !== root) {
    const a = el.getBoundingClientRect();
    const b = root.getBoundingClientRect();
    return { x: a.left - b.left, y: a.top - b.top };
  }
  return { x, y };
}

function measure(root: HTMLElement): Spot[] {
  const slots = Array.from(root.querySelectorAll<HTMLElement>(".podium__slot:not(.podium__slot--empty)"));
  return slots.flatMap((slot) => {
    const base = slot.querySelector<HTMLElement>(".podium__base");
    if (!base) return [];
    const order = Number(/podium__slot--(\d)/.exec(slot.className)?.[1] || 3);
    const at = offsetWithin(base, root);
    const medalEl = slot.querySelector<Element>(".podium__medal");
    let medal: Spot["medal"] = null;
    if (medalEl) {
      // The medal may be an <svg> (no offsetLeft): place it from the slot.
      const s = offsetWithin(slot, root);
      const sr = slot.getBoundingClientRect();
      const mr = medalEl.getBoundingClientRect();
      medal = { x: s.x + mr.left - sr.left + mr.width / 2, y: s.y + mr.top - sr.top + mr.height / 2, size: Math.max(mr.width, mr.height) };
    }
    // The profile picture becomes a 3D medallion (only real images: a
    // letter placeholder stays as it is).
    const img = slot.querySelector<HTMLImageElement>("img.avatar");
    let avatar: Spot["avatar"] = null;
    if (img?.currentSrc || img?.src) {
      const s = offsetWithin(slot, root);
      const sr = slot.getBoundingClientRect();
      const ar = img.getBoundingClientRect();
      avatar = { x: s.x + ar.left - sr.left + ar.width / 2, y: s.y + ar.top - sr.top + ar.height / 2, size: ar.width, src: img.currentSrc || img.src };
    }
    return [{
      order,
      avatar,
      rank: Number(base.dataset.rank || order),
      delay: order === 2 ? 0 : order === 1 ? 0.12 : 0.24,
      x: at.x,
      y: at.y,
      w: base.offsetWidth,
      h: base.offsetHeight,
      medal,
    }];
  });
}

function numberTexture(text: string, w: number, h: number, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = Math.max(32, Math.round((256 * h) / Math.max(1, w)));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.font = `700 ${Math.min(canvas.height * 0.62, 150)}px ${displayFont()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function coinTexture(rank: number) {
  const m = metal(rank);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(46, 40, 6, 64, 64, 64);
  g.addColorStop(0, m.glow);
  g.addColorStop(0.55, m.color);
  g.addColorStop(1, m.text);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(64, 64, 50, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = m.text;
  ctx.font = `700 64px ${displayFont()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(rank), 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // The cylinder's cap faces the camera after the mesh is stood up, which
  // leaves its UVs a quarter turn off; turn the face back upright.
  tex.center.set(0.5, 0.5);
  tex.rotation = Math.PI / 2;
  return tex;
}

const easeOutBack = (p: number) => {
  const c = 1.4;
  const q = Math.min(1, Math.max(0, p)) - 1;
  return 1 + (c + 1) * q * q * q + c * q * q;
};

function Pillar({ spot, calm }: { spot: Spot; calm: boolean }) {
  const size = useThree((state) => state.size);
  const grow = useRef<THREE.Group>(null);
  // Each piece times its entrance from the first frame it is drawn.
  const born = useRef<number | null>(null);
  const m = metal(spot.rank);
  const depth = Math.min(spot.w * 0.55, 46);
  const label = useMemo(() => numberTexture(String(spot.rank), spot.w, spot.h, `${m.glow}66`), [spot.rank, spot.w, spot.h, m.glow]);
  useEffect(() => () => label.dispose(), [label]);
  useFrame((state) => {
    if (!grow.current) return;
    born.current ??= state.clock.elapsedTime;
    const p = calm ? 1 : easeOutBack((state.clock.elapsedTime - born.current - spot.delay) / 0.9);
    grow.current.scale.y = Math.max(0.001, p);
  });
  // Front face on z = 0 with its bottom edge at the base's bottom edge; the
  // whole pillar leans back so its top face shows, like the HTML version.
  return (
    <group position={[spot.x + spot.w / 2 - size.width / 2, size.height / 2 - (spot.y + spot.h), 0]} rotation={[DEPTH_TILT, 0, 0]}>
      <group ref={grow} scale={[1, calm ? 1 : 0.001, 1]}>
        <RoundedBox args={[spot.w, spot.h, depth]} radius={Math.min(8, spot.h / 4)} smoothness={4} position={[0, spot.h / 2, -depth / 2]}>
          <meshStandardMaterial color={m.color} metalness={0.85} roughness={0.3} envMapIntensity={1.1} />
        </RoundedBox>
        {/* A lit strip along the top front edge. */}
        <mesh position={[0, spot.h - 1.5, 0.6]}>
          <planeGeometry args={[spot.w - 10, 2]} />
          <meshBasicMaterial color={m.glow} toneMapped={false} transparent opacity={0.85} />
        </mesh>
        <mesh position={[0, spot.h / 2, 0.8]}>
          <planeGeometry args={[spot.w, spot.h]} />
          <meshBasicMaterial map={label} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Coin({ spot, calm }: { spot: Spot; calm: boolean }) {
  const size = useThree((state) => state.size);
  const spin = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  const medal = spot.medal!;
  const face = useMemo(() => coinTexture(spot.rank), [spot.rank]);
  useEffect(() => () => face.dispose(), [face]);
  const m = metal(spot.rank);
  const r = (medal.size / 2) * 1.25;
  useFrame((state) => {
    if (!spin.current) return;
    born.current ??= state.clock.elapsedTime;
    const t = state.clock.elapsedTime - born.current - spot.delay - 0.35;
    if (calm) {
      spin.current.rotation.y = 0.35;
      return;
    }
    // Two full turns as it arrives, then a slow sway.
    const arrive = Math.min(1, Math.max(0, t / 1.1));
    spin.current.rotation.y = (1 - (1 - arrive) ** 3) * Math.PI * 4 + Math.sin(Math.max(0, t - 1.1) * 1.3) * 0.5 * arrive;
    spin.current.scale.setScalar(Math.max(0.001, Math.min(1, arrive * 1.6)));
  });
  return (
    <group position={[medal.x - size.width / 2, size.height / 2 - medal.y, 30]}>
      <group ref={spin} scale={calm ? 1 : 0.001}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[r, r, r * 0.28, 40]} />
          <meshStandardMaterial attach="material-0" color={m.color} metalness={0.9} roughness={0.25} />
          <meshStandardMaterial attach="material-1" map={face} metalness={0.6} roughness={0.35} />
          <meshStandardMaterial attach="material-2" color={m.color} metalness={0.9} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
}

// A profile picture as a metal-rimmed disc that sways; the HTML picture is
// hidden only once the image has loaded into 3D (onReady).
function AvatarCard({ spot, calm, onReady }: { spot: Spot; calm: boolean; onReady: (order: number, ok: boolean) => void }) {
  const size = useThree((state) => state.size);
  const card = useRef<THREE.Group>(null);
  const [face, setFace] = useState<THREE.Texture | null>(null);
  const a = spot.avatar!;
  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      corsUrl(a.src),
      (texture) => {
        if (!alive) return texture.dispose();
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.center.set(0.5, 0.5);
        texture.rotation = Math.PI / 2;
        setFace(texture);
        onReady(spot.order, true);
      },
      undefined,
      () => alive && onReady(spot.order, false),
    );
    return () => {
      alive = false;
      onReady(spot.order, false);
    };
  }, [a.src, spot.order, onReady]);
  useEffect(() => () => face?.dispose(), [face]);
  useFrame(({ clock }) => {
    if (card.current) card.current.rotation.y = calm ? 0 : Math.sin(clock.elapsedTime * 0.9 + spot.order) * 0.45;
  });
  if (!face) return null;
  const r = a.size / 2;
  const m = metal(spot.rank);
  return (
    <group position={[a.x - size.width / 2, size.height / 2 - a.y, 60]}>
      <group ref={card}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[r, r, Math.max(4, r * 0.16), 48]} />
          <meshStandardMaterial attach="material-0" color={m.color} metalness={1} roughness={0.25} />
          <meshBasicMaterial attach="material-1" map={face} toneMapped={false} />
          <meshStandardMaterial attach="material-2" color={m.color} metalness={1} roughness={0.25} />
        </mesh>
        <mesh>
          <torusGeometry args={[r + 1.5, Math.max(1.6, r * 0.07), 12, 64]} />
          <meshStandardMaterial color={m.color} metalness={1} roughness={0.2} emissive={m.glow} emissiveIntensity={spot.rank === 1 ? 0.35 : 0.1} />
        </mesh>
      </group>
    </group>
  );
}

export default function PodiumScene({ calm, watch }: { calm: boolean; watch: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [visible, setVisible] = useState(true);
  const low = sceneTier() === "low";

  useEffect(() => {
    const root = host.current?.parentElement;
    if (!root) return;
    const update = () => setSpots(measure(root));
    update();
    // Fonts and the slots' own entrance animation can shift things a little.
    const late = window.setTimeout(update, 700);
    const resize = new ResizeObserver(update);
    resize.observe(root);
    const seen = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    seen.observe(root);
    document.fonts?.ready.then(update).catch(() => {});
    return () => {
      window.clearTimeout(late);
      resize.disconnect();
      seen.disconnect();
    };
  }, [watch]);

  const [faces, setFaces] = useState<Record<number, boolean>>({});
  const onFace = useCallback((order: number, ok: boolean) => setFaces((f) => (f[order] === ok ? f : { ...f, [order]: ok })), []);
  useEffect(() => {
    const root = host.current?.parentElement;
    if (!root) return;
    const names = Object.entries(faces).filter(([, ok]) => ok).map(([order]) => `podium--face-${order}`);
    root.classList.add(...names);
    return () => root.classList.remove(...names);
  }, [faces]);

  // Hide the HTML pillars and medals only once the 3D ones are drawn.
  useEffect(() => {
    const root = host.current?.parentElement;
    if (!root || !spots.length) return;
    root.classList.add("podium--3d");
    return () => root.classList.remove("podium--3d");
  }, [spots.length]);

  return (
    <div ref={host} className="podium__gl" aria-hidden="true">
      <Canvas
        style={{ pointerEvents: "none" }}
        orthographic
        camera={{ zoom: 1, position: [0, 0, 500], near: 1, far: 1200 }}
        dpr={low ? 1 : [1, 2]}
        gl={{ alpha: true, antialias: true }}
        frameloop={!visible ? "never" : calm ? "demand" : "always"}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[160, 420, 520]} intensity={1.6} />
        <Environment resolution={64}>
          <Lightformer intensity={2.2} position={[0, 4, 6]} scale={[12, 2, 1]} />
          <Lightformer intensity={1.4} color="#ff4655" position={[-6, 1, 3]} scale={[2, 8, 1]} />
          <Lightformer intensity={0.9} position={[6, 1, 3]} scale={[2, 8, 1]} />
        </Environment>
        {spots.map((spot) => (
          <group key={`${watch}-${spot.order}`}>
            <Pillar spot={spot} calm={calm} />
            {spot.medal && <Coin spot={spot} calm={calm} />}
            {spot.avatar && <AvatarCard key={spot.avatar.src} spot={spot} calm={calm} onReady={onFace} />}
          </group>
        ))}
      </Canvas>
    </div>
  );
}
