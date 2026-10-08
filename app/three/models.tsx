"use client";

import { Billboard, RoundedBox, Sparkles, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// The site's 3D props, modelled in plain units (a crate is 1 wide) so the
// same piece can sit in a 56px header icon or fall across the whole page.

export type Tone = "gold" | "silver" | "bronze" | "red" | "steel";
export const METAL: Record<Tone, string> = {
  gold: "#f5c542",
  silver: "#d5dbe2",
  bronze: "#db8f52",
  red: "#ff4655",
  steel: "#9aa0aa",
};
const RED = "#ff4655";
const RED_GLOW = "#ff2e44";
const DARK = "#26262d";

// Studio reflections for metal, made once per renderer from three's built-in
// room (nothing is fetched).
const envCache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();
export function useStudioEnv(intensity = 0.9) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    let env = envCache.get(gl);
    if (!env) {
      const pmrem = new THREE.PMREMGenerator(gl);
      env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
      envCache.set(gl, env);
    }
    scene.environment = env;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
    };
  }, [gl, scene, intensity]);
}

// next/font gives Chakra Petch a generated family name; read it off the page.
export const displayFont = () =>
  (getComputedStyle(document.documentElement).getPropertyValue("--font-chakra").trim() || '"Chakra Petch"') +
  ", system-ui, sans-serif";

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
function useDisposable<T extends { dispose: () => void }>(make: () => T, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(make, deps);
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

// Gentle idle motion shared by every prop: a short spin-in when it appears,
// then a slow sway (or a steady turn) and a little bob. Still when calm.
export function Motion({
  calm,
  turn = false,
  sway = 0.35,
  bob = 0.05,
  tilt = 0.18,
  yaw = 0,
  children,
}: {
  calm: boolean;
  turn?: boolean;
  sway?: number;
  bob?: number;
  tilt?: number;
  yaw?: number;
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    born.current ??= t;
    const intro = calm ? 1 : Math.min(1, (t - born.current) / 0.8);
    const e = 1 - (1 - intro) ** 3;
    const idle = calm ? 0 : turn ? t * 0.7 : Math.sin(t * 0.7) * sway;
    g.rotation.set(tilt, yaw + idle + (1 - e) * Math.PI * 1.5, 0);
    g.position.y = calm ? 0 : Math.sin(t * 1.4) * bob;
    g.scale.setScalar(0.55 + 0.45 * e);
  });
  return <group ref={group}>{children}</group>;
}

// ---------- Supply crate and parachute ----------

// `strap` swaps the red straps for another material (the mission crate
// tints and pulses them to show a round's status).
export function Crate({ open = 0, lidRef, strap }: { open?: number; lidRef?: Ref<THREE.Group>; strap?: THREE.Material }) {
  return (
    <group>
      <RoundedBox args={[1, 0.82, 1]} radius={0.08} smoothness={3}>
        <meshStandardMaterial color={DARK} metalness={0.6} roughness={0.42} />
      </RoundedBox>
      <mesh material={strap}>
        <boxGeometry args={[0.17, 0.84, 1.016]} />
        {!strap && <meshStandardMaterial color={RED} emissive="#8f0d1d" emissiveIntensity={0.7} roughness={0.5} />}
      </mesh>
      <mesh material={strap}>
        <boxGeometry args={[1.016, 0.84, 0.17]} />
        {!strap && <meshStandardMaterial color="#e3283b" emissive="#8f0d1d" emissiveIntensity={0.7} roughness={0.5} />}
      </mesh>
      {/* The lid hinges on its back edge. */}
      <group ref={lidRef} position={[0, 0.41, -0.54]} rotation={[-open * 1.9, 0, 0]}>
        <group position={[0, 0.085, 0.54]}>
          <RoundedBox args={[1.08, 0.17, 1.08]} radius={0.05} smoothness={3}>
            <meshStandardMaterial color="#34343c" metalness={0.6} roughness={0.38} />
          </RoundedBox>
          <mesh material={strap}>
            <boxGeometry args={[0.17, 0.18, 1.09]} />
            {!strap && <meshStandardMaterial color={RED} emissive="#8f0d1d" emissiveIntensity={0.7} />}
          </mesh>
        </group>
      </group>
    </group>
  );
}

