"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import { useRef } from "react";

function OrbitalCore() {
  const core = useRef<any>(null);
  const ring = useRef<any>(null);

  useFrame(({ clock, pointer }) => {
    const t = clock.getElapsedTime();
    if (core.current) {
      core.current.rotation.x = t * 0.22 + pointer.y * 0.12;
      core.current.rotation.y = t * 0.34 + pointer.x * 0.16;
    }
    if (ring.current) {
      ring.current.rotation.x = Math.sin(t * 0.35) * 0.28;
      ring.current.rotation.y = t * 0.16;
      ring.current.rotation.z = t * 0.08;
    }
  });

  return (
    <group position={[2.75, 1.15, -0.5]} scale={1.42}>
      <pointLight color="#ff263c" intensity={9} distance={7} />
      <ambientLight intensity={0.28} />
      <mesh ref={core}>
        <icosahedronGeometry args={[0.7, 1]} />
        <meshStandardMaterial
          color="#ff3345"
          emissive="#870016"
          emissiveIntensity={1.8}
          metalness={0.75}
          roughness={0.22}
          wireframe
        />
      </mesh>
      <group ref={ring}>
        <mesh rotation={[Math.PI / 2.5, 0, 0]}>
          <torusGeometry args={[1.02, 0.018, 12, 96]} />
          <meshBasicMaterial color="#ff5361" transparent opacity={0.9} />
        </mesh>
        <mesh rotation={[0, Math.PI / 3, 0]}>
          <torusGeometry args={[1.22, 0.009, 8, 96]} />
          <meshBasicMaterial color="#9b2535" transparent opacity={0.75} />
        </mesh>
      </group>
      <mesh position={[0.96, 0.45, 0.1]}>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshBasicMaterial color="#fda4af" />
      </mesh>
    </group>
  );
}

export default function CommandScene() {
  return (
    <div className="command-scene" aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 6], fov: 42 }}
        gl={{ alpha: true, antialias: true }}
      >
        <fog attach="fog" args={["#07080b", 4, 11]} />
        <OrbitalCore />
        <Sparkles
          count={42}
          scale={[9, 5, 3]}
          size={1.1}
          speed={0.18}
          color="#ef4444"
          opacity={0.34}
        />
      </Canvas>
    </div>
  );
}
