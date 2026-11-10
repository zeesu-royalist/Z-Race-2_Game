import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGameStore } from '../store/gameStore';
import { checkCarCollision, RIVAL_HALF_LENGTH, RIVAL_HALF_WIDTH } from '../utils/carCollision';

const TARGET_CAR_LENGTH = 3.9;
const SLS_RAW_LENGTH = 4.85;
const SCALE_FACTOR = TARGET_CAR_LENGTH / SLS_RAW_LENGTH; // ~0.8041
const RIVAL_GROUND_Y = 0.02; // Aligns tires flush with road asphalt surface

// Track Waypoints defining full-city circuit (2.05 km)
export const TRACK_WAYPOINTS = [
  new THREE.Vector3(-3.0, 0.3, -4.0),
  new THREE.Vector3(-3.0, 0.3, 20.0),
  new THREE.Vector3(-3.0, 0.3, 28.0),   // Gate 0: Start Line
  new THREE.Vector3(-3.0, 0.3, 55.0),   // Gate 1: Boulevard Sprint
  new THREE.Vector3(-3.0, 0.3, 70.0),
  new THREE.Vector3(-3.5, 0.3, 78.0),
  new THREE.Vector3(-5.0, 0.3, 85.0),
  new THREE.Vector3(-8.5, 0.3, 95.0),
  new THREE.Vector3(-14.5, 0.3, 105.0),
  new THREE.Vector3(-22.0, 0.3, 112.0),
  new THREE.Vector3(-30.0, 0.3, 117.0),
  new THREE.Vector3(-40.0, 0.3, 121.0),
  new THREE.Vector3(-60.0, 0.3, 122.1),
  new THREE.Vector3(-80.0, 0.3, 122.1), // Gate 2: Tunnel Entry
  new THREE.Vector3(-105.0, 0.3, 122.1),
  new THREE.Vector3(-130.0, 0.3, 122.1),
  new THREE.Vector3(-148.0, 0.3, 119.5),
  new THREE.Vector3(-168.0, 0.3, 112.5),
  new THREE.Vector3(-188.0, 0.3, 99.5),
  new THREE.Vector3(-204.0, 0.3, 79.5),
  new THREE.Vector3(-215.0, 0.3, 58.0),
  new THREE.Vector3(-221.0, 0.3, 38.0),
  new THREE.Vector3(-222.0, 0.3, 20.0),
  new THREE.Vector3(-222.0, 0.3, 0.0),   // Gate 3: Turbo Alley
  new THREE.Vector3(-222.0, 0.3, -40.0),
  new THREE.Vector3(-222.0, 0.3, -80.0),
  new THREE.Vector3(-222.0, 0.3, -115.0),
  new THREE.Vector3(-222.0, 0.3, -145.0),
  new THREE.Vector3(-222.0, 0.3, -160.0),
  new THREE.Vector3(-224.0, 0.3, -172.0),
  new THREE.Vector3(-228.0, 0.3, -182.0),
  new THREE.Vector3(-236.0, 0.3, -192.0),
  new THREE.Vector3(-248.0, 0.3, -200.0),
  new THREE.Vector3(-262.0, 0.3, -206.0),
  new THREE.Vector3(-278.0, 0.3, -210.5),
  new THREE.Vector3(-300.0, 0.3, -211.2),// Gate 4: Mid-City Highway
  new THREE.Vector3(-330.0, 0.3, -211.2),
  new THREE.Vector3(-360.0, 0.3, -211.2),
  new THREE.Vector3(-380.0, 0.3, -211.2),
  new THREE.Vector3(-405.0, 0.3, -215.0),
  new THREE.Vector3(-430.0, 0.3, -225.0),
  new THREE.Vector3(-452.0, 0.3, -242.0),
  new THREE.Vector3(-468.0, 0.3, -265.0),
  new THREE.Vector3(-476.0, 0.3, -288.0),
  new THREE.Vector3(-479.2, 0.3, -310.0),
  new THREE.Vector3(-479.2, 0.3, -330.0),// Gate 5: Coastal Subway Bridge
  new THREE.Vector3(-479.2, 0.3, -360.0),
  new THREE.Vector3(-479.2, 0.3, -385.0),
  new THREE.Vector3(-476.0, 0.3, -402.0),
  new THREE.Vector3(-471.0, 0.3, -412.0),
  new THREE.Vector3(-464.0, 0.3, -418.5),
  new THREE.Vector3(-455.0, 0.3, -424.5),
  new THREE.Vector3(-442.0, 0.3, -428.5),// Gate 6: North Sweeper
  new THREE.Vector3(-422.0, 0.3, -431.5),
  new THREE.Vector3(-402.0, 0.3, -433.5),
  new THREE.Vector3(-386.0, 0.3, -436.5),
  new THREE.Vector3(-377.0, 0.3, -441.5),
  new THREE.Vector3(-371.5, 0.3, -448.0),
  new THREE.Vector3(-369.7, 0.3, -458.0),// Gate 7: North Avenue Sprint
  new THREE.Vector3(-369.7, 0.3, -475.0),
  new THREE.Vector3(-369.3, 0.3, -495.0),// Gate 8: North Gateway Arch
  new THREE.Vector3(-367.5, 0.3, -505.0),
  new THREE.Vector3(-364.5, 0.3, -512.0),
  new THREE.Vector3(-360.5, 0.3, -520.0),
  new THREE.Vector3(-350.0, 0.3, -528.0),
  new THREE.Vector3(-325.0, 0.3, -535.0),
  new THREE.Vector3(-285.0, 0.3, -542.0),
  new THREE.Vector3(-265.3, 0.3, -550.0),// Gate 9: North Highway Apex
  new THREE.Vector3(-261.0, 0.3, -558.0),
  new THREE.Vector3(-259.5, 0.3, -568.0),
  new THREE.Vector3(-254.0, 0.3, -576.0),
  new THREE.Vector3(-248.0, 0.3, -583.0),
  new THREE.Vector3(-230.0, 0.3, -585.0),
  new THREE.Vector3(-190.0, 0.3, -585.0),// Gate 10: Super Highway Straight
  new THREE.Vector3(-160.0, 0.3, -585.0),
  new THREE.Vector3(-144.0, 0.3, -580.0),
  new THREE.Vector3(-136.3, 0.3, -560.0),
  new THREE.Vector3(-136.3, 0.3, -520.0),
  new THREE.Vector3(-136.3, 0.3, -500.0),// Gate 11: Mid-City Avenue South
  new THREE.Vector3(-136.3, 0.3, -480.0),
  new THREE.Vector3(-136.3, 0.3, -450.0),
  new THREE.Vector3(-134.0, 0.3, -435.0),
  new THREE.Vector3(-120.0, 0.3, -427.0),
  new THREE.Vector3(-90.0, 0.3, -425.6),
  new THREE.Vector3(-60.0, 0.3, -425.6), // Gate 12: Cross Boulevard East
  new THREE.Vector3(-35.0, 0.3, -427.0),
  new THREE.Vector3(-22.0, 0.3, -435.0),
  new THREE.Vector3(-14.0, 0.3, -460.0),
  new THREE.Vector3(-12.5, 0.3, -500.0),
  new THREE.Vector3(-12.0, 0.3, -535.0),
  new THREE.Vector3(-5.0, 0.3, -560.0),  // Gate 13: East Metro Avenue
  new THREE.Vector3(5.0, 0.3, -580.0),
  new THREE.Vector3(15.0, 0.3, -594.0),
  new THREE.Vector3(26.0, 0.3, -604.0),
  new THREE.Vector3(38.0, 0.3, -610.0),
  new THREE.Vector3(65.0, 0.3, -618.5),
  new THREE.Vector3(100.0, 0.3, -620.8), // Gate 14: East Metro Grand Blvd
  new THREE.Vector3(140.0, 0.3, -620.8),
  new THREE.Vector3(170.0, 0.3, -615.0),
  new THREE.Vector3(182.0, 0.3, -604.0)  // Gate 15: Finish Line Arch
];

