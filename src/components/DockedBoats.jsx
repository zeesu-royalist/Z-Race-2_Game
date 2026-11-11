import { memo, Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useShallow } from 'zustand/react/shallow';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { adaptVehicleGLBScene, spinRotors } from './CarModel';
import { WATER_SURFACE_Y, getWaterHeight, getWaterNormal } from '../utils/waterSystem';

const VESSEL_ANIM_DIST_SQ = 320 * 320;
const MARKER_ANIM_DIST_SQ = 260 * 260;
const _waterNorm = new THREE.Vector3(0, 1, 0);

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

/** Shared geometry & material pool for helipads and boarding markers; disposed on DockedBoats unmount. */
function createSharedMarkerResources() {
  const helipadMat = createHelipadMaterial();
  const helipadGeo = new THREE.CircleGeometry(7.2, 36);
  const beaconGeo = new THREE.OctahedronGeometry(0.42, 0);
  const ringGeos = new Map();
  const matPairs = new Map();

  return {
    helipadMat,
    helipadGeo,
    beaconGeo,
    getRingGeo: (radius) => {
      let g = ringGeos.get(radius);
      if (!g) {
        g = new THREE.RingGeometry(radius - 0.24, radius, 40);
        ringGeos.set(radius, g);
      }
      return g;
    },
    getMaterials: (color, opacity) => {
      const key = `${color}:${opacity}`;
      let pair = matPairs.get(key);
      if (!pair) {
        pair = {
          ring: new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide }),
          beacon: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.min(0.9, opacity + 0.35) })
        };
        matPairs.set(key, pair);
      }
      return pair;
    },
    dispose: () => {
      helipadGeo.dispose();
      helipadMat.map?.dispose();
      helipadMat.dispose();
      beaconGeo.dispose();
      ringGeos.forEach((g) => g.dispose());
      ringGeos.clear();
      matPairs.forEach((p) => {
        p.ring.dispose();
        p.beacon.dispose();
      });
      matPairs.clear();
    }
  };
}

const PulseMarker = memo(function PulseMarker({ position, radius, beaconHeight, color, opacity = 0.35, resources }) {
  const ringRef = useRef();
  const beaconRef = useRef();
  const px = position[0], py = position[1], pz = position[2];
  const baseBeaconY = py + beaconHeight;

  const ringGeo = resources.getRingGeo(radius);
  const mats = resources.getMaterials(color, opacity);

  useEffect(() => {
    if (ringRef.current) {
      ringRef.current.updateMatrix();
      ringRef.current.matrixAutoUpdate = false;
    }
    if (beaconRef.current) {
      beaconRef.current.updateMatrix();
      beaconRef.current.matrixAutoUpdate = false;
    }
  }, [px, py, pz, baseBeaconY]);

  useFrame(({ clock, camera }) => {
    const dx = camera.position.x - px;
    const dz = camera.position.z - pz;
    if (dx * dx + dz * dz > MARKER_ANIM_DIST_SQ) return;

    const t = clock.getElapsedTime();
    if (ringRef.current) {
      const pulse = 1.0 + Math.sin(t * 2.6) * 0.06;
      ringRef.current.scale.set(pulse, pulse, 1);
      ringRef.current.updateMatrix();
    }
    if (beaconRef.current) {
      beaconRef.current.position.y = baseBeaconY + Math.sin(t * 3.0) * 0.32;
      beaconRef.current.rotation.y = t * 1.4;
      beaconRef.current.updateMatrix();
    }
  });

  return (
    <group>
      <mesh
        ref={ringRef}
        position={[px, py + 0.1, pz]}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={ringGeo}
        material={mats.ring}
      />
      <mesh
        ref={beaconRef}
        position={[px, baseBeaconY, pz]}
        geometry={resources.beaconGeo}
        material={mats.beacon}
      />
    </group>
  );
});

const DockedBoatVessel = memo(function DockedBoatVessel({ boat, resources }) {
  const { scene } = useGLTF(boat.modelPath);
  const groupRef = useRef();
  const bx = boat.position[0], bz = boat.position[2], rotY = boat.rotationY;

  const { wrapper } = useMemo(
    () =>
      adaptVehicleGLBScene(scene, boat.modelPath, {
        targetLength: boat.targetLength,
        waterlineOffset: boat.waterlineOffset,
        vehicleType: 'boat'
      }),
    [scene, boat.modelPath, boat.targetLength, boat.waterlineOffset]
  );

  // Set resting water pose on mount so distant boats start accurately aligned before entering anim range
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.position.set(bx, WATER_SURFACE_Y, bz);
    g.rotation.set(0, rotY, 0, 'YXZ');
  }, [bx, bz, rotY]);

  useFrame(({ clock, camera }) => {
    const g = groupRef.current;
    if (!g) return;
    const dx = camera.position.x - bx;
    const dz = camera.position.z - bz;
    if (dx * dx + dz * dz > VESSEL_ANIM_DIST_SQ) return;

    const t = clock.getElapsedTime();
    const wY = getWaterHeight(bx, bz, t) ?? WATER_SURFACE_Y;
    getWaterNormal(bx, bz, t, _waterNorm);
    const pitch = _waterNorm.z * Math.cos(rotY) + _waterNorm.x * Math.sin(rotY);
    const roll = -_waterNorm.x * Math.cos(rotY) + _waterNorm.z * Math.sin(rotY);
    g.position.set(bx, wY, bz);
    g.rotation.set(pitch * 0.85, rotY, roll * 0.85, 'YXZ');
  });

  const isLargeShip = boat.targetLength > 16;

  return (
    <group>
      <group ref={groupRef}>
        <primitive object={wrapper} />
      </group>
      <PulseMarker
        position={[bx, WATER_SURFACE_Y + 0.02, bz]}
        radius={isLargeShip ? 7.5 : 4.2}
        beaconHeight={isLargeShip ? 6.2 : 3.2}
        color="#38bdf8"
        opacity={0.32}
        resources={resources}
      />
    </group>
  );
});

