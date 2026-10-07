"use client";

import { PerspectiveCamera, View } from "@react-three/drei";
import { Suspense } from "react";
import {
  Bars,
  CalendarBlock,
  Clipboard,
  CoinStack,
  HexBadge,
  Motion,
  ShieldBadge,
  Squad,
  SupplyDrop,
  Trophy,
  useStudioEnv,
  type Tone,
} from "./models";

// One small 3D scene drawn into the page-wide widget canvas, pinned to this
// element's box (drei <View>). The element itself is laid out by the page.
export type WidgetKind = "crate" | "badge" | "trophy" | "squad" | "calendar" | "coins" | "shield" | "clipboard" | "bars";
export type WidgetArgs = {
  done?: boolean;
  chute?: boolean;
  wide?: boolean;
  tone?: Tone;
  filled?: number;
  date?: string;
  values?: (number | null)[];
  today?: number;
};

type Shot = { position: [number, number, number]; look: [number, number, number]; fov: number };
const SHOTS: Record<Exclude<WidgetKind, "bars">, Shot> = {
  crate: { position: [0, 1.5, 7.4], look: [0, 0.75, 0], fov: 30 },
  badge: { position: [0, 0, 4.6], look: [0, 0, 0], fov: 30 },
  trophy: { position: [0, 0.7, 4.6], look: [0, 0.05, 0], fov: 30 },
  squad: { position: [0, 2.7, 4.3], look: [0, 0.05, 0], fov: 34 },
  calendar: { position: [0, 0.5, 4.6], look: [0, 0, 0], fov: 30 },
  coins: { position: [0, 1.1, 4.4], look: [0, 0.05, 0], fov: 30 },
  shield: { position: [0, 0, 4.7], look: [0, 0, 0], fov: 30 },
  clipboard: { position: [0, 0.2, 4.7], look: [0, 0, 0], fov: 30 },
};

function Stage({ kind, args, calm }: { kind: WidgetKind; args: WidgetArgs; calm: boolean }) {
  useStudioEnv();
  const shot: Shot | null =
    kind === "bars"
      ? null
      : kind === "crate" && args.chute === false
        ? { position: [0, 0.9, 4.2], look: [0, 0, 0], fov: 30 }
        : kind === "crate" && args.done
          ? { position: [0, 1.3, 5.2], look: [0, 0.55, 0], fov: 30 }
        : kind === "squad" && args.wide
          ? { position: [0, 2.2, 4.4], look: [0, -0.15, 0], fov: 34 }
          : SHOTS[kind];
  return (
    <>
      <PerspectiveCamera
        makeDefault
        fov={shot?.fov ?? 28}
        position={shot?.position ?? [0, 3, 8]}
        onUpdate={(camera) => shot && camera.lookAt(...shot.look)}
      />
      <ambientLight intensity={0.35} />
      <directionalLight position={[2.5, 4, 5]} intensity={1.8} />
      <pointLight position={[-2.5, 1, 2]} color="#ff4655" intensity={9} distance={9} decay={2} />
      {kind === "crate" && <SupplyDrop calm={calm} done={!!args.done} chute={args.chute !== false} />}
      {kind === "badge" && (
        <Motion calm={calm} tilt={0} sway={0.5} bob={0.03}>
          <Suspense fallback={null}>
            <HexBadge />
          </Suspense>
        </Motion>
      )}
      {kind === "trophy" && (
        <Motion calm={calm} turn tilt={0.05}>
          <Trophy tone={args.tone} />
        </Motion>
      )}
      {kind === "squad" && <Squad filled={args.filled ?? 0} calm={calm} />}
      {kind === "calendar" && (
        <Motion calm={calm} yaw={-0.35} tilt={0.12}>
          <CalendarBlock date={args.date || ""} />
        </Motion>
      )}
      {kind === "coins" && (
        <Motion calm={calm} tilt={0.1} sway={0.25}>
          <CoinStack calm={calm} />
        </Motion>
      )}
      {kind === "shield" && (
        <Motion calm={calm} tilt={0.05} sway={0.45}>
          <ShieldBadge />
        </Motion>
      )}
      {kind === "clipboard" && (
        <Motion calm={calm} tilt={0.1} yaw={-0.3}>
          <Clipboard />
        </Motion>
      )}
      {kind === "bars" && <Bars values={args.values || []} today={args.today ?? -1} calm={calm} />}
    </>
  );
}

export default function WidgetView({ kind, args, calm }: { kind: WidgetKind; args: WidgetArgs; calm: boolean }) {
  return (
    <View as="span" className="w3d__view">
      <Stage kind={kind} args={args} calm={calm} />
    </View>
  );
}
