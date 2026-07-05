'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const MODEL_URL = '/models/beetle.glb';

const SPIN_SPEED = 0.22; // rad/s — a slow, continuous "turntable" idle, not a fidgety oscillation
const LEAN_MAX_X = 0.09;
const LEAN_MAX_Z = 0.14;
const LEAN_DAMP = 5;

const HOP_ANTICIPATION = 0.1;
const HOP_AIR = 0.36;
const HOP_SETTLE = 0.24;
const HOP_TOTAL = HOP_ANTICIPATION + HOP_AIR + HOP_SETTLE;
const HOP_HEIGHT = 0.38;
const HOP_DISTANCE = 0.4;
const HOP_YAW_KICK = 0.95;

function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

interface Hop {
  startedAt: number;
  dirX: number;
  dirZ: number;
  yawSign: number;
}

// "Beetle" by Poly by Google (poly.pizza/m/4yufxgZ1QQ2), CC-BY 3.0 — recolored
// to the brand's terracotta so it reads as the Weevil mascot rather than a
// generic bug. Credit lives in the marketing footer per the license terms.
function WeevilModel({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const { pointer } = useThree();
  const { scene } = useGLTF(MODEL_URL);
  const [hop, setHop] = useState<Hop | null>(null);

  // useFrame's `state.clock.elapsedTime` and `performance.now()` are
  // different clocks with an unpredictable offset (this scene mounts async,
  // well after navigation start) — mixing them was the actual cause of the
  // erratic hover behavior, not just the easing choice. Event handlers read
  // this ref instead of touching performance.now(), so triggers always
  // compare against the same clock useFrame animates with.
  const clockNow = useRef(0);
  const spin = useRef(Math.random() * Math.PI * 2);
  const lean = useRef({ x: 0, z: 0 });

  const model = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.material = new THREE.MeshStandardMaterial({
          color: '#c1501f',
          roughness: 0.5,
          metalness: 0.06,
        });
      }
    });
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 1.7 / Math.max(size.x, size.y, size.z);
    cloned.scale.setScalar(scale);
    cloned.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    const groundY = -(size.y * scale) / 2;
    return { object: cloned, groundY };
  }, [scene]);

  function startHop() {
    setHop((current) => {
      if (current) return current;
      // Hop away from whichever side the cursor is on — the reaction reads
      // as "startled by the pointer", not a random twitch.
      const dirX = pointer.x >= 0 ? -1 : 1;
      return { startedAt: clockNow.current, dirX, dirZ: dirX * 0.35, yawSign: dirX };
    });
  }

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    clockNow.current = state.clock.elapsedTime;

    if (reducedMotion) {
      g.rotation.y = 0.6;
      return;
    }

    spin.current += delta * SPIN_SPEED;

    const targetLeanZ = THREE.MathUtils.clamp(pointer.x, -1, 1) * LEAN_MAX_Z;
    const targetLeanX = THREE.MathUtils.clamp(-pointer.y, -1, 1) * LEAN_MAX_X;
    lean.current.z = THREE.MathUtils.damp(lean.current.z, targetLeanZ, LEAN_DAMP, delta);
    lean.current.x = THREE.MathUtils.damp(lean.current.x, targetLeanX, LEAN_DAMP, delta);

    let extraYaw = 0;
    let hopX = 0;
    let hopZ = 0;
    let hopY = 0;
    let scaleY = 1;
    let scaleXZ = 1;

    if (hop) {
      const elapsed = clockNow.current - hop.startedAt;
      if (elapsed < HOP_ANTICIPATION) {
        // Coil: a quick squash before takeoff (anticipation).
        const p = elapsed / HOP_ANTICIPATION;
        scaleY = THREE.MathUtils.lerp(1, 0.8, p);
        scaleXZ = THREE.MathUtils.lerp(1, 1.1, p);
      } else if (elapsed < HOP_ANTICIPATION + HOP_AIR) {
        const p = (elapsed - HOP_ANTICIPATION) / HOP_AIR;
        const arc = Math.sin(p * Math.PI);
        hopY = arc * HOP_HEIGHT;
        hopX = hop.dirX * arc * HOP_DISTANCE;
        hopZ = hop.dirZ * arc * HOP_DISTANCE;
        extraYaw = hop.yawSign * arc * HOP_YAW_KICK;
        // Stretch on the way up, ease back near the apex, squash again for landing.
        if (p < 0.35) {
          scaleY = THREE.MathUtils.lerp(0.8, 1.2, p / 0.35);
          scaleXZ = THREE.MathUtils.lerp(1.1, 0.92, p / 0.35);
        } else if (p < 0.7) {
          scaleY = THREE.MathUtils.lerp(1.2, 1, (p - 0.35) / 0.35);
          scaleXZ = THREE.MathUtils.lerp(0.92, 1, (p - 0.35) / 0.35);
        } else {
          scaleY = THREE.MathUtils.lerp(1, 0.85, (p - 0.7) / 0.3);
          scaleXZ = THREE.MathUtils.lerp(1, 1.08, (p - 0.7) / 0.3);
        }
      } else if (elapsed < HOP_TOTAL) {
        const p = (elapsed - HOP_ANTICIPATION - HOP_AIR) / HOP_SETTLE;
        const settle = easeOutBack(p);
        scaleY = THREE.MathUtils.lerp(0.85, 1, settle);
        scaleXZ = THREE.MathUtils.lerp(1.08, 1, settle);
      } else {
        setHop(null);
      }
    }

    g.rotation.y = spin.current + extraYaw + lean.current.z;
    g.rotation.x = lean.current.x;
    g.position.set(hopX, hopY, hopZ);
    g.scale.set(scaleXZ, scaleY, scaleXZ);
  });

  return (
    <>
      <group
        ref={group}
        onPointerEnter={startHop}
        onClick={startHop}
      >
        <primitive object={model.object} />
      </group>
      <ContactShadows position={[0, model.groundY, 0]} opacity={0.4} scale={4} blur={2.2} far={1.2} />
    </>
  );
}

export default function WeevilMascot3D({
  className,
  reducedMotion = false,
}: {
  className?: string;
  reducedMotion?: boolean;
}) {
  return (
    <div className={className} aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [2.4, 1.3, 2.6], fov: 32 }}
        gl={{ antialias: true, alpha: true }}
        shadows
        style={{ cursor: 'pointer' }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 4, 2]} intensity={1.5} castShadow />
        <directionalLight position={[-3, 1, -2]} intensity={0.35} color="#ffe4d6" />
        <Suspense fallback={null}>
          <WeevilModel reducedMotion={reducedMotion} />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_URL);
