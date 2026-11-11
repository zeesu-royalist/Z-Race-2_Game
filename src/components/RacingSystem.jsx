import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useShallow } from 'zustand/react/shallow';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { soundManager } from '../utils/AudioSystem';

// Checkpoints defining the Full-City Championship Circuit (2.05 km)
export const CIRCUIT_CHECKPOINTS = [
  { id: 0, pos: [-3.0, 1.2, 28.0], rotY: 0 },
  { id: 1, pos: [-3.0, 1.2, 55.0], rotY: 0 },
  { id: 2, pos: [-80.0, 1.2, 122.1], rotY: Math.PI / 2 },
  { id: 3, pos: [-222.0, 1.2, 0.0], rotY: Math.PI },
  { id: 4, pos: [-300.0, 1.2, -211.2], rotY: Math.PI / 2 },
  { id: 5, pos: [-479.2, 1.2, -330.0], rotY: Math.PI },
  { id: 6, pos: [-442.0, 1.2, -428.5], rotY: -Math.PI / 2 },
  { id: 7, pos: [-369.7, 1.2, -458.0], rotY: Math.PI },
  { id: 8, pos: [-369.3, 1.2, -495.0], rotY: Math.PI },
  { id: 9, pos: [-265.3, 1.2, -550.0], rotY: 2.33 },
  { id: 10, pos: [-190.0, 1.2, -585.0], rotY: Math.PI / 2 },
  { id: 11, pos: [-136.3, 1.2, -500.0], rotY: 0 },
  { id: 12, pos: [-60.0, 1.2, -425.6], rotY: Math.PI / 2 },
  { id: 13, pos: [-5.0, 1.2, -560.0], rotY: 2.77 },
  { id: 14, pos: [100.0, 1.2, -620.8], rotY: Math.PI / 2 },
  { id: 15, pos: [182.0, 1.2, -604.0], rotY: 0.83 }
];

const LAST_CP_INDEX = CIRCUIT_CHECKPOINTS.length - 1;
const CHECKPOINT_RADIUS_SQ = 90.25;
const INNER_RING_ROT = [0, 0, Math.PI / 4];

/** Allocates shared checkpoint geometries & pooled materials on demand; disposes when race ends. */
function createRaceAssets() {
  const outerGeo = new THREE.TorusGeometry(4.2, 0.16, 8, 24);
  const innerGeo = new THREE.TorusGeometry(3.8, 0.06, 6, 20);
  const pillarGeo = new THREE.CylinderGeometry(0.2, 0.25, 6, 8);
  const bannerGeo = new THREE.BoxGeometry(11.5, 0.8, 0.2);

  const outerMats = {
    finishPassed: new THREE.MeshStandardMaterial({ color: '#22ff88', emissive: '#00cc55', emissiveIntensity: 3.5, roughness: 0.2, transparent: true, opacity: 0.95 }),
    finish: new THREE.MeshStandardMaterial({ color: '#ffd700', emissive: '#ffaa00', emissiveIntensity: 3.5, roughness: 0.2, transparent: true, opacity: 0.95 }),
    passed: new THREE.MeshStandardMaterial({ color: '#22ff88', emissive: '#00cc55', emissiveIntensity: 0.8, roughness: 0.2, transparent: true, opacity: 0.45 }),
    next: new THREE.MeshStandardMaterial({ color: '#00f0ff', emissive: '#00ffff', emissiveIntensity: 3.5, roughness: 0.2, transparent: true, opacity: 0.95 }),
    upcoming: new THREE.MeshStandardMaterial({ color: '#225577', emissive: '#113355', emissiveIntensity: 0.8, roughness: 0.2, transparent: true, opacity: 0.45 })
  };
  const innerMats = {
    bright: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 }),
    dim: new THREE.MeshBasicMaterial({ color: '#00aaff', transparent: true, opacity: 0.2 })
  };
  const pillarMat = new THREE.MeshStandardMaterial({ color: '#ffd700', emissive: '#ff8800', emissiveIntensity: 1.5, metalness: 0.8, roughness: 0.2 });
  const bannerMat = new THREE.MeshStandardMaterial({ color: '#ffd700', emissive: '#ffaa00', emissiveIntensity: 2.0, roughness: 0.3 });

  return {
    outerGeo,
    innerGeo,
    pillarGeo,
    bannerGeo,
    outerMats,
    innerMats,
    pillarMat,
    bannerMat,
    dispose: () => {
      outerGeo.dispose();
      innerGeo.dispose();
      pillarGeo.dispose();
      bannerGeo.dispose();
      Object.values(outerMats).forEach((m) => m.dispose());
      innerMats.bright.dispose();
      innerMats.dim.dispose();
      pillarMat.dispose();
      bannerMat.dispose();
    }
  };
}

