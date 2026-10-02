"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Grid, Sparkles, useTexture } from "@react-three/drei";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";

// The 3D arena behind the whole app (desktop only; see command-scene-loader):
// a red neon floor grid running into the distance, and the 5K emblem — a dark
// metal hexagon with the logo as a hologram on its face — floating inside
// orbit rings, with embers drifting up. On the sign-in screen the emblem sits
// big and centred above the card; inside the app it glides to the right and
// steps back so it stays behind the content. The camera follows the mouse a
// little for depth. Everything here is decoration: the UI sits on dark glass
// on top of it, so text contrast doesn't depend on what the scene shows.

// "login", or the open page ("airdrop", "party", "score", ...), set by the
// page on <html data-scene-mode>.
function useSceneMode() {
  const read = () => document.documentElement.dataset.sceneMode || "app";
  const [mode, setMode] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setMode(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-scene-mode"] });
    return () => observer.disconnect();
  }, []);
  return mode;
}

// Where the emblem floats on each page, so moving between pages feels like
// moving through the arena. Inside the app it keeps to the edges, far back and
// at half glow, so it never sits bright behind a list someone is reading; only
// the sign-in screen shows it big and at full glow.
const pose = (x: number, y: number, z: number, scale: number, glow = 0.5) => ({ position: new THREE.Vector3(x, y, z), scale, glow });
const POSES: Record<string, { position: THREE.Vector3; scale: number; glow: number }> = {
  login: pose(0, 1.25, 0, 1.25, 1),
  airdrop: pose(3.4, -0.55, -3.2, 0.85),
  party: pose(-3.4, -0.45, -3.2, 0.85),
  score: pose(0, 1.95, -4, 0.95),
  mine: pose(3.4, 0.7, -3.4, 0.85),
  leave: pose(-3.3, 0.9, -3.4, 0.8),
  log: pose(3.1, 1.4, -3.6, 0.85),
  admin: pose(3.4, -0.75, -3.6, 0.85),
  more: pose(-3.1, -0.5, -3.2, 0.85),
  summary: pose(-3.3, 1.25, -3.6, 0.85),
};
// Base opacity of each glowing part, scaled by the pose's glow.
const RIM = 1, LOGO = 1, RING_A = 0.85, RING_B = 0.7, RING_C = 0.6;

function Emblem({ mode }: { mode: string }) {
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
  const glow = useRef(POSES.airdrop.glow);
  const logo = useTexture("/5k-logo.png");
  logo.colorSpace = THREE.SRGBColorSpace;
  const target = useRef(new THREE.Vector3()).current;
  // A full turn whenever the page changes, easing out.
  const spin = useRef(0);
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    spin.current += Math.PI * 2;
  }, [mode]);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const pose = POSES[mode] || POSES.airdrop;
    spin.current *= Math.pow(0.04, delta);
    // Glide between poses (frame-rate independent easing).
    const ease = 1 - Math.pow(0.02, delta);
    if (rig.current) {
      target.copy(pose.position);
      target.y += Math.sin(t * 1.1) * 0.06;
      rig.current.position.lerp(target, ease);
      const s = THREE.MathUtils.lerp(rig.current.scale.x, pose.scale, ease);
      rig.current.scale.setScalar(s);
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
    <group ref={rig} position={POSES.airdrop.position.toArray()} scale={POSES.airdrop.scale}>
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
        {/* The logo as a hologram: additive, so its black background vanishes. */}
        <mesh position={[0, 0, 0.11]}>
          <planeGeometry args={[1.32, 1.32]} />
          <meshBasicMaterial
            ref={logoMat}
            map={logo}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            color="#ffe1e5"
          />
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

// Neon grid floor that slowly runs towards the viewer.
function Floor() {
  const floor = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (floor.current) floor.current.position.z = (floor.current.position.z + delta * 0.4) % 2;
  });
  return (
    <group ref={floor} position={[0, -1.7, 0]}>
      <Grid
        infiniteGrid
        cellSize={0.5}
        sectionSize={2}
        cellThickness={0.55}
        sectionThickness={1.1}
        cellColor="#4a0910"
        sectionColor="#ff2a3d"
        fadeDistance={24}
        fadeStrength={1.7}
      />
    </group>
  );
}

// The camera drifts with the mouse for a little parallax.
function CameraRig() {
  useFrame(({ camera, pointer }, delta) => {
    const ease = 1 - Math.pow(0.05, delta);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.x * 0.45, ease);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.55 + pointer.y * 0.2, ease);
    camera.lookAt(0, 0.25, 0);
  });
  return null;
}

export default function CommandScene() {
  // Pause the render loop while the tab is backgrounded — no point spending
  // GPU/battery animating a decorative scene no one can see.
  const [tabVisible, setTabVisible] = useState(true);
  const mode = useSceneMode();

  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <div className="command-scene" aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0.55, 6.5], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        frameloop={tabVisible ? "always" : "never"}
      >
        <fog attach="fog" args={["#07080b", 6, 20]} />
        <ambientLight intensity={0.25} />
        <CameraRig />
        <Floor />
        {/* The logo texture loads asynchronously. */}
        <Suspense fallback={null}>
          <Emblem mode={mode} />
        </Suspense>
        <Sparkles count={70} scale={[14, 6, 6]} position={[0, 0.8, -1]} size={1.6} speed={0.35} noise={1.2} color="#ff4d5e" opacity={0.45} />
      </Canvas>
    </div>
  );
}
