import React from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import confetti from 'canvas-confetti';
import { useGameStore } from '../store/gameStore';
import { soundManager } from '../utils/AudioSystem';

// Checkpoints defining the Full-City Championship Circuit (2.05 km)
export const CIRCUIT_CHECKPOINTS = [
  { id: 0, pos: [-3.0, 1.2, 28.0], name: 'Start Line', rotY: 0 },
  { id: 1, pos: [-3.0, 1.2, 55.0], name: 'Boulevard Sprint', rotY: 0 },
  { id: 2, pos: [-80.0, 1.2, 122.1], name: 'Racing Tunnel', rotY: Math.PI / 2 },
  { id: 3, pos: [-222.0, 1.2, 0.0], name: 'Turbo Alley Expressway', rotY: Math.PI },
  { id: 4, pos: [-300.0, 1.2, -211.2], name: 'Mid-City Highway', rotY: Math.PI / 2 },
  { id: 5, pos: [-479.2, 1.2, -330.0], name: 'Coastal Subway Bridge', rotY: Math.PI },
  { id: 6, pos: [-442.0, 1.2, -428.5], name: 'North Sweeper', rotY: -Math.PI / 2 },
  { id: 7, pos: [-369.7, 1.2, -458.0], name: 'North Avenue Sprint', rotY: Math.PI },
  { id: 8, pos: [-369.3, 1.2, -495.0], name: 'North Metropolis Gateway Arch', rotY: Math.PI },
  { id: 9, pos: [-265.3, 1.2, -550.0], name: 'North Highway Apex', rotY: 2.33 },
  { id: 10, pos: [-190.0, 1.2, -585.0], name: 'Super Highway Straight', rotY: Math.PI / 2 },
  { id: 11, pos: [-136.3, 1.2, -500.0], name: 'Mid-City Avenue South', rotY: 0 },
  { id: 12, pos: [-60.0, 1.2, -425.6], name: 'Cross Boulevard East', rotY: Math.PI / 2 },
  { id: 13, pos: [-5.0, 1.2, -560.0], name: 'East Metro Avenue', rotY: 2.77 },
  { id: 14, pos: [100.0, 1.2, -620.8], name: 'East Metro Grand Boulevard', rotY: Math.PI / 2 },
  { id: 15, pos: [182.0, 1.2, -604.0], name: 'East Metro Terminus Finish Line Arch', rotY: 0.83 }
];

// Shared geometry buffers across gates
const sharedOuterTorus = new THREE.TorusGeometry(4.2, 0.16, 8, 24);
const sharedInnerTorus = new THREE.TorusGeometry(3.8, 0.06, 6, 20);
const sharedPillarGeo = new THREE.CylinderGeometry(0.2, 0.25, 6, 8);
const sharedBannerGeo = new THREE.BoxGeometry(11.5, 0.8, 0.2);

export function RacingSystem() {
  const raceActive = useGameStore((s) => s.raceActive);
  const raceFinished = useGameStore((s) => s.raceFinished);
  const currentCheckpoint = useGameStore((s) => s.currentCheckpoint);
  const reachCheckpoint = useGameStore((s) => s.reachCheckpoint);
  const updateLapTime = useGameStore((s) => s.updateLapTime);

  useFrame((_, delta) => {
    if (!raceActive) return;
    updateLapTime(delta);

    const carPos = useGameStore.getState().carPosition;
    const target = CIRCUIT_CHECKPOINTS[currentCheckpoint];
    if (!target) return;

    const dx = carPos[0] - target.pos[0];
    const dz = carPos[2] - target.pos[2];
    if (dx * dx + dz * dz < 90.25) {
      soundManager.playCheckpoint();
      reachCheckpoint(currentCheckpoint);
      if (currentCheckpoint === CIRCUIT_CHECKPOINTS.length - 1) {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      }
    }
  });

  if (!raceActive && !raceFinished) return null;

  return (
    <group>
      {CIRCUIT_CHECKPOINTS.map((cp, idx) => {
        const isNear = Math.abs(idx - currentCheckpoint) <= 2 || (idx === CIRCUIT_CHECKPOINTS.length - 1 && currentCheckpoint >= 13);
        if (!isNear) return null;
        return (
          <CheckpointGate
            key={cp.id}
            position={cp.pos}
            rotY={cp.rotY || 0}
            isNext={idx === currentCheckpoint}
            isPassed={idx < currentCheckpoint}
            isFinish={idx === CIRCUIT_CHECKPOINTS.length - 1}
          />
        );
      })}
    </group>
  );
}

function CheckpointGate({ position, rotY, isNext, isPassed, isFinish }) {
  const color = isFinish ? (isPassed ? '#22ff88' : '#ffd700') : isPassed ? '#22ff88' : isNext ? '#00f0ff' : '#225577';
  const emissiveColor = isFinish ? (isPassed ? '#00cc55' : '#ffaa00') : isPassed ? '#00cc55' : isNext ? '#00ffff' : '#113355';
  const scale = isFinish ? 1.25 : isNext ? 1.08 : 0.95;

  return (
    <group position={position} rotation={[0, rotY, 0]} scale={[scale, scale, scale]}>
      {/* Outer Hologram Ring */}
      <mesh geometry={sharedOuterTorus}>
        <meshStandardMaterial
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={isNext || isFinish ? 3.5 : 0.8}
          roughness={0.2}
          transparent
          opacity={isNext || isFinish ? 0.95 : 0.45}
        />
      </mesh>

      {/* Inner Laser Ring */}
      <mesh geometry={sharedInnerTorus} rotation={[0, 0, Math.PI / 4]}>
        <meshBasicMaterial
          color={isFinish ? '#ffffff' : isNext ? '#ffffff' : '#00aaff'}
          transparent
          opacity={isNext || isFinish ? 0.75 : 0.2}
        />
      </mesh>

      {/* Finish Arch Structure */}
      {isFinish && (
        <group position={[0, 0.8, 0]}>
          <mesh geometry={sharedPillarGeo} position={[-5.5, 1.2, 0]}>
            <meshStandardMaterial color="#ffd700" emissive="#ff8800" emissiveIntensity={1.5} metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh geometry={sharedPillarGeo} position={[5.5, 1.2, 0]}>
            <meshStandardMaterial color="#ffd700" emissive="#ff8800" emissiveIntensity={1.5} metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh geometry={sharedBannerGeo} position={[0, 4.4, 0]}>
            <meshStandardMaterial color="#ffd700" emissive="#ffaa00" emissiveIntensity={2.0} roughness={0.3} />
          </mesh>
        </group>
      )}
    </group>
  );
}
