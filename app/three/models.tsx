"use client";

import { RoundedBox, Sparkles, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode, type Ref } from "react";
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

export function Crate({ open = 0, lidRef }: { open?: number; lidRef?: Ref<THREE.Group> }) {
  return (
    <group>
      <RoundedBox args={[1, 0.82, 1]} radius={0.08} smoothness={3}>
        <meshStandardMaterial color={DARK} metalness={0.6} roughness={0.42} />
      </RoundedBox>
      <mesh>
        <boxGeometry args={[0.17, 0.84, 1.016]} />
        <meshStandardMaterial color={RED} emissive="#8f0d1d" emissiveIntensity={0.7} roughness={0.5} />
      </mesh>
      <mesh>
        <boxGeometry args={[1.016, 0.84, 0.17]} />
        <meshStandardMaterial color="#e3283b" emissive="#8f0d1d" emissiveIntensity={0.7} roughness={0.5} />
      </mesh>
      {/* The lid hinges on its back edge. */}
      <group ref={lidRef} position={[0, 0.41, -0.54]} rotation={[-open * 1.9, 0, 0]}>
        <group position={[0, 0.085, 0.54]}>
          <RoundedBox args={[1.08, 0.17, 1.08]} radius={0.05} smoothness={3}>
            <meshStandardMaterial color="#34343c" metalness={0.6} roughness={0.38} />
          </RoundedBox>
          <mesh>
            <boxGeometry args={[0.17, 0.18, 1.09]} />
            <meshStandardMaterial color={RED} emissive="#8f0d1d" emissiveIntensity={0.7} />
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

// The mission card's crate: swinging under its parachute while rounds are
// left, landed and open in a beam of light once all four are approved.
export function SupplyDrop({ calm, done, chute = true }: { calm: boolean; done: boolean; chute?: boolean }) {
  const swing = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (swing.current) swing.current.rotation.z = calm || done ? 0 : Math.sin(t * 1.3) * 0.08;
    if (beam.current) (beam.current.material as THREE.MeshBasicMaterial).opacity = calm ? 0.3 : 0.26 + Math.sin(t * 2.4) * 0.08;
  });
  return (
    <group ref={swing} position={[0, done || !chute ? 0 : -0.55, 0]}>
      {chute && !done && <Parachute />}
      <group rotation={[0.38, Math.PI / 4, 0]}>
        <Crate open={done ? 1 : 0} />
      </group>
      {done && (
        <>
          <mesh ref={beam} position={[0, 1.25, 0]}>
            <cylinderGeometry args={[0.85, 0.42, 1.9, 32, 1, true]} />
            <meshBasicMaterial color="#ff7a5c" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          {!calm && <Sparkles count={24} scale={[1.2, 2.4, 1.2]} position={[0, 1.4, 0]} size={3} speed={0.6} color="#ffb08a" />}
          <mesh position={[0, -0.52, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.9, 1.02, 6]} />
            <meshBasicMaterial color={RED} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
    </group>
  );
}

// ---------- 5K badge ----------

export function HexBadge() {
  const logo = useTexture("/5k-logo.png");
  logo.colorSpace = THREE.SRGBColorSpace;
  return (
    <group>
      {/* No dark face: just the glowing rim with the mark floating inside. */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 0.16, 6, 1, true]} />
        <meshStandardMaterial color={RED} emissive={RED_GLOW} emissiveIntensity={1.6} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.135]}>
        <planeGeometry args={[1.7, 1.7]} />
        {/* The logo image has a black ground: add it as light so only the mark shows. */}
        <meshBasicMaterial map={logo} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
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

export function Squad({ filled, calm }: { filled: number; calm: boolean }) {
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
        const leader = on && i === 0;
        return (
          <group key={i} position={[Math.cos(a) * 1.15, 0, Math.sin(a) * 1.15]}>
            <mesh position={[0, 0.1, 0]}>
              <cylinderGeometry args={[0.26, 0.29, 0.2, 6]} />
              <meshStandardMaterial color="#1b1b20" metalness={0.7} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.205, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.2, 0.26, 6]} />
              <meshBasicMaterial color={on ? RED : "#3a0a12"} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
            {on && (
              <group position={[0, 0.2, 0]}>
                <mesh position={[0, 0.2, 0]}>
                  <capsuleGeometry args={[0.1, 0.16, 4, 12]} />
                  <meshStandardMaterial color={leader ? METAL.gold : "#e9e9ee"} metalness={leader ? 1 : 0.2} roughness={0.3} emissive={leader ? "#3a2a00" : "#2a0a0e"} />
                </mesh>
                <mesh position={[0, 0.45, 0]}>
                  <sphereGeometry args={[0.085, 16, 12]} />
                  <meshStandardMaterial color={leader ? METAL.gold : "#e9e9ee"} metalness={leader ? 1 : 0.2} roughness={0.3} />
                </mesh>
              </group>
            )}
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