const CANOPY_R = 1.03;
const CANOPY_Y = 1.66;
const CANOPY_ARC = Math.PI / 2.35;
export function Parachute() {
  const canopy = useDisposable(() => {
    const g = new THREE.SphereGeometry(CANOPY_R, 36, 10, 0, Math.PI * 2, 0, CANOPY_ARC);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const a = new THREE.Color("#ff3d4f");
    const b = new THREE.Color("#a90f22");
    for (let i = 0; i < pos.count; i++) {
      const angle = Math.atan2(pos.getZ(i), pos.getX(i)) + Math.PI;
      const c = Math.floor((angle / (Math.PI * 2)) * 12) % 2 ? a : b;
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  const cords = useDisposable(() => {
    const rimY = CANOPY_Y + CANOPY_R * Math.cos(CANOPY_ARC);
    const rimR = CANOPY_R * Math.sin(CANOPY_ARC);
    const corners = [
      [-0.49, 0.51, -0.49],
      [0.49, 0.51, -0.49],
      [0.49, 0.51, 0.49],
      [-0.49, 0.51, 0.49],
    ];
    const points: number[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const corner = corners[i % 4];
      points.push(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR, corner[0], corner[1], corner[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return g;
  }, []);
  return (
    <group>
      <mesh geometry={canopy} position={[0, CANOPY_Y, 0]}>
        <meshStandardMaterial vertexColors flatShading side={THREE.DoubleSide} roughness={0.6} />
      </mesh>
      <lineSegments geometry={cords}>
        <lineBasicMaterial color="#f4f4f6" transparent opacity={0.65} />
      </lineSegments>
    </group>
  );
}

// The mission card's crate, showing the selected round:
//   idle      — swinging under its parachute (nothing sent yet)
//   pending   — still hanging, straps pulsing amber (waiting for review)
//   rejected  — dropped hard and knocked askew, straps dull red
//   approved  — landed, lid cracked open
//   done      — all four rounds approved: wide open in a beam of light
export type DropState = "idle" | "pending" | "rejected" | "approved" | "done";
const STRAP: Record<DropState, { color: string; glow: string; level: number }> = {
  idle: { color: RED, glow: "#8f0d1d", level: 0.7 },
  pending: { color: "#ffb547", glow: "#ff9a1a", level: 1.2 },
  rejected: { color: "#6b1420", glow: "#2a0308", level: 0.3 },
  approved: { color: "#3ddc84", glow: "#14a352", level: 0.8 },
  done: { color: RED, glow: "#8f0d1d", level: 0.7 },
};
export function SupplyDrop({ calm, state = "idle", chute = true }: { calm: boolean; state?: DropState; chute?: boolean }) {
  const swing = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  const tone = STRAP[state];
  const strap = useDisposable(
    () => new THREE.MeshStandardMaterial({ color: tone.color, emissive: tone.glow, emissiveIntensity: tone.level, roughness: 0.5 }),
    [state],
  );
  const hanging = chute && (state === "idle" || state === "pending");
  const done = state === "done";
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (swing.current) {
      swing.current.rotation.z = calm ? 0 : hanging ? Math.sin(t * 1.3) * 0.08 : state === "rejected" ? 0.22 : 0;
    }
    if (state === "pending" && !calm) strap.emissiveIntensity = 0.6 + (0.5 + 0.5 * Math.sin(t * 4)) * 1.2;
    if (beam.current) (beam.current.material as THREE.MeshBasicMaterial).opacity = calm ? 0.3 : 0.26 + Math.sin(t * 2.4) * 0.08;
  });
  const open = done ? 1 : state === "approved" ? 0.45 : state === "rejected" ? 0.12 : 0;
  return (
    <group ref={swing} position={[0, hanging ? -0.55 : 0, 0]}>
      {hanging && <Parachute />}
      <group rotation={[0.38, Math.PI / 4, 0]}>
        <Crate open={open} strap={strap} />
      </group>
      {state === "approved" && !calm && <Sparkles count={10} scale={[0.9, 1, 0.9]} position={[0, 0.8, 0]} size={2.5} speed={0.4} color="#9dffc6" />}
      {done && (
        <>
          <mesh ref={beam} position={[0, 1.25, 0]}>
            <cylinderGeometry args={[0.85, 0.42, 1.9, 32, 1, true]} />
            <meshBasicMaterial color="#ff7a5c" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          {!calm && <Sparkles count={24} scale={[1.2, 2.4, 1.2]} position={[0, 1.4, 0]} size={3} speed={0.6} color="#ffb08a" />}
        </>
      )}
      {!hanging && (
        <mesh position={[0, -0.52, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.9, 1.02, 6]} />
          <meshBasicMaterial color={tone.color} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// ---------- 5K badge: the chrome logo floating in 3D ----------

export function HexBadge() {
  const logo = useTexture("/art/5k-chrome.png");
  logo.colorSpace = THREE.SRGBColorSpace;
  logo.anisotropy = 8;
  return (
    <mesh>
      <planeGeometry args={[3.3, 1.42]} />
      <meshBasicMaterial map={logo} transparent alphaTest={0.02} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

// ---------- Trophy ----------

const CUP = [
  [0.001, 0], [0.34, 0], [0.34, 0.05], [0.22, 0.09], [0.09, 0.16], [0.07, 0.34], [0.09, 0.44], [0.17, 0.5],
  [0.32, 0.6], [0.42, 0.8], [0.47, 1.05], [0.49, 1.24], [0.45, 1.24], [0.42, 1.05], [0.37, 0.85], [0.28, 0.7], [0.001, 0.66],
];
export function Trophy({ tone = "gold" }: { tone?: Tone }) {
  const cup = useDisposable(() => new THREE.LatheGeometry(CUP.map(([x, y]) => new THREE.Vector2(x, y)), 40), []);
  const color = METAL[tone];
  return (
    <group position={[0, -0.76, 0]}>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.62, 0.66, 0.24, 6]} />
        <meshStandardMaterial color="#141418" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.668, 0.668, 0.05, 6, 1, true]} />
        <meshBasicMaterial color={RED} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={cup} position={[0, 0.24, 0]}>
        <meshStandardMaterial color={color} metalness={1} roughness={0.18} side={THREE.DoubleSide} />
      </mesh>
      {[1, -1].map((side) => (
        <mesh key={side} position={[side * 0.43, 1.26, 0]} rotation={[0, 0, -side * (Math.PI / 2)]}>
          <torusGeometry args={[0.2, 0.045, 10, 24, Math.PI]} />
          <meshStandardMaterial color={color} metalness={1} roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

// ---------- Squad: five seats around a holo table ----------

// The page already shows these pictures as plain <img>s; the browser would
// hand a texture load that cached, non-CORS copy and refuse it. A distinct
// URL (Discord takes ?size=) makes it a fresh CORS request.
export const corsUrl = (url: string) => `${url}${url.includes("?") ? "&" : "?"}size=256`;

// An image from another site (Discord avatars allow it) as a texture, or
// null until it loads or if it can't.
export function useRemoteTexture(url?: string | null) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    let loaded: THREE.Texture | null = null;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(corsUrl(url), (t) => {
      loaded = t;
      if (!alive) return t.dispose();
      t.colorSpace = THREE.SRGBColorSpace;
      setTexture(t);
    }, undefined, () => {});
    return () => {
      alive = false;
      loaded?.dispose();
      setTexture(null);
    };
  }, [url]);
  return texture;
}

// Who sits in a seat: the team room marks the leader (gold), who is online
// (green ring) and who has sent airdrop evidence today (a check overhead).
export type SeatMember = { leader?: boolean; online?: boolean; sent?: boolean; avatar?: string | null };

function SeatFigure({ member }: { member: SeatMember }) {
  const face = useRemoteTexture(member.avatar);
  const check = useCheckGeometry(0.05);
  const body = member.leader ? METAL.gold : "#e9e9ee";
  return (
    <group position={[0, 0.2, 0]}>
      <mesh position={[0, 0.2, 0]}>
        <capsuleGeometry args={[0.1, 0.16, 4, 12]} />
        <meshStandardMaterial color={body} metalness={member.leader ? 1 : 0.2} roughness={0.3} emissive={member.leader ? "#3a2a00" : "#2a0a0e"} />
      </mesh>
      {face ? (
        // Their own picture as the head, always turned to the viewer.
        <Billboard position={[0, 0.48, 0]}>
          <mesh>
            <circleGeometry args={[0.13, 32]} />
            <meshBasicMaterial map={face} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, -0.005]}>
            <ringGeometry args={[0.13, 0.155, 32]} />
            <meshBasicMaterial color={member.leader ? METAL.gold : "#ffffff"} toneMapped={false} />
          </mesh>
        </Billboard>
      ) : (
        <mesh position={[0, 0.45, 0]}>
          <sphereGeometry args={[0.085, 16, 12]} />
          <meshStandardMaterial color={body} metalness={member.leader ? 1 : 0.2} roughness={0.3} />
        </mesh>
      )}
      {member.sent && (
        <Billboard position={[0, 0.78, 0]}>
          <mesh geometry={check} scale={0.32}>
            <meshBasicMaterial color="#3ddc84" toneMapped={false} />
          </mesh>
        </Billboard>
      )}
    </group>
  );
}

export function Squad({ filled, calm, members }: { filled: number; calm: boolean; members?: SeatMember[] }) {
  const deck = useRef<THREE.Group>(null);
  const holo = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (deck.current) deck.current.rotation.y = calm ? 0.3 : t * 0.25;
    if (holo.current) (holo.current.material as THREE.MeshBasicMaterial).opacity = calm ? 0.28 : 0.22 + Math.sin(t * 3) * 0.08;
  });
  return (
    <group ref={deck} position={[0, -0.35, 0]}>
      <mesh position={[0, -0.04, 0]}>
        <cylinderGeometry args={[1.7, 1.75, 0.08, 48]} />
        <meshStandardMaterial color="#121216" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.6, 1.66, 64]} />
        <meshBasicMaterial color={RED} toneMapped={false} />
      </mesh>
      {/* The holo table in the middle. */}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.42, 0.48, 0.24, 32]} />
        <meshStandardMaterial color={DARK} metalness={0.7} roughness={0.35} emissive="#3d0810" />
      </mesh>
      <mesh ref={holo} position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.2, 0.4, 0.75, 32, 1, true]} />
        <meshBasicMaterial color="#ff5a68" transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => {
        const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
        const on = i < filled;
        const member: SeatMember = members?.[i] ?? { leader: i === 0 };
        return (
          <group key={i} position={[Math.cos(a) * 1.15, 0, Math.sin(a) * 1.15]}>
            <mesh position={[0, 0.1, 0]}>
              <cylinderGeometry args={[0.26, 0.29, 0.2, 6]} />
              <meshStandardMaterial color="#1b1b20" metalness={0.7} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.205, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.2, 0.26, 6]} />
              <meshBasicMaterial color={on ? (member.online ? "#3ddc84" : RED) : "#3a0a12"} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
            {on && <SeatFigure member={member} />}
          </group>
        );
      })}
    </group>
  );
}

