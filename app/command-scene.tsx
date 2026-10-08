"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, Sparkles, Stars, useTexture } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { SceneTier } from "./three/prefs";
import { pointer, trackPointer } from "./three/pointer";

// "Night Arena", the 3D world behind the whole app: a striped synthwave sun
// setting between neon wireframe mountains, a red grid floor running towards
// the viewer, stars and embers, and the 5K emblem floating in front. The UI
// sits on dark glass above it, so text contrast never depends on the scene.
//
// tier "low" (phones, small machines) draws fewer particles at lower
// resolution and 30 frames a second; calm draws one still frame.

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

// A soft round glow, drawn once into a texture (no image files to load).
function glowTexture(inner: string, outer: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// The arena follows the gang's clock (Bangkok time): a golden afternoon
// sun, the red evening of the rounds, magenta night, violet small hours.
// In the half hour before a round (17:00, 20:00, 23:00, 01:00) the grid runs
// faster and the sun pulses, as a nudge to get ready.
type Palette = { sunTop: string; sunMid: string; sunBottom: string; skyMid: string; horizon: string };
const PALETTES: Record<string, Palette> = {
  day: { sunTop: "#ffe08a", sunMid: "#ff8a3d", sunBottom: "#e0442b", skyMid: "#1a0b0c", horizon: "#5a1a12" },
  dusk: { sunTop: "#ffc27a", sunMid: "#ff4655", sunBottom: "#b80f25", skyMid: "#16050c", horizon: "#4f0b19" },
  night: { sunTop: "#ff9ab0", sunMid: "#e0245c", sunBottom: "#7a0c3a", skyMid: "#12040f", horizon: "#3d0a2a" },
  late: { sunTop: "#ffa8e0", sunMid: "#b02a8a", sunBottom: "#4a0c4a", skyMid: "#0c0512", horizon: "#2a0a2e" },
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

// Sky dome: black overhead, deep crimson towards the horizon with a thin
// glowing band right at it.
function Sky({ palette, animate }: { palette: Palette; animate: boolean }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color("#040406") },
          mid: { value: new THREE.Color("#16050c") },
          horizon: { value: new THREE.Color("#4f0b19") },
          glow: { value: new THREE.Color("#ff4655") },
        },
        vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 glow; varying vec3 vDir;
          void main(){
            float h = vDir.y;
            vec3 c = mix(horizon, mid, smoothstep(0.0, 0.1, h));
            c = mix(c, top, smoothstep(0.1, 0.55, h));
            c += glow * 0.32 * exp(-abs(h - 0.012) * 45.0);
            c = mix(c, vec3(0.018, 0.01, 0.014), smoothstep(0.0, -0.04, h));
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
    towards(material.uniforms.mid, palette.skyMid, k);
    towards(material.uniforms.horizon, palette.horizon, k);
  });
  return (
    <mesh material={material} renderOrder={-2}>
      <sphereGeometry args={[160, 32, 16]} />
    </mesh>
  );
}