export const raceTrackCurve = new THREE.CatmullRomCurve3(TRACK_WAYPOINTS, false, 'centripetal');
raceTrackCurve.arcLengthDivisions = 400;
export const TRACK_TOTAL_LENGTH = raceTrackCurve.getLength();
export const FINISH_LINE_DIST = 2044.8;

// Precomputed track samples for 60 FPS localized lookup (0 GC)
const SAMPLE_COUNT = 600;
const TRACK_SAMPLES = [];
for (let i = 0; i <= SAMPLE_COUNT; i++) {
  const t = i / SAMPLE_COUNT;
  TRACK_SAMPLES.push({
    pos: raceTrackCurve.getPointAt(t),
    dist: t * TRACK_TOTAL_LENGTH
  });
}

const tempPoint = new THREE.Vector3();
const tempTangent = new THREE.Vector3();
const tempNormal = new THREE.Vector3();

export const RIVAL_CARS_CONFIG = [
  { id: 'rival_1', name: 'Viper', color: '#dc2626', gridSlot: 1, startDist: 28.0, initialLane: -1.6, topSpeed: 59.0, accelRate: 19.5 },
  { id: 'rival_2', name: 'Phantom', color: '#2563eb', gridSlot: 2, startDist: 24.0, initialLane: 1.6, topSpeed: 57.0, accelRate: 18.8 },
  { id: 'rival_3', name: 'Apex', color: '#16a34a', gridSlot: 3, startDist: 20.0, initialLane: -0.6, topSpeed: 60.5, accelRate: 20.2 },
  { id: 'rival_4', name: 'Blaze', color: '#f59e0b', gridSlot: 5, startDist: 10.0, initialLane: -1.6, topSpeed: 56.0, accelRate: 18.2 },
  { id: 'rival_5', name: 'Titan', color: '#ea580c', gridSlot: 6, startDist: 6.0, initialLane: 1.2, topSpeed: 58.0, accelRate: 19.0 },
  { id: 'rival_6', name: 'Shadow', color: '#9333ea', gridSlot: 7, startDist: 2.0, initialLane: -0.2, topSpeed: 55.0, accelRate: 17.8 }
];