const CheckpointGate = memo(function CheckpointGate({ position, rotY, isNext, isPassed, isFinish, assets }) {
  const groupRef = useRef();
  const scale = isFinish ? 1.25 : isNext ? 1.08 : 0.95;

  const outerKey = isFinish ? (isPassed ? 'finishPassed' : 'finish') : isPassed ? 'passed' : isNext ? 'next' : 'upcoming';
  const outerMat = assets.outerMats[outerKey];
  const innerMat = isNext || isFinish ? assets.innerMats.bright : assets.innerMats.dim;

  useEffect(() => {
    const grp = groupRef.current;
    if (!grp) return;
    grp.updateMatrixWorld(true);
    grp.traverse((obj) => { obj.matrixAutoUpdate = false; });
  }, [position, rotY, scale]);

  return (
    <group ref={groupRef} position={position} rotation={[0, rotY, 0]} scale={[scale, scale, scale]}>
      <mesh geometry={assets.outerGeo} material={outerMat} />
      <mesh geometry={assets.innerGeo} rotation={INNER_RING_ROT} material={innerMat} />
      {isFinish && (
        <group position={[0, 0.8, 0]}>
          <mesh geometry={assets.pillarGeo} material={assets.pillarMat} position={[-5.5, 1.2, 0]} />
          <mesh geometry={assets.pillarGeo} material={assets.pillarMat} position={[5.5, 1.2, 0]} />
          <mesh geometry={assets.bannerGeo} material={assets.bannerMat} position={[0, 4.4, 0]} />
        </group>
      )}
    </group>
  );
});

function ActiveRace() {
  const currentCheckpoint = useGameStore((s) => s.currentCheckpoint);
  const assets = useMemo(() => createRaceAssets(), []);

  useEffect(() => () => assets.dispose(), [assets]);

  useFrame((_, delta) => {
    const st = useGameStore.getState();
    if (!st.raceActive) return;
    st.updateLapTime(delta);

    const cpIdx = st.currentCheckpoint;
    const target = CIRCUIT_CHECKPOINTS[cpIdx];
    if (!target) return;

    const dx = st.carPosition[0] - target.pos[0];
    const dz = st.carPosition[2] - target.pos[2];
    if (dx * dx + dz * dz < CHECKPOINT_RADIUS_SQ) {
      soundManager.playCheckpoint();
      st.reachCheckpoint(cpIdx);
      if (cpIdx === LAST_CP_INDEX) {
        import('canvas-confetti')
          .then((mod) => mod.default({ particleCount: 120, spread: 80, origin: { y: 0.6 } }))
          .catch(() => {});
      }
    }
  });

  const minIdx = Math.max(0, currentCheckpoint - 2);
  const maxIdx = Math.min(LAST_CP_INDEX, currentCheckpoint + 2);
  const gates = [];
  for (let idx = minIdx; idx <= maxIdx; idx++) {
    const cp = CIRCUIT_CHECKPOINTS[idx];
    gates.push(
      <CheckpointGate
        key={cp.id}
        position={cp.pos}
        rotY={cp.rotY}
        isNext={idx === currentCheckpoint}
        isPassed={idx < currentCheckpoint}
        isFinish={idx === LAST_CP_INDEX}
        assets={assets}
      />
    );
  }
  if (currentCheckpoint >= 13 && maxIdx < LAST_CP_INDEX) {
    const finishCp = CIRCUIT_CHECKPOINTS[LAST_CP_INDEX];
    gates.push(
      <CheckpointGate
        key={finishCp.id}
        position={finishCp.pos}
        rotY={finishCp.rotY}
        isNext={LAST_CP_INDEX === currentCheckpoint}
        isPassed={LAST_CP_INDEX < currentCheckpoint}
        isFinish
        assets={assets}
      />
    );
  }

  return <group>{gates}</group>;
}

/** Coordinates circuit race checkpoints & finish arch; unmounts completely during freeroam for 0 CPU/GPU cost. */
export function RacingSystem() {
  const { raceActive, raceFinished } = useGameStore(
    useShallow((s) => ({ raceActive: s.raceActive, raceFinished: s.raceFinished }))
  );
  if (!raceActive && !raceFinished) return null;
  return <ActiveRace />;
}
