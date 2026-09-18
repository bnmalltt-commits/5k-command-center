"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";

function OrbitalCore() {
  const rig = useRef<any>(null);
  const core = useRef<any>(null);
  const shell = useRef<any>(null);
  const ringA = useRef<any>(null);
  const ringB = useRef<any>(null);
  const ringC = useRef<any>(null);
  const nodes = useRef<any>(null);

  useFrame(({ clock, pointer }) => {
    const t = clock.getElapsedTime();
    if (rig.current) {
      rig.current.rotation.y = pointer.x * 0.08;
      rig.current.rotation.x = pointer.y * 0.05;
      rig.current.position.y = 1.12 + Math.sin(t * 0.7) * 0.07;
    }
    if (core.current) {
      core.current.rotation.x = t * 0.38 + pointer.y * 0.12;
      core.current.rotation.y = t * 0.52 + pointer.x * 0.16;
      core.current.scale.setScalar(0.96 + Math.sin(t * 2.1) * 0.035);
    }
    if (shell.current) {
      shell.current.rotation.x = -t * 0.18;
      shell.current.rotation.y = t * 0.22;
      shell.current.rotation.z = t * 0.1;
    }
    if (ringA.current) {
      ringA.current.rotation.x = Math.PI / 2.45 + Math.sin(t * 0.45) * 0.18;
      ringA.current.rotation.z = t * 0.22;
    }
    if (ringB.current) {
      ringB.current.rotation.y = Math.PI / 3 + t * 0.2;
      ringB.current.rotation.z = -t * 0.15;
    }
    if (ringC.current) {
      ringC.current.rotation.x = Math.PI / 2 + t * 0.12;
      ringC.current.rotation.y = -t * 0.28;
    }
    if (nodes.current) {
      nodes.current.rotation.y = -t * 0.3;
      nodes.current.rotation.z = Math.sin(t * 0.5) * 0.12;
    }
  });

  return (
    <group ref={rig} position={[2.65, 1.12, -0.5]} scale={1.52}>
      <pointLight color="#ff263c" intensity={6.5} distance={6.5} />
      <pointLight
        color="#ff9aa5"
        intensity={1.5}
        distance={3.5}
        position={[-0.5, 0.4, 1]}
      />
      <ambientLight intensity={0.24} />
      <mesh ref={core}>
        <octahedronGeometry args={[0.58, 2]} />
        <meshStandardMaterial
          color="#ff344a"
          emissive="#9b001c"
          emissiveIntensity={2.2}
          metalness={0.72}
          roughness={0.2}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.31, 24, 24]} />
        <meshBasicMaterial
          color="#ffd5da"
          transparent
          opacity={0.82}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={shell} scale={1.08}>
        <icosahedronGeometry args={[0.71, 1]} />
        <meshBasicMaterial
          color="#ff6a78"
          transparent
          opacity={0.28}
          wireframe
          toneMapped={false}
        />
      </mesh>
      <group ref={ringA}>
        <mesh rotation={[Math.PI / 2.5, 0, 0]}>
          <torusGeometry args={[0.94, 0.024, 10, 96]} />
          <meshBasicMaterial
            color="#ff5361"
            transparent
            opacity={0.9}
            toneMapped={false}
          />
        </mesh>
      </group>
      <group ref={ringB}>
        <mesh rotation={[0, Math.PI / 3, 0]}>
          <torusGeometry args={[1.17, 0.012, 8, 96]} />
          <meshBasicMaterial
            color="#ff253e"
            transparent
            opacity={0.78}
            toneMapped={false}
          />
        </mesh>
      </group>
      <group ref={ringC}>
        <mesh rotation={[Math.PI / 3.2, 0.2, 0]}>
          <torusGeometry args={[1.34, 0.008, 8, 96]} />
          <meshBasicMaterial
            color="#9e3142"
            transparent
            opacity={0.7}
            toneMapped={false}
          />
        </mesh>
      </group>
      <group ref={nodes}>
        <mesh position={[1.1, 0.08, 0]} rotation={[0, 0, Math.PI / 4]}>
          <octahedronGeometry args={[0.075, 0]} />
          <meshBasicMaterial color="#ffacb4" toneMapped={false} />
        </mesh>
        <mesh position={[-0.82, 0.5, 0.1]} rotation={[0, Math.PI / 4, 0]}>
          <octahedronGeometry args={[0.045, 0]} />
          <meshBasicMaterial color="#ff6371" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

export default function CommandScene() {
  // Pause the render loop while the tab is backgrounded — no point spending
  // GPU/battery animating a decorative scene no one can see.
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <div className="command-scene" aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 6], fov: 42 }}
        gl={{ alpha: true, antialias: true }}
        frameloop={tabVisible ? "always" : "never"}
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