RIVAL_CARS_CONFIG.forEach((cfg) => {
  const t = cfg.startDist / TRACK_TOTAL_LENGTH;
  const pt = raceTrackCurve.getPointAt(t);
  const tan = raceTrackCurve.getTangentAt(t).normalize();
  const n = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
  cfg.startPos = [pt.x + n.x * cfg.initialLane, RIVAL_GROUND_Y, pt.z + n.z * cfg.initialLane];
  cfg.startRotY = Math.atan2(tan.x, tan.z);
});

export const rivalCarsSim = RIVAL_CARS_CONFIG.map((cfg) => ({
  id: cfg.id,
  name: cfg.name,
  color: cfg.color,
  startDist: cfg.startDist,
  trackDist: cfg.startDist,
  speed: 0,
  topSpeed: cfg.topSpeed,
  targetSpeed: cfg.topSpeed,
  accelRate: cfg.accelRate,
  initialLane: cfg.initialLane,
  laneOffset: cfg.initialLane,
  targetLaneOffset: cfg.initialLane,
  laneChangeCooldown: 1.0 + Math.random() * 2.0,
  finished: false,
  speedVarianceTimer: Math.random() * 2,
  x: cfg.startPos[0],
  y: cfg.startPos[1],
  z: cfg.startPos[2],
  rotY: cfg.startRotY,
  pushX: 0,
  pushZ: 0
}));

if (typeof window !== 'undefined') {
  window.rivalCarsSim = rivalCarsSim;
}