const DockedHeliVessel = memo(function DockedHeliVessel({ heli, resources }) {
  const { scene } = useGLTF(heli.modelPath);
  const adapted = useMemo(
    () =>
      adaptVehicleGLBScene(scene, heli.modelPath, {
        targetLength: heli.targetLength,
        vehicleType: 'helicopter'
      }),
    [scene, heli.modelPath, heli.targetLength]
  );

  const hx = heli.position[0], hz = heli.position[2];

  useFrame(({ camera }, delta) => {
    if (adapted.rotors.length === 0) return;
    const dx = camera.position.x - hx;
    const dz = camera.position.z - hz;
    if (dx * dx + dz * dz > VESSEL_ANIM_DIST_SQ) return;
    spinRotors(adapted.rotors, 8.5, Math.min(delta, 0.05));
  });

  const isPlane = heli.flightMode === 'plane';

  return (
    <group>
      <group position={heli.position} rotation={[0, heli.rotationY, 0]}>
        <primitive object={adapted.wrapper} />
      </group>
      <PulseMarker
        position={heli.position}
        radius={isPlane ? 7.2 : 5.5}
        beaconHeight={isPlane ? 4.8 : 4.2}
        color={isPlane ? '#f97316' : '#fbbf24'}
        opacity={0.38}
        resources={resources}
      />
    </group>
  );
});

const ParkedCarOnShore = memo(function ParkedCarOnShore({ parkedCar, resources }) {
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
      <PulseMarker position={parkedCar.position} radius={3.0} beaconHeight={2.8} color="#10b981" opacity={0.72} resources={resources} />
    </group>
  );
});

/**
 * Renders docked boats, parked Paris helicopters (+ concrete H pads), and player's parked car.
 */
export function DockedBoats() {
  const { dockedBoats, dockedHelicopters, vehicleType, currentCarId, parkedCar } = useGameStore(
    useShallow((s) => ({
      dockedBoats: s.dockedBoats,
      dockedHelicopters: s.dockedHelicopters,
      vehicleType: s.vehicleType,
      currentCarId: s.currentCarId,
      parkedCar: s.parkedCar
    }))
  );

  const resources = useMemo(() => createSharedMarkerResources(), []);
  const padsGroupRef = useRef();

  const helipads = useMemo(
    () => dockedHelicopters.filter((h) => h.flightMode !== 'plane'),
    [dockedHelicopters]
  );
  const visibleBoats = useMemo(
    () => (vehicleType === 'boat' ? dockedBoats.filter((b) => b.id !== currentCarId) : dockedBoats),
    [dockedBoats, vehicleType, currentCarId]
  );
  const visibleHelis = useMemo(
    () => (vehicleType === 'helicopter' ? dockedHelicopters.filter((h) => h.id !== currentCarId) : dockedHelicopters),
    [dockedHelicopters, vehicleType, currentCarId]
  );

  useEffect(() => {
    const grp = padsGroupRef.current;
    if (!grp) return;
    grp.updateMatrixWorld(true);
    grp.traverse((obj) => { obj.matrixAutoUpdate = false; });
  }, [helipads]);

  useEffect(() => () => resources.dispose(), [resources]);

  return (
    <group>
      {/* Persistent Painted Helipad Circles in Paris (Planes park cleanly directly on Paris tarmac) */}
      <group ref={padsGroupRef}>
        {helipads.map((h) => (
          <mesh
            key={`pad-${h.id}`}
            position={[h.homePosition[0], h.homePosition[1] + 0.03, h.homePosition[2]]}
            rotation={[-Math.PI / 2, 0, h.homeRotationY]}
            geometry={resources.helipadGeo}
            material={resources.helipadMat}
            receiveShadow
          />
        ))}
      </group>

      {visibleBoats.map((boat) => (
        <Suspense key={boat.id} fallback={null}>
          <DockedBoatVessel boat={boat} resources={resources} />
        </Suspense>
      ))}
      {visibleHelis.map((heli) => (
        <Suspense key={heli.id} fallback={null}>
          <DockedHeliVessel heli={heli} resources={resources} />
        </Suspense>
      ))}
      {parkedCar && (
        <Suspense fallback={null}>
          <ParkedCarOnShore parkedCar={parkedCar} resources={resources} />
        </Suspense>
      )}
    </group>
  );
}
