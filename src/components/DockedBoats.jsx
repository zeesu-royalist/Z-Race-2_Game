import React, { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, DOCK_HOME_SLOTS, HELIPAD_HOME_SLOTS } from '../store/gameStore';
import { adaptVehicleGLBScene, spinRotors } from './CarModel';
import { WATER_SURFACE_Y, getWaterHeight, getWaterNormal } from '../utils/waterSystem';

function createHelipadMaterial() {
  if (typeof document === 'undefined') {
    return new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.88 });
  }
  const sz = 256;
  const c = document.createElement('canvas');
  c.width = c.height = sz;
  const ctx = c.getContext('2d');

  // Dark weathered concrete tarmac circle + yellow aviation perimeter ring + white/yellow H
  ctx.clearRect(0, 0, sz, sz);
  ctx.fillStyle = '#2b3038';
  ctx.beginPath();
  ctx.arc(128, 128, 122, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 108, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(248,250,252,0.75)';
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.arc(128, 128, 92, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#facc15';
  ctx.fillRect(88, 72, 16, 112);
  ctx.fillRect(152, 72, 16, 112);
  ctx.fillRect(88, 120, 80, 16);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.9, metalness: 0.05 });
}

function PulseMarker({ position, radius, beaconHeight, color, opacity = 0.35 }) {
  const ringRef = useRef();
  const beaconRef = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ringRef.current) {
      const pulse = 1.0 + Math.sin(t * 2.6) * 0.06;
      ringRef.current.scale.set(pulse, pulse, 1);
    }
    if (beaconRef.current) {
      beaconRef.current.position.y = position[1] + beaconHeight + Math.sin(t * 3.0) * 0.32;
      beaconRef.current.rotation.y = t * 1.4;
    }
  });

  return (
    <group>
      <mesh ref={ringRef} position={[position[0], position[1] + 0.1, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 0.24, radius, 40]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={beaconRef} position={[position[0], position[1] + beaconHeight, position[2]]}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshBasicMaterial color={color} transparent opacity={Math.min(0.9, opacity + 0.35)} />
      </mesh>
    </group>
  );
}

function DockedBoatVessel({ boat }) {
  const { scene } = useGLTF(boat.modelPath);
  const groupRef = useRef();
  const normVec = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  const { wrapper } = useMemo(
    () =>
      adaptVehicleGLBScene(scene, boat.modelPath, {
        targetLength: boat.targetLength,
        waterlineOffset: boat.waterlineOffset,
        vehicleType: 'boat'
      }),
    [scene, boat.modelPath, boat.targetLength, boat.waterlineOffset]
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const g = groupRef.current;
    if (!g) return;
    const [bx, , bz] = boat.position;
    const wY = getWaterHeight(bx, bz, t) ?? WATER_SURFACE_Y;
    getWaterNormal(bx, bz, t, normVec);
    const rotY = boat.rotationY;
    const pitch = normVec.z * Math.cos(rotY) + normVec.x * Math.sin(rotY);
    const roll = -normVec.x * Math.cos(rotY) + normVec.z * Math.sin(rotY);
    g.position.set(bx, wY, bz);
    g.rotation.set(pitch * 0.85, rotY, roll * 0.85, 'YXZ');
  });

  return (
    <group>
      <group ref={groupRef}>
        <primitive object={wrapper} />
      </group>
      <PulseMarker
        position={[boat.position[0], WATER_SURFACE_Y + 0.02, boat.position[2]]}
        radius={boat.targetLength > 16 ? 7.5 : 4.2}
        beaconHeight={boat.targetLength > 16 ? 6.2 : 3.2}
        color="#38bdf8"
        opacity={0.32}
      />
    </group>
  );
}

function DockedHeliVessel({ heli }) {
  const { scene } = useGLTF(heli.modelPath);
  const adapted = useMemo(
    () =>
      adaptVehicleGLBScene(scene, heli.modelPath, {
        targetLength: heli.targetLength,
        vehicleType: 'helicopter'
      }),
    [scene, heli.modelPath, heli.targetLength]
  );

  useFrame((_, delta) => {
    spinRotors(adapted.rotors, 8.5, Math.min(delta, 0.05));
  });

  return (
    <group>
      <group position={heli.position} rotation={[0, heli.rotationY, 0]}>
        <primitive object={adapted.wrapper} />
      </group>
      <PulseMarker
        position={heli.position}
        radius={5.5}
        beaconHeight={4.2}
        color="#fbbf24"
        opacity={0.38}
      />
    </group>
  );
}

function ParkedCarOnShore({ parkedCar }) {
  const { scene } = useGLTF(parkedCar.modelPath);
  const { wrapper } = useMemo(
    () => adaptVehicleGLBScene(scene, parkedCar.modelPath, { targetLength: 3.9, vehicleType: 'car' }),
    [scene, parkedCar.modelPath]
  );

  return (
    <group>
      <group position={parkedCar.position} rotation={[0, parkedCar.rotationY, 0]}>
        <primitive object={wrapper} />
      </group>
      <PulseMarker position={parkedCar.position} radius={3.0} beaconHeight={2.8} color="#10b981" opacity={0.72} />
    </group>
  );
}

/**
 * Renders docked boats, parked Paris helicopters (+ concrete H pads), and player's parked car.
 */
export function DockedBoats() {
  const dockedBoats = useGameStore((s) => s.dockedBoats);
  const dockedHelicopters = useGameStore((s) => s.dockedHelicopters);
  const vehicleType = useGameStore((s) => s.vehicleType);
  const currentCarId = useGameStore((s) => s.currentCarId);
  const parkedCar = useGameStore((s) => s.parkedCar);
  const helipadMat = useMemo(() => createHelipadMaterial(), []);

  const visibleBoats = dockedBoats.filter((b) => !(vehicleType === 'boat' && b.id === currentCarId));
  const visibleHelis = dockedHelicopters.filter((h) => !(vehicleType === 'helicopter' && h.id === currentCarId));

  return (
    <group>
      {/* Persistent Painted Helipad Landing Circles in Paris */}
      {dockedHelicopters.map((h) => (
        <mesh
          key={`pad-${h.id}`}
          position={[h.homePosition[0], h.homePosition[1] + 0.03, h.homePosition[2]]}
          rotation={[-Math.PI / 2, 0, h.homeRotationY]}
          material={helipadMat}
          receiveShadow
        >
          <circleGeometry args={[7.2, 36]} />
        </mesh>
      ))}

      {visibleBoats.map((boat) => (
        <Suspense key={boat.id} fallback={null}>
          <DockedBoatVessel boat={boat} />
        </Suspense>
      ))}
      {visibleHelis.map((heli) => (
        <Suspense key={heli.id} fallback={null}>
          <DockedHeliVessel heli={heli} />
        </Suspense>
      ))}
      {parkedCar && (
        <Suspense fallback={null}>
          <ParkedCarOnShore parkedCar={parkedCar} />
        </Suspense>
      )}
    </group>
  );
}

Object.keys(DOCK_HOME_SLOTS).forEach((id) => useGLTF.preload(`/boats/${id}.glb`));
Object.keys(HELIPAD_HOME_SLOTS).forEach((id) => useGLTF.preload(`/Helicopters/${id}.glb`));