// The setting sun: orange to red, its lower half cut into stripes whose gaps
// widen towards the bottom and drift slowly down.
function Sun({ animate, palette, urgency }: { animate: boolean; palette: Palette; urgency: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          topColor: { value: new THREE.Color("#ffc27a") },
          midColor: { value: new THREE.Color("#ff4655") },
          bottomColor: { value: new THREE.Color("#b80f25") },
          time: { value: 0 },
        },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: `uniform vec3 topColor; uniform vec3 midColor; uniform vec3 bottomColor; uniform float time; varying vec2 vUv;
          void main(){
            vec2 p = vUv - 0.5;
            float edge = smoothstep(0.5, 0.488, length(p));
            float t = vUv.y;
            vec3 c = mix(bottomColor, midColor, smoothstep(0.0, 0.55, t));
            c = mix(c, topColor, smoothstep(0.55, 1.0, t));
            float lower = 1.0 - smoothstep(0.5, 0.62, t);
            float band = fract(t * 10.0 + time * 0.035);
            float gap = mix(0.05, 0.6, clamp((0.58 - t) * 1.9, 0.0, 1.0));
            float cut = lower * step(band, gap);
            gl_FragColor = vec4(c * 1.05, edge * (1.0 - cut));
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  const halo = useMemo(() => glowTexture("rgba(255,70,85,0.55)", "rgba(255,70,85,0)"), []);
  const haloRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }, delta) => {
    if (animate) material.uniforms.time.value += delta * (1 + urgency * 3);
    const k = animate ? 1 - Math.pow(0.3, delta) : 1;
    towards(material.uniforms.topColor, palette.sunTop, k);
    towards(material.uniforms.midColor, palette.sunMid, k);
    towards(material.uniforms.bottomColor, palette.sunBottom, k);
    // A heartbeat in the halo as a round gets close.
    if (haloRef.current) haloRef.current.scale.setScalar(1 + (animate ? urgency * 0.12 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 5)) : 0));
  });
  return (
    <group position={[0, 12.5, -84]}>
      <mesh ref={haloRef} renderOrder={-1}>
        <planeGeometry args={[96, 96]} />
        <meshBasicMaterial map={halo} transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
      </mesh>
      <mesh material={material}>
        <planeGeometry args={[38, 38]} />
      </mesh>
    </group>
  );
}

// Neon wireframe mountains on both sides, flat in the middle so the sun shows
// through the valley.
function Mountains({ detail }: { detail: boolean }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(240, 64, detail ? 120 : 60, detail ? 32 : 16);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const valley = THREE.MathUtils.smoothstep(Math.abs(x), 9, 36);
      const back = 1 - THREE.MathUtils.smoothstep(z, -12, 30);
      const n =
        Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.5 +
        Math.sin(x * 0.07 + z * 0.11) * 0.8 +
        Math.sin(x * 0.53 + 1.3) * Math.sin(z * 0.41) * 0.25;
      pos.setY(i, Math.max(0, n + 1.15) * 6 * valley * back);
    }
    g.computeVertexNormals();
    return g;
  }, [detail]);
  return (
    <group position={[0, -1.74, -80]}>
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#07040a" polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#ff2e44" wireframe transparent opacity={0.42} fog={false} />
      </mesh>
    </group>
  );
}

// The floor: an opaque dark ground (hides the bottom of the sun below the
// horizon), the neon grid on it running towards the viewer, and the sun's
// long reflection.
function Floor({ animate, urgency }: { animate: boolean; urgency: number }) {
  const grid = useRef<THREE.Group>(null);
  // A pool of red light on the floor that follows the mouse.
  const spot = useRef<THREE.Mesh>(null);
  const spotGlow = useMemo(() => glowTexture("rgba(255,70,85,0.5)", "rgba(255,70,85,0)"), []);
  const reflection = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, "rgba(255,120,90,0.9)");
    gradient.addColorStop(0.5, "rgba(255,70,85,0.35)");
    gradient.addColorStop(1, "rgba(255,70,85,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 16, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
  useFrame((_, delta) => {
    if (animate && grid.current) grid.current.position.z = (grid.current.position.z + delta * 1.6 * (1 + urgency * 2.5)) % 4;
    if (spot.current) {
      const k = 1 - Math.pow(0.02, delta);
      spot.current.position.x = THREE.MathUtils.lerp(spot.current.position.x, pointer.x * 7, k);
      spot.current.position.z = THREE.MathUtils.lerp(spot.current.position.z, 1.5 - (pointer.y + 1) * 5, k);
      (spot.current.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.lerp(
        (spot.current.material as THREE.MeshBasicMaterial).opacity,
        animate && pointer.active ? 0.9 : 0,
        k,
      );
    }
  });
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.76, -60]}>
        <planeGeometry args={[600, 400]} />
        <meshBasicMaterial color="#050306" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.71, -44]}>
        <planeGeometry args={[18, 80]} />
        <meshBasicMaterial map={reflection} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.5} />
      </mesh>
      <mesh ref={spot} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.69, -2]}>
        <planeGeometry args={[9, 9]} />
        <meshBasicMaterial map={spotGlow} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <group ref={grid} position={[0, -1.7, 0]}>
        <Grid
          infiniteGrid
          cellSize={1}
          sectionSize={4}
          cellThickness={0.6}
          sectionThickness={1.25}
          cellColor="#3d0810"
          sectionColor="#ff2e44"
          fadeDistance={90}
          fadeStrength={1.4}
        />
      </group>
    </>
  );
}

// Where the emblem floats on each page, so moving between pages feels like
// moving through the arena. Inside the app it keeps to the edges at half glow
// so it never sits bright behind a list someone is reading; the sign-in
// screen shows it big, centred in front of the sun.
const pose = (x: number, y: number, z: number, scale: number, glow = 0.5) => ({ position: new THREE.Vector3(x, y, z), scale, glow });
const POSES: Record<string, { position: THREE.Vector3; scale: number; glow: number }> = {
  login: pose(0, 2.1, -2, 0.7, 1),
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
const RIM = 1, LOGO = 1, RING_A = 0.85, RING_B = 0.7, RING_C = 0.6;

function Emblem({ mode, animate }: { mode: string; animate: boolean }) {
  const rig = useRef<THREE.Group>(null);
  const badge = useRef<THREE.Group>(null);
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);
  const ringC = useRef<THREE.Mesh>(null);
  const rimMat = useRef<THREE.MeshBasicMaterial>(null);
  const logoMat = useRef<THREE.MeshBasicMaterial>(null);
  const ringAMat = useRef<THREE.MeshBasicMaterial>(null);
  const ringBMat = useRef<THREE.MeshBasicMaterial>(null);
  const ringCMat = useRef<THREE.MeshBasicMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const start = POSES[mode] || POSES.airdrop;
  const glow = useRef(start.glow);
  const logo = useTexture("/art/5k-chrome.png");
  logo.colorSpace = THREE.SRGBColorSpace;
  logo.anisotropy = 8;
  const target = useRef(new THREE.Vector3()).current;
  // A full turn whenever the page changes, easing out.
  const spin = useRef(0);
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    if (animate) spin.current += Math.PI * 2;
  }, [mode, animate]);

  useFrame(({ clock }, delta) => {
    const t = animate ? clock.getElapsedTime() : 0;
    const pose = POSES[mode] || POSES.airdrop;
    spin.current *= Math.pow(0.04, delta);
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
    if (rimMat.current) rimMat.current.opacity = RIM * g;
    if (logoMat.current) logoMat.current.opacity = LOGO * g;
    if (ringAMat.current) ringAMat.current.opacity = RING_A * g;
    if (ringBMat.current) ringBMat.current.opacity = RING_B * g;
    if (ringCMat.current) ringCMat.current.opacity = RING_C * g;
    if (light.current) light.current.intensity = 9 * g;
    // The badge sways but keeps facing the viewer so the logo stays legible.
    if (badge.current) {
      badge.current.rotation.y = Math.sin(t * 0.45) * 0.42 + spin.current;
      badge.current.rotation.x = Math.sin(t * 0.3) * 0.08;
    }
    if (ringA.current) ringA.current.rotation.z = t * 0.35;
    if (ringB.current) {
      ringB.current.rotation.x = Math.PI / 2.3 + Math.sin(t * 0.4) * 0.15;
      ringB.current.rotation.z = -t * 0.22;
    }
    if (ringC.current) {
      ringC.current.rotation.y = Math.PI / 3 + t * 0.18;
      ringC.current.rotation.x = Math.PI / 2.8;
    }
  });

  return (
    <group ref={rig} position={start.position.toArray()} scale={start.scale}>
      <pointLight ref={light} color="#ff2a3d" intensity={9} distance={7} position={[0, 0, 1.4]} />
      <pointLight color="#ff9aa5" intensity={2} distance={4} position={[-1, 1, 1]} />
      <group ref={badge}>
        {/* Dark metal hexagon, flat face towards the camera. */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1, 1, 0.18, 6]} />
          <meshStandardMaterial color="#14070a" metalness={0.9} roughness={0.28} emissive="#3d0009" emissiveIntensity={0.7} />
        </mesh>
        {/* Glowing hex rim (a torus with six segments is a hexagon). */}
        <mesh position={[0, 0, 0.1]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[1.02, 0.035, 8, 6]} />
          <meshBasicMaterial ref={rimMat} color="#ff2a3d" transparent toneMapped={false} />
        </mesh>
        {/* The chrome 5K logo (its own transparent ground). */}
        <mesh position={[0, 0, 0.11]}>
          <planeGeometry args={[1.62, 0.7]} />
          <meshBasicMaterial ref={logoMat} map={logo} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={ringA}>
        <torusGeometry args={[1.42, 0.02, 8, 120]} />
        <meshBasicMaterial ref={ringAMat} color="#ff4d5e" transparent opacity={RING_A} toneMapped={false} />
      </mesh>
      <mesh ref={ringB}>
        <torusGeometry args={[1.7, 0.012, 8, 120]} />
        <meshBasicMaterial ref={ringBMat} color="#ff2a3d" transparent opacity={RING_B} toneMapped={false} />
      </mesh>
      <mesh ref={ringC}>
        <torusGeometry args={[1.95, 0.008, 8, 120]} />
        <meshBasicMaterial ref={ringCMat} color="#a8303f" transparent opacity={RING_C} toneMapped={false} />
      </mesh>
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
    aim.set(pointer.x * 0.5, REST.y + pointer.y * 0.22, REST.z);
    camera.position.lerp(aim, ease);
    camera.lookAt(LOOK);
  });
  return null;
}

// Low tier: draw on demand at 30 frames a second instead of every display frame.
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

  const frameloop = !tabVisible ? "never" : calm || !high ? "demand" : "always";
  return (
    <div className="command-scene" aria-hidden="true">
      <Canvas
        style={{ pointerEvents: "none" }}
        dpr={high ? [1, 1.75] : [0.75, 1]}
        camera={{ position: (flyIn ? FLY_FROM : REST).toArray(), fov: 45, near: 0.1, far: 400 }}
        gl={{ alpha: false, antialias: high, powerPreference: high ? "high-performance" : "low-power" }}
        frameloop={frameloop}
        onCreated={({ gl }) => gl.setClearColor("#07040a")}
      >
        <fog attach="fog" args={["#07040a", 24, 150]} />
        <ambientLight intensity={0.25} />
        {!calm && !high && tabVisible && <Ticker fps={30} />}
        <CameraRig animate={animate} flyIn={flyIn} />
        <Sky palette={palette} animate={animate} />
        <Stars radius={110} depth={40} count={high ? 1800 : 600} factor={3.2} saturation={0} fade speed={animate ? 0.5 : 0} />
        <Sun animate={animate} palette={palette} urgency={urgency} />
        <Mountains detail={high} />
        <Floor animate={animate} urgency={urgency} />
        {/* The logo texture loads asynchronously. */}
        <Suspense fallback={null}>
          <Emblem mode={mode} animate={animate} />
        </Suspense>
        {animate && (
          <Sparkles
            count={high ? 90 : 36}
            scale={[18, 7, 10]}
            position={[0, 1.2, -3]}
            size={high ? 2.2 : 1.8}
            speed={0.35}
            noise={1.2}
            color="#ff6a5c"
            opacity={0.55}
          />
        )}
      </Canvas>
    </div>
  );
}