// ---------- Desk calendar showing a date ----------

export function CalendarBlock({ date }: { date: string }) {
  const face = useDisposable(
    () =>
      canvasTexture(256, 208, (ctx) => {
        // A missing or malformed date draws a blank page instead of throwing.
        const when = new Date(`${date}T00:00:00Z`);
        const valid = !Number.isNaN(when.getTime());
        const day = valid ? String(when.getUTCDate()) : "";
        const month = valid ? new Intl.DateTimeFormat("th-TH", { month: "short", timeZone: "UTC" }).format(when) : "";
        ctx.fillStyle = "#f4f4f6";
        ctx.fillRect(0, 0, 256, 208);
        ctx.fillStyle = "#1a1a1f";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `700 120px ${displayFont()}`;
        ctx.fillText(day, 128, 92);
        ctx.fillStyle = "#d4162b";
        ctx.font = `700 40px ${displayFont()}`;
        ctx.fillText(month, 128, 176);
      }),
    [date],
  );
  return (
    <group position={[0, -0.1, 0]}>
      <RoundedBox args={[1.2, 1.3, 0.4]} radius={0.06} smoothness={3}>
        <meshStandardMaterial color="#e6e6ec" roughness={0.75} />
      </RoundedBox>
      <RoundedBox args={[1.24, 0.36, 0.44]} radius={0.06} smoothness={3} position={[0, 0.6, 0]}>
        <meshStandardMaterial color="#d4162b" metalness={0.3} roughness={0.35} />
      </RoundedBox>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.8, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.11, 0.03, 10, 24]} />
          <meshStandardMaterial color="#1b1b20" metalness={0.9} roughness={0.25} />
        </mesh>
      ))}
      <mesh position={[0, -0.1, 0.205]}>
        <planeGeometry args={[1.1, 0.9]} />
        <meshBasicMaterial map={face} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---------- Coin stack (points) ----------