export function RivalCars() {
  const { scene: slsBaseScene } = useGLTF('/cars-models/mercedes_sls_gt3.glb');
  const raceActive = useGameStore((s) => s.raceActive);
  const raceFinished = useGameStore((s) => s.raceFinished);
  const setRacePosition = useGameStore((s) => s.setRacePosition);

  const groupRefs = useRef([]);
  const lastPlayerSampleIdx = useRef(0);
  const simState = useRef(rivalCarsSim);

  // Physically cull invisible interior meshes (permanently frees 198 draw calls & 520,000 tris across 6 rivals)
  const rivalScenes = useMemo(() => {
    return RIVAL_CARS_CONFIG.map((cfg) => {
      const cloned = SkeletonUtils.clone(slsBaseScene);
      cloned.scale.setScalar(SCALE_FACTOR);

      const toRemove = [];
      cloned.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = false;
        child.receiveShadow = false;

        const matName = child.material?.name || '';
        const nodeName = child.name || '';
        if (
          matName.startsWith('INT_') || nodeName.startsWith('INT_') ||
          matName.includes('Cockpit') || matName.includes('Volante') ||
          matName.includes('ROLLBAR') || matName.includes('Decals') ||
          matName.includes('Sedile') || matName.includes('Cintura') ||
          matName.includes('Rim_Blur')
        ) {
          toRemove.push(child);
          return;
        }

        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          const hasPaint = mats.some((m) => m.name && (m.name.includes('Carpaint') || m.name.includes('paint') || m.name === 'EXT_Carpaint.007'));
          if (hasPaint) {
            const newMat = (mats[0] || child.material).clone();
            newMat.color = new THREE.Color(cfg.color);
            newMat.metalness = 0.85;
            newMat.roughness = 0.22;
            child.material = newMat;
          }
        }
      });

      toRemove.forEach((ch) => ch.parent && ch.parent.remove(ch));
      return cloned;
    });
  }, [slsBaseScene]);

  // Reset rivals whenever race starts
  useEffect(() => {
    if (raceActive) {
      lastPlayerSampleIdx.current = 0;
      simState.current.forEach((sim, idx) => {
        const cfg = RIVAL_CARS_CONFIG[idx];
        sim.trackDist = cfg.startDist;
        sim.speed = 0;
        sim.topSpeed = cfg.topSpeed;
        sim.targetSpeed = cfg.topSpeed;
        sim.laneOffset = cfg.initialLane;
        sim.targetLaneOffset = cfg.initialLane;
        sim.laneChangeCooldown = 1.0 + Math.random() * 2.0;
        sim.finished = false;
        sim.speedVarianceTimer = Math.random() * 2;
        sim.pushX = sim.pushZ = 0;
        sim.x = cfg.startPos[0];
        sim.y = cfg.startPos[1];
        sim.z = cfg.startPos[2];
        sim.rotY = cfg.startRotY;

        const grp = groupRefs.current[idx];
        if (grp) {
          grp.position.set(sim.x, sim.y, sim.z);
          grp.rotation.set(0, sim.rotY, 0);
        }
      });
    }
  }, [raceActive]);

  useFrame((_, delta) => {
    const dt = Math.max(0.001, Math.min(delta, 0.05));
    const curCountdown = useGameStore.getState().raceCountdown;
    const isCountingDown = curCountdown !== null && curCountdown > 0;
    const canRace = raceActive && !isCountingDown;
    const playerPos = useGameStore.getState().carPosition;

    simState.current.forEach((sim, idx) => {
      const cfg = RIVAL_CARS_CONFIG[idx];
      const grp = groupRefs.current[idx];

      if (!Number.isFinite(sim.speed)) sim.speed = 0;
      if (!Number.isFinite(sim.trackDist)) sim.trackDist = cfg.startDist;
      if (!Number.isFinite(sim.laneOffset)) sim.laneOffset = cfg.initialLane;
      if (!Number.isFinite(sim.targetLaneOffset)) sim.targetLaneOffset = cfg.initialLane;
      if (!Number.isFinite(sim.pushX)) sim.pushX = 0;
      if (!Number.isFinite(sim.pushZ)) sim.pushZ = 0;

      if (isCountingDown) {
        sim.y = RIVAL_GROUND_Y + Math.sin(performance.now() * 0.035 + idx * 1.5) * 0.003;
        sim.speed = 0;
      } else if (canRace && !sim.finished) {
        // Accelerate along track
        sim.speedVarianceTimer += dt;
        if (sim.speedVarianceTimer > 2.2) {
          sim.speedVarianceTimer = 0;
          sim.targetSpeed = THREE.MathUtils.clamp(cfg.topSpeed + (Math.random() - 0.5) * 3.0, 50, 62);
        }

        sim.trackDist += sim.speed * dt;
        if (sim.trackDist >= FINISH_LINE_DIST) sim.finished = true;

        const rawDist = Number.isFinite(sim.trackDist) ? sim.trackDist : cfg.startDist;
        const t = Math.max(0, Math.min(1, rawDist / TRACK_TOTAL_LENGTH));
        const tNext = Math.min(1, t + 0.001);

        raceTrackCurve.getPointAt(t, tempPoint);
        raceTrackCurve.getPointAt(tNext, tempTangent);
        tempTangent.sub(tempPoint).normalize();
        tempNormal.set(-tempTangent.z, 0, tempTangent.x).normalize();

        // Lookahead traffic awareness & gentle overtaking
        let carAheadDist = Infinity;
        let carAheadSpeed = sim.speed;
        let carAheadLane = sim.laneOffset;

        if (playerPos) {
          const pDx = playerPos[0] - sim.x;
          const pDz = playerPos[2] - sim.z;
          const fwd = pDx * tempTangent.x + pDz * tempTangent.z;
          if (fwd > 0.5 && fwd < 18.0) {
            const latDist = pDx * tempNormal.x + pDz * tempNormal.z;
            const pLane = sim.laneOffset + latDist;
            if (Math.abs(sim.laneOffset - pLane) < 1.1) {
              carAheadDist = fwd;
              const pSpeed = useGameStore.getState().speed;
              carAheadSpeed = (typeof pSpeed === 'number' && Number.isFinite(pSpeed)) ? pSpeed / 3.6 : 30;
              carAheadLane = pLane;
            }
          }
        }

        for (let j = 0; j < simState.current.length; j++) {
          if (j === idx) continue;
          const other = simState.current[j];
          if (other.finished) continue;
          const dTrack = other.trackDist - sim.trackDist;
          if (dTrack > 0.5 && dTrack < 18.0 && Math.abs(other.laneOffset - sim.laneOffset) < 1.1) {
            if (dTrack < carAheadDist) {
              carAheadDist = dTrack;
              carAheadSpeed = Number.isFinite(other.speed) ? other.speed : 50;
              carAheadLane = other.laneOffset;
            }
          }
        }

        // Smooth lane change when blocked ahead
        sim.laneChangeCooldown -= dt;
        if (sim.laneChangeCooldown <= 0 && carAheadDist < 14.0 && Math.abs(sim.laneOffset - carAheadLane) < 1.1) {
          sim.laneChangeCooldown = 2.0 + Math.random() * 1.5;
          const shiftDir = carAheadLane >= 0 ? -1.4 : 1.4;
          sim.targetLaneOffset = THREE.MathUtils.clamp(carAheadLane + shiftDir, -1.8, 1.8);
        }

        // Continuous proportional speed modulation (zero oscillation/buffering)
        const minFollowDist = 4.5;
        if (carAheadDist < 12.0 && sim.speed > carAheadSpeed) {
          const factor = Math.max(0, Math.min(1, (carAheadDist - minFollowDist) / (12.0 - minFollowDist)));
          const targetSpd = carAheadSpeed + (sim.targetSpeed - carAheadSpeed) * factor;
          if (sim.speed > targetSpd) {
            sim.speed = Math.max(targetSpd, sim.speed - 10.0 * dt);
          } else {
            sim.speed = Math.min(targetSpd, sim.speed + sim.accelRate * 0.5 * dt);
          }
        } else if (sim.speed < sim.targetSpeed) {
          sim.speed = Math.min(sim.targetSpeed, sim.speed + sim.accelRate * dt);
        } else {
          sim.speed = Math.max(sim.targetSpeed, sim.speed - 5.0 * dt);
        }

        // Smooth lateral lane tracking (Zero jitter)
        sim.laneOffset = THREE.MathUtils.lerp(sim.laneOffset, sim.targetLaneOffset, 2.2 * dt);

        // Smooth decay of collision push buffer
        sim.pushX = THREE.MathUtils.clamp(THREE.MathUtils.lerp(sim.pushX, 0, 6.0 * dt), -1.5, 1.5);
        sim.pushZ = THREE.MathUtils.clamp(THREE.MathUtils.lerp(sim.pushZ, 0, 6.0 * dt), -1.5, 1.5);

        sim.x = tempPoint.x + tempNormal.x * sim.laneOffset + sim.pushX;
        sim.y = RIVAL_GROUND_Y;
        sim.z = tempPoint.z + tempNormal.z * sim.laneOffset + sim.pushZ;

        // C1 continuous heading angle interpolation (Zero angular snapping)
        const targetRotY = Math.atan2(tempTangent.x, tempTangent.z) - (sim.targetLaneOffset - sim.laneOffset) * 0.03;
        const rotDiff = Math.atan2(Math.sin(targetRotY - sim.rotY), Math.cos(targetRotY - sim.rotY));
        sim.rotY += rotDiff * Math.min(1.0, 10.0 * dt);
      } else if (sim.finished) {
        if (sim.speed > 0.01 || Math.abs(sim.pushX) > 0.01 || Math.abs(sim.pushZ) > 0.01) {
          sim.speed = Math.max(0, sim.speed - 18.0 * dt);
          sim.trackDist = Math.min(TRACK_TOTAL_LENGTH, sim.trackDist + sim.speed * dt);
          const t = Math.max(0, Math.min(1, sim.trackDist / TRACK_TOTAL_LENGTH));
          const tNext = Math.min(1, t + 0.001);
          raceTrackCurve.getPointAt(t, tempPoint);
          raceTrackCurve.getPointAt(tNext, tempTangent);
          tempTangent.sub(tempPoint).normalize();
          tempNormal.set(-tempTangent.z, 0, tempTangent.x).normalize();

          sim.pushX = THREE.MathUtils.clamp(THREE.MathUtils.lerp(sim.pushX, 0, 6.0 * dt), -1.5, 1.5);
          sim.pushZ = THREE.MathUtils.clamp(THREE.MathUtils.lerp(sim.pushZ, 0, 6.0 * dt), -1.5, 1.5);
          sim.x = tempPoint.x + tempNormal.x * sim.laneOffset + sim.pushX;
          sim.y = RIVAL_GROUND_Y;
          sim.z = tempPoint.z + tempNormal.z * sim.laneOffset + sim.pushZ;

          const targetRotY = Math.atan2(tempTangent.x, tempTangent.z);
          const rotDiff = Math.atan2(Math.sin(targetRotY - sim.rotY), Math.cos(targetRotY - sim.rotY));
          sim.rotY += rotDiff * Math.min(1.0, 10.0 * dt);
        }
      }

      // Update 3D visual mesh transform with distance-based GPU culling
      if (grp) {
        if (playerPos) {
          const dx = sim.x - playerPos[0];
          const dz = sim.z - playerPos[2];
          grp.visible = (dx * dx + dz * dz) < 48400; // Only render when within 220m of player
        }
        if (grp.visible) {
          grp.position.set(sim.x, sim.y, sim.z);
          grp.rotation.set(0, sim.rotY, 0);
        }
      }
    });

    // Rival-to-Rival Continuous Capsule Collision
    if (canRace) {
      for (let i = 0; i < simState.current.length; i++) {
        for (let j = i + 1; j < simState.current.length; j++) {
          const r1 = simState.current[i];
          const r2 = simState.current[j];
          if (r1.finished || r2.finished) continue;

          const col = checkCarCollision(
            r1.x, r1.z, r1.rotY, RIVAL_HALF_LENGTH, RIVAL_HALF_WIDTH,
            r2.x, r2.z, r2.rotY, RIVAL_HALF_LENGTH, RIVAL_HALF_WIDTH
          );

          if (col) {
            const pushAmt = col.depth * 0.40;
            const sepX = col.normalX * pushAmt;
            const sepZ = col.normalZ * pushAmt;
            r1.pushX = THREE.MathUtils.clamp(r1.pushX + sepX, -1.5, 1.5);
            r1.pushZ = THREE.MathUtils.clamp(r1.pushZ + sepZ, -1.5, 1.5);
            r2.pushX = THREE.MathUtils.clamp(r2.pushX - sepX, -1.5, 1.5);
            r2.pushZ = THREE.MathUtils.clamp(r2.pushZ - sepZ, -1.5, 1.5);

            // Gentle lane separation
            const laneShift = (r1.laneOffset <= r2.laneOffset ? -0.4 : 0.4) * dt;
            r1.targetLaneOffset = THREE.MathUtils.clamp(r1.targetLaneOffset + laneShift, -1.8, 1.8);
            r2.targetLaneOffset = THREE.MathUtils.clamp(r2.targetLaneOffset - laneShift, -1.8, 1.8);

            // Speed balance safely guarded
            const r1Max = (r1.topSpeed || 58) + 2;
            const r2Max = (r2.topSpeed || 58) + 2;
            if (r1.trackDist > r2.trackDist) {
              r2.speed = Math.max(12, r2.speed - 5.0 * dt);
              r1.speed = Math.min(r1Max, r1.speed + 2.0 * dt);
            } else {
              r1.speed = Math.max(12, r1.speed - 5.0 * dt);
              r2.speed = Math.min(r2Max, r2.speed + 2.0 * dt);
            }
          }
        }
      }
    }

    // Compute player track distance & ranking (P1 to P7)
    if (raceActive || raceFinished) {
      let closestDistSq = Infinity;
      let playerTrackDist = 0;
      let bestIdx = lastPlayerSampleIdx.current;

      const windowStart = Math.max(0, bestIdx - 6);
      const windowEnd = Math.min(TRACK_SAMPLES.length, bestIdx + 24);

      for (let i = windowStart; i < windowEnd; i++) {
        const sp = TRACK_SAMPLES[i];
        const dx = sp.pos.x - playerPos[0];
        const dz = sp.pos.z - playerPos[2];
        const dSq = dx * dx + dz * dz;
        if (dSq < closestDistSq) {
          closestDistSq = dSq;
          playerTrackDist = sp.dist;
          bestIdx = i;
        }
      }

      if (closestDistSq > 900) {
        for (let i = 0; i < TRACK_SAMPLES.length; i++) {
          const sp = TRACK_SAMPLES[i];
          const dx = sp.pos.x - playerPos[0];
          const dz = sp.pos.z - playerPos[2];
          const dSq = dx * dx + dz * dz;
          if (dSq < closestDistSq) {
            closestDistSq = dSq;
            playerTrackDist = sp.dist;
            bestIdx = i;
          }
        }
      }

      lastPlayerSampleIdx.current = bestIdx;

      let rivalsAhead = 0;
      simState.current.forEach((sim) => {
        if (sim.trackDist > playerTrackDist) rivalsAhead++;
      });

      const liveRank = rivalsAhead + 1;
      if (useGameStore.getState().racePosition !== liveRank) {
        setRacePosition(liveRank);
      }
    }
  });

  return (
    <group>
      {RIVAL_CARS_CONFIG.map((cfg, idx) => (
        <group
          key={cfg.id}
          ref={(el) => (groupRefs.current[idx] = el)}
          position={cfg.startPos}
          rotation={[0, cfg.startRotY, 0]}
        >
          <primitive object={rivalScenes[idx]} />
        </group>
      ))}
    </group>
  );
}

useGLTF.preload('/cars-models/mercedes_sls_gt3.glb');