export function CoinStack({ calm }: { calm: boolean }) {
  const top = useRef<THREE.Group>(null);
  const face = useDisposable(
    () =>
      canvasTexture(128, 128, (ctx) => {
        const g = ctx.createRadialGradient(46, 40, 6, 64, 64, 64);
        g.addColorStop(0, "#ffe17a");
        g.addColorStop(0.6, METAL.gold);
        g.addColorStop(1, "#8a6408");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = "#4a3200";
        ctx.font = `700 54px ${displayFont()}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("5K", 64, 68);
      }),
    [],
  );
  useEffect(() => {
    face.center.set(0.5, 0.5);
    face.rotation = Math.PI / 2;
  }, [face]);
  useFrame((state) => {
    if (top.current) top.current.rotation.y = calm ? 0.3 : state.clock.elapsedTime * 1.4;
  });
  const coin = <meshStandardMaterial color={METAL.gold} metalness={1} roughness={0.22} />;
  return (
    <group position={[0, -0.75, 0]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[Math.sin(i * 2.1) * 0.04, 0.05 + i * 0.105, Math.cos(i * 1.7) * 0.04]}>
          <cylinderGeometry args={[0.5, 0.5, 0.1, 40]} />
          {coin}
        </mesh>
      ))}
      <group ref={top} position={[0, 1.15, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.42, 0.42, 0.09, 40]} />
          <meshStandardMaterial attach="material-0" color={METAL.gold} metalness={1} roughness={0.2} />
          <meshStandardMaterial attach="material-1" map={face} metalness={0.6} roughness={0.3} />
          <meshStandardMaterial attach="material-2" map={face} metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

// ---------- Shield, clipboard and their check mark ----------

function useCheckGeometry(depth: number) {
  return useDisposable(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.42, 0.04);
    s.lineTo(-0.12, -0.28);
    s.lineTo(0.42, 0.28);
    s.lineTo(0.28, 0.42);
    s.lineTo(-0.12, 0.0);
    s.lineTo(-0.28, 0.18);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
    g.center();
    return g;
  }, [depth]);
}

export function ShieldBadge() {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.95);
    s.quadraticCurveTo(0.45, 0.82, 0.8, 0.88);
    s.lineTo(0.78, 0.15);
    s.quadraticCurveTo(0.7, -0.55, 0, -0.98);
    s.quadraticCurveTo(-0.7, -0.55, -0.78, 0.15);
    s.lineTo(-0.8, 0.88);
    s.quadraticCurveTo(-0.45, 0.82, 0, 0.95);
    return s;
  }, []);
  const body = useDisposable(() => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3 });
    g.center();
    return g;
  }, [shape]);
  const inset = useDisposable(() => {
    const g = new THREE.ShapeGeometry(shape);
    g.center();
    return g;
  }, [shape]);
  const check = useCheckGeometry(0.1);
  return (
    <group>
      <mesh geometry={body}>
        <meshStandardMaterial color="#1b1b20" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh geometry={inset} position={[0, 0, 0.17]} scale={0.8}>
        <meshStandardMaterial color="#d4162b" metalness={0.4} roughness={0.35} emissive="#5a0611" />
      </mesh>
      <mesh geometry={check} position={[0, 0.02, 0.24]} scale={1.1}>
        <meshStandardMaterial color="#ffffff" emissive="#ffd6da" emissiveIntensity={0.4} roughness={0.3} />
      </mesh>
    </group>
  );
}

export function Clipboard() {
  const check = useCheckGeometry(0.08);
  return (
    <group>
      <RoundedBox args={[1.1, 1.4, 0.08]} radius={0.04} smoothness={3}>
        <meshStandardMaterial color="#1d1d22" metalness={0.5} roughness={0.45} />
      </RoundedBox>
      <RoundedBox args={[0.5, 0.18, 0.14]} radius={0.04} smoothness={3} position={[0, 0.7, 0.03]}>
        <meshStandardMaterial color="#b9bec6" metalness={1} roughness={0.25} />
      </RoundedBox>
      <mesh position={[0, -0.07, 0.045]}>
        <planeGeometry args={[0.92, 1.08]} />
        <meshStandardMaterial color="#f1f1f4" roughness={0.8} />
      </mesh>
      {[0.25, 0.05, -0.15, -0.35].map((y, i) => (
        <mesh key={y} position={[-0.08 + (i % 2) * 0.04, y, 0.05]}>
          <planeGeometry args={[0.56 - (i % 2) * 0.1, 0.06]} />
          <meshBasicMaterial color="#c4c4cc" />
        </mesh>
      ))}
      <mesh geometry={check} position={[0.32, 0.38, 0.22]} scale={0.75}>
        <meshStandardMaterial color={RED} emissive={RED_GLOW} emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---------- Points per day as a row of 3D bars ----------

// One bar per day of the month; days still to come (null) are faint stubs.
export function Bars({ values, today, calm }: { values: (number | null)[]; today: number; calm: boolean }) {
  const bars = useRef<(THREE.Group | null)[]>([]);
  const born = useRef<number | null>(null);
  const n = Math.max(1, values.length);
  const step = 0.8;
  const width = n * step;
  const max = Math.max(1, ...values.map((v) => Math.abs(v || 0)));
  // A long row gets taller bars so they still read at the row's scale.
  const tall = THREE.MathUtils.clamp(width * 0.17, 2.2, 4.6);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    born.current ??= t;
    bars.current.forEach((g, i) => {
      if (!g) return;
      const p = calm ? 1 : Math.min(1, Math.max(0, (t - born.current! - i * 0.03) / 0.6));
      g.scale.y = Math.max(0.001, 1 - (1 - p) ** 3);
    });
    // Frame the whole row whatever the box's shape.
    const cam = state.camera as THREE.PerspectiveCamera;
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const d = Math.max((width / 2 + 0.4) / (tan * (cam.aspect || 3)), (tall * 0.75) / tan);
    cam.position.set(0, d * 0.36, d);
    cam.lookAt(0, tall * 0.42, 0);
  });
  return (
    <group>
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[width + 0.5, 0.1, 1.3]} />
        <meshStandardMaterial color="#121216" metalness={0.5} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.002, 0.66]}>
        <boxGeometry args={[width + 0.5, 0.02, 0.02]} />
        <meshBasicMaterial color={RED} toneMapped={false} />
      </mesh>
      {values.map((v, i) => {
        const future = v === null;
        const h = Math.max(0.04, (Math.abs(v || 0) / max) * tall);
        const isToday = i === today;
        const minus = (v || 0) < 0;
        const glow = (Math.abs(v || 0) / max) * 0.5;
        return (
          <group key={i} position={[(i - (n - 1) / 2) * step, 0, 0]} ref={(el) => {
            bars.current[i] = el;
          }}>
            <mesh position={[0, h / 2, 0]}>
              <boxGeometry args={[0.56, h, 0.56]} />
              <meshStandardMaterial
                color={future ? "#1c1c22" : !v ? "#2a2a31" : minus ? "#5b1830" : isToday ? "#ff6b78" : "#d4162b"}
                emissive={future || !v ? "#000000" : minus ? "#3a0718" : "#c8132a"}
                emissiveIntensity={future || !v ? 0 : isToday ? 0.8 : 0.15 + glow}
                metalness={0.35}
                roughness={0.35}
              />
            </mesh>
            {isToday && (
              <mesh position={[0, h + 0.03, 0]}>
                <boxGeometry args={[0.6, 0.04, 0.6]} />
                <meshBasicMaterial color="#ffffff" toneMapped={false} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

// ---------- Trophy cabinet: each finished month's winner ----------

export type CabinetItem = { month: string; name: string; score: number };

function namePlate(item: CabinetItem) {
  return canvasTexture(384, 128, (ctx) => {
    ctx.fillStyle = "#16161b";
    ctx.fillRect(0, 0, 384, 128);
    ctx.strokeStyle = METAL.gold;
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 376, 120);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffe17a";
    ctx.font = `700 30px ${displayFont()}`;
    ctx.fillText(item.month, 192, 36);
    ctx.fillStyle = "#f4f4f6";
    ctx.font = `700 34px ${displayFont()}`;
    const name = item.name.length > 16 ? item.name.slice(0, 15) + "…" : item.name;
    ctx.fillText(name, 192, 76);
    ctx.fillStyle = "#a8a8b3";
    ctx.font = `600 22px ${displayFont()}`;
    ctx.fillText(`${item.score} แต้ม`, 192, 106);
  });
}

function CabinetSlot({ item, x, calm, index }: { item: CabinetItem; x: number; calm: boolean; index: number }) {
  const cup = useRef<THREE.Group>(null);
  const plate = useDisposable(() => namePlate(item), [item.month, item.name, item.score]);
  useFrame(({ clock }) => {
    if (cup.current) cup.current.rotation.y = calm ? 0.4 : clock.elapsedTime * 0.6 + index;
  });
  return (
    <group position={[x, 0, 0]}>
      <group ref={cup} position={[0, 0.78, 0]} scale={0.62}>
        <Trophy tone="gold" />
      </group>
      <mesh position={[0, 0.16, 0.42]} rotation={[-0.25, 0, 0]}>
        <planeGeometry args={[1.2, 0.4]} />
        <meshBasicMaterial map={plate} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Cabinet({ items, calm }: { items: CabinetItem[]; calm: boolean }) {
  const step = 1.45;
  const width = Math.max(1, items.length) * step;
  useFrame((state) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const d = Math.max((width / 2 + 0.5) / (tan * (cam.aspect || 3)), 1.25 / tan);
    cam.position.set(0, 0.95 + d * 0.12, d);
    cam.lookAt(0, 0.75, 0);
  });
  return (
    <group>
      {/* Back wall with a red light strip, and the shelf. */}
      <mesh position={[0, 1.0, -0.62]}>
        <boxGeometry args={[width + 0.6, 2.2, 0.06]} />
        <meshStandardMaterial color="#101014" metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0, 2.06, -0.58]}>
        <boxGeometry args={[width + 0.6, 0.03, 0.02]} />
        <meshBasicMaterial color={RED} toneMapped={false} />
      </mesh>
      <RoundedBox args={[width + 0.6, 0.14, 1.3]} radius={0.04} smoothness={3} position={[0, -0.07, 0]}>
        <meshStandardMaterial color="#1b1b20" metalness={0.7} roughness={0.35} />
      </RoundedBox>
      <mesh position={[0, -0.005, 0.66]}>
        <boxGeometry args={[width + 0.6, 0.02, 0.02]} />
        <meshBasicMaterial color={METAL.gold} toneMapped={false} />
      </mesh>
      {items.map((item, i) => (
        <CabinetSlot key={item.month} item={item} index={i} calm={calm} x={(i - (items.length - 1) / 2) * step} />
      ))}
    </group>
  );
}

// ---------- Achievement medals on a rack ----------

export type MedalItem = { icon: string; done: boolean };

function MedalCoin({ item, x, calm, index }: { item: MedalItem; x: number; calm: boolean; index: number }) {
  const coin = useRef<THREE.Group>(null);
  const face = useDisposable(
    () =>
      canvasTexture(128, 128, (ctx) => {
        const g = ctx.createRadialGradient(46, 40, 6, 64, 64, 64);
        g.addColorStop(0, item.done ? "#ffe17a" : "#5a5a64");
        g.addColorStop(0.6, item.done ? METAL.gold : "#34343c");
        g.addColorStop(1, item.done ? "#8a6408" : "#1b1b20");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = item.done ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.15)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(64, 64, 50, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = item.done ? "#4a3200" : "#6b6b76";
        ctx.font = `700 58px ${displayFont()}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(item.icon, 64, 68);
      }),
    [item.icon, item.done],
  );
  useEffect(() => {
    face.center.set(0.5, 0.5);
    face.rotation = Math.PI / 2;
  }, [face]);
  useFrame(({ clock }) => {
    if (coin.current) coin.current.rotation.y = calm || !item.done ? 0.25 : Math.sin(clock.elapsedTime * 1.1 + index * 0.7) * 0.6;
  });
  const metal = item.done ? METAL.gold : "#3a3a42";
  return (
    <group position={[x, 0, 0]}>
      {/* Ribbon from the rail. */}
      <mesh position={[-0.12, 0.62, 0]} rotation={[0, 0, 0.18]}>
        <boxGeometry args={[0.16, 0.62, 0.02]} />
        <meshStandardMaterial color={item.done ? RED : "#2a2a30"} roughness={0.6} />
      </mesh>
      <mesh position={[0.12, 0.62, 0]} rotation={[0, 0, -0.18]}>
        <boxGeometry args={[0.16, 0.62, 0.02]} />
        <meshStandardMaterial color={item.done ? "#c8132a" : "#24242a"} roughness={0.6} />
      </mesh>
      <group ref={coin}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.42, 0.42, 0.09, 40]} />
          <meshStandardMaterial attach="material-0" color={metal} metalness={1} roughness={0.25} />
          <meshStandardMaterial attach="material-1" map={face} metalness={0.5} roughness={0.35} />
          <meshStandardMaterial attach="material-2" color={metal} metalness={1} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
}

export function MedalRack({ items, calm }: { items: MedalItem[]; calm: boolean }) {
  const step = 1.05;
  const width = Math.max(1, items.length) * step;
  useFrame((state) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const d = Math.max((width / 2 + 0.4) / (tan * (cam.aspect || 3)), 0.95 / tan);
    cam.position.set(0, 0.25, d);
    cam.lookAt(0, 0.25, 0);
  });
  return (
    <group>
      <mesh position={[0, 0.95, -0.05]}>
        <boxGeometry args={[width + 0.4, 0.06, 0.06]} />
        <meshStandardMaterial color="#b9bec6" metalness={1} roughness={0.25} />
      </mesh>
      {items.map((item, i) => (
        <MedalCoin key={i} item={item} index={i} calm={calm} x={(i - (items.length - 1) / 2) * step} />
      ))}
    </group>
  );
}
