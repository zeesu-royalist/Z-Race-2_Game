import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useShallow } from 'zustand/react/shallow';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGameStore } from '../store/gameStore';
import { checkCarCollision, RIVAL_HALF_LENGTH, RIVAL_HALF_WIDTH } from '../utils/carCollision';

const MODEL_URL = '/cars-models/mercedes_sls_gt3.glb';
const SCALE_FACTOR = 3.9 / 4.85;
const RIVAL_GROUND_Y = 0.02;
const FINISH_LINE_DIST = 2044.8;
const RIVAL_VISIBLE_DIST_SQ = 48400; // 220m^2
const SAMPLE_COUNT = 600;

// Compact XZ waypoints (temporary Vector3 curve discarded immediately after sampling LUT)
const TRACK_COORDS = [
  [-3.0, -4.0], [-3.0, 20.0], [-3.0, 28.0], [-3.0, 55.0], [-3.0, 70.0],
  [-3.5, 78.0], [-5.0, 85.0], [-8.5, 95.0], [-14.5, 105.0], [-22.0, 112.0],
  [-30.0, 117.0], [-40.0, 121.0], [-60.0, 122.1], [-80.0, 122.1], [-105.0, 122.1],
  [-130.0, 122.1], [-148.0, 119.5], [-168.0, 112.5], [-188.0, 99.5], [-204.0, 79.5],
  [-215.0, 58.0], [-221.0, 38.0], [-222.0, 20.0], [-222.0, 0.0], [-222.0, -40.0],
  [-222.0, -80.0], [-222.0, -115.0], [-222.0, -145.0], [-222.0, -160.0], [-224.0, -172.0],
  [-228.0, -182.0], [-236.0, -192.0], [-248.0, -200.0], [-262.0, -206.0], [-278.0, -210.5],
  [-300.0, -211.2], [-330.0, -211.2], [-360.0, -211.2], [-380.0, -211.2], [-405.0, -215.0],
  [-430.0, -225.0], [-452.0, -242.0], [-468.0, -265.0], [-476.0, -288.0], [-479.2, -310.0],
  [-479.2, -330.0], [-479.2, -360.0], [-479.2, -385.0], [-476.0, -402.0], [-471.0, -412.0],
  [-464.0, -418.5], [-455.0, -424.5], [-442.0, -428.5], [-422.0, -431.5], [-402.0, -433.5],
  [-386.0, -436.5], [-377.0, -441.5], [-371.5, -448.0], [-369.7, -458.0], [-369.7, -475.0],
  [-369.3, -495.0], [-367.5, -505.0], [-364.5, -512.0], [-360.5, -520.0], [-350.0, -528.0],
  [-325.0, -535.0], [-285.0, -542.0], [-265.3, -550.0], [-261.0, -558.0], [-259.5, -568.0],
  [-254.0, -576.0], [-248.0, -583.0], [-230.0, -585.0], [-190.0, -585.0], [-160.0, -585.0],
  [-144.0, -580.0], [-136.3, -560.0], [-136.3, -520.0], [-136.3, -500.0], [-136.3, -480.0],
  [-136.3, -450.0], [-134.0, -435.0], [-120.0, -427.0], [-90.0, -425.6], [-60.0, -425.6],
  [-35.0, -427.0], [-22.0, -435.0], [-14.0, -460.0], [-12.5, -500.0], [-12.0, -535.0],
  [-5.0, -560.0], [5.0, -580.0], [15.0, -594.0], [26.0, -604.0], [38.0, -610.0],
  [65.0, -618.5], [100.0, -620.8], [140.0, -620.8], [170.0, -615.0], [182.0, -604.0]
];

// Bake spline once into 4 compact Float32Arrays (9.6 KB total) for O(1) zero-GC runtime sampling
const {
  TRACK_TOTAL_LENGTH,
  SAMPLE_DIST_STEP,
  INV_SAMPLE_STEP,
  SAMPLE_X,
  SAMPLE_Z,
  SAMPLE_TX,
  SAMPLE_TZ
} = (() => {
  const pts = TRACK_COORDS.map(([x, z]) => new THREE.Vector3(x, 0.3, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  curve.arcLengthDivisions = 400;
  const totalLen = curve.getLength();

  const sx = new Float32Array(SAMPLE_COUNT + 1);
  const sz = new Float32Array(SAMPLE_COUNT + 1);
  const stx = new Float32Array(SAMPLE_COUNT + 1);
  const stz = new Float32Array(SAMPLE_COUNT + 1);
  const p = new THREE.Vector3();
  const tVec = new THREE.Vector3();

  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const t = i / SAMPLE_COUNT;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tVec);
    const len = Math.hypot(tVec.x, tVec.z) || 1;
    sx[i] = p.x;
    sz[i] = p.z;
    stx[i] = tVec.x / len;
    stz[i] = tVec.z / len;
  }

  return {
    TRACK_TOTAL_LENGTH: totalLen,
    SAMPLE_DIST_STEP: totalLen / SAMPLE_COUNT,
    INV_SAMPLE_STEP: SAMPLE_COUNT / totalLen,
    SAMPLE_X: sx,
    SAMPLE_Z: sz,
    SAMPLE_TX: stx,
    SAMPLE_TZ: stz
  };
})();

const _trackOut = { x: 0, z: 0, tx: 0, tz: 1, nx: -1, nz: 0 };

function sampleTrackAt(trackDist, out = _trackOut) {
  const clampedDist = Math.max(0, Math.min(TRACK_TOTAL_LENGTH, trackDist));
  const fIdx = clampedDist * INV_SAMPLE_STEP;
  const i0 = Math.min(SAMPLE_COUNT - 1, fIdx | 0);
  const a = fIdx - i0;

  out.x = SAMPLE_X[i0] + (SAMPLE_X[i0 + 1] - SAMPLE_X[i0]) * a;
  out.z = SAMPLE_Z[i0] + (SAMPLE_Z[i0 + 1] - SAMPLE_Z[i0]) * a;

  const tx = SAMPLE_TX[i0] + (SAMPLE_TX[i0 + 1] - SAMPLE_TX[i0]) * a;
  const tz = SAMPLE_TZ[i0] + (SAMPLE_TZ[i0 + 1] - SAMPLE_TZ[i0]) * a;
  const invL = 1 / (Math.hypot(tx, tz) || 1);
  out.tx = tx * invL;
  out.tz = tz * invL;
  out.nx = -out.tz;
  out.nz = out.tx;
  return out;
}

const RIVAL_CARS_CONFIG = [
  { id: 'rival_1', name: 'Viper', color: '#dc2626', startDist: 28.0, initialLane: -1.6, topSpeed: 59.0, accelRate: 19.5 },
  { id: 'rival_2', name: 'Phantom', color: '#2563eb', startDist: 24.0, initialLane: 1.6, topSpeed: 57.0, accelRate: 18.8 },
  { id: 'rival_3', name: 'Apex', color: '#16a34a', startDist: 20.0, initialLane: -0.6, topSpeed: 60.5, accelRate: 20.2 },
  { id: 'rival_4', name: 'Blaze', color: '#f59e0b', startDist: 10.0, initialLane: -1.6, topSpeed: 56.0, accelRate: 18.2 },
  { id: 'rival_5', name: 'Titan', color: '#ea580c', startDist: 6.0, initialLane: 1.2, topSpeed: 58.0, accelRate: 19.0 },
  { id: 'rival_6', name: 'Shadow', color: '#9333ea', startDist: 2.0, initialLane: -0.2, topSpeed: 55.0, accelRate: 17.8 }
];

for (let i = 0; i < RIVAL_CARS_CONFIG.length; i++) {
  const cfg = RIVAL_CARS_CONFIG[i];
  const s = sampleTrackAt(cfg.startDist);
  cfg.startPos = [s.x + s.nx * cfg.initialLane, RIVAL_GROUND_Y, s.z + s.nz * cfg.initialLane];
  cfg.startRotY = Math.atan2(s.tx, s.tz);
}

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

function isInteriorSubmesh(nodeName, matName) {
  return (
    matName.startsWith('INT_') || nodeName.startsWith('INT_') ||
    matName.includes('Cockpit') || matName.includes('Volante') ||
    matName.includes('ROLLBAR') || matName.includes('Decals') ||
    matName.includes('Sedile') || matName.includes('Cintura') ||
    matName.includes('Rim_Blur')
  );
}

function applyRivalTrackTransform(sim, trk, dt, turnLeanScale) {
  sim.pushX = THREE.MathUtils.clamp(THREE.MathUtils.lerp(sim.pushX, 0, 6.0 * dt), -1.5, 1.5);
  sim.pushZ = THREE.MathUtils.clamp(THREE.MathUtils.lerp(sim.pushZ, 0, 6.0 * dt), -1.5, 1.5);
  sim.x = trk.x + trk.nx * sim.laneOffset + sim.pushX;
  sim.y = RIVAL_GROUND_Y;
  sim.z = trk.z + trk.nz * sim.laneOffset + sim.pushZ;

  const targetRotY = Math.atan2(trk.tx, trk.tz) - (sim.targetLaneOffset - sim.laneOffset) * turnLeanScale;
  const rotDiff = Math.atan2(Math.sin(targetRotY - sim.rotY), Math.cos(targetRotY - sim.rotY));
  sim.rotY += rotDiff * Math.min(1.0, 10.0 * dt);
}

export function RivalCars() {
  const { scene: slsBaseScene } = useGLTF(MODEL_URL);
  const { raceActive, raceFinished } = useGameStore(
    useShallow((s) => ({ raceActive: s.raceActive, raceFinished: s.raceFinished }))
  );

  const rootRef = useRef();
  const groupRefs = useRef([]);
  const lastPlayerSampleIdx = useRef(0);

  // Clone once per rival, cull interior geometry, deduplicate paint material clones, and freeze submeshes
  const rivalAssets = useMemo(() => {
    const scenes = [];
    const clonedMats = [];

    for (let i = 0; i < RIVAL_CARS_CONFIG.length; i++) {
      const cfg = RIVAL_CARS_CONFIG[i];
      const cloned = SkeletonUtils.clone(slsBaseScene);
      cloned.scale.setScalar(SCALE_FACTOR);

      const paintMatByBase = new Map();
      const toRemove = [];

      cloned.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = false;
        child.receiveShadow = false;

        const matName = child.material?.name || '';
        const nodeName = child.name || '';
        if (isInteriorSubmesh(nodeName, matName)) {
          toRemove.push(child);
          return;
        }

        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          let hasPaint = false;
          for (let m = 0; m < mats.length; m++) {
            const n = mats[m]?.name;
            if (n && (n.includes('Carpaint') || n.includes('paint') || n === 'EXT_Carpaint.007')) {
              hasPaint = true;
              break;
            }
          }
          if (hasPaint) {
            const baseMat = mats[0] || child.material;
            let paintMat = paintMatByBase.get(baseMat.uuid);
            if (!paintMat) {
              paintMat = baseMat.clone();
              paintMat.color.set(cfg.color);
              paintMat.metalness = 0.85;
              paintMat.roughness = 0.22;
              paintMatByBase.set(baseMat.uuid, paintMat);
              clonedMats.push(paintMat);
            }
            child.material = paintMat;
          }
        }

        child.updateMatrix();
        child.matrixAutoUpdate = false;
      });

      for (let r = 0; r < toRemove.length; r++) toRemove[r].parent?.remove(toRemove[r]);
      cloned.updateMatrixWorld(true);
      scenes.push(cloned);
    }

    return { scenes, clonedMats };
  }, [slsBaseScene]);

  useEffect(() => {
    for (let i = 0; i < groupRefs.current.length; i++) {
      const grp = groupRefs.current[i];
      if (grp) {
        grp.updateMatrix();
        grp.matrixAutoUpdate = false;
      }
    }
    return () => {
      for (let i = 0; i < rivalAssets.clonedMats.length; i++) {
        rivalAssets.clonedMats[i].dispose();
      }
    };
  }, [rivalAssets]);

  // Reset rivals whenever race starts
  useEffect(() => {
    if (!raceActive) return;
    lastPlayerSampleIdx.current = 0;
    for (let idx = 0; idx < rivalCarsSim.length; idx++) {
      const sim = rivalCarsSim[idx];
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
        grp.updateMatrix();
      }
    }
  }, [raceActive]);

  useFrame(({ clock }, delta) => {
    const st = useGameStore.getState();
    const playerPos = st.carPosition;
    const isRaceState = raceActive || raceFinished;

    // Fast coarse cull when player is far from West City start grid during freeroam (e.g. Paris)
    if (!isRaceState && playerPos) {
      const farFromStart = playerPos[0] > 230 || playerPos[0] < -235 || playerPos[2] > 250 || playerPos[2] < -220;
      if (rootRef.current) rootRef.current.visible = !farFromStart;
      if (farFromStart) return;
    } else if (rootRef.current && !rootRef.current.visible) {
      rootRef.current.visible = true;
    }

    const dt = Math.max(0.001, Math.min(delta, 0.05));
    const curCountdown = st.raceCountdown;
    const isCountingDown = raceActive && curCountdown !== null && curCountdown > 0;
    const canRace = raceActive && !isCountingDown;
    const revPhase = clock.getElapsedTime() * 35.0;
    const pSpeedKmh = st.speed;
    const playerSpeedMs = typeof pSpeedKmh === 'number' && Number.isFinite(pSpeedKmh) ? pSpeedKmh / 3.6 : 30;

    for (let idx = 0; idx < rivalCarsSim.length; idx++) {
      const sim = rivalCarsSim[idx];
      const cfg = RIVAL_CARS_CONFIG[idx];
      const grp = groupRefs.current[idx];

      if (!Number.isFinite(sim.speed)) sim.speed = 0;
      if (!Number.isFinite(sim.trackDist)) sim.trackDist = cfg.startDist;
      if (!Number.isFinite(sim.laneOffset)) sim.laneOffset = cfg.initialLane;
      if (!Number.isFinite(sim.targetLaneOffset)) sim.targetLaneOffset = cfg.initialLane;
      if (!Number.isFinite(sim.pushX)) sim.pushX = 0;
      if (!Number.isFinite(sim.pushZ)) sim.pushZ = 0;

      let moved = false;

      if (isCountingDown) {
        sim.y = RIVAL_GROUND_Y + Math.sin(revPhase + idx * 1.5) * 0.003;
        sim.speed = 0;
        moved = true;
      } else if (canRace && !sim.finished) {
        sim.speedVarianceTimer += dt;
        if (sim.speedVarianceTimer > 2.2) {
          sim.speedVarianceTimer = 0;
          sim.targetSpeed = THREE.MathUtils.clamp(cfg.topSpeed + (Math.random() - 0.5) * 3.0, 50, 62);
        }

        sim.trackDist += sim.speed * dt;
        if (sim.trackDist >= FINISH_LINE_DIST) sim.finished = true;

        const trk = sampleTrackAt(sim.trackDist, _trackOut);

        let carAheadDist = Infinity;
        let carAheadSpeed = sim.speed;
        let carAheadLane = sim.laneOffset;

        if (playerPos) {
          const pDx = playerPos[0] - sim.x;
          const pDz = playerPos[2] - sim.z;
          const fwd = pDx * trk.tx + pDz * trk.tz;
          if (fwd > 0.5 && fwd < 18.0) {
            const pLane = sim.laneOffset + (pDx * trk.nx + pDz * trk.nz);
            if (Math.abs(sim.laneOffset - pLane) < 1.1) {
              carAheadDist = fwd;
              carAheadSpeed = playerSpeedMs;
              carAheadLane = pLane;
            }
          }
        }

        for (let j = 0; j < rivalCarsSim.length; j++) {
          if (j === idx) continue;
          const other = rivalCarsSim[j];
          if (other.finished) continue;
          const dTrack = other.trackDist - sim.trackDist;
          if (dTrack > 0.5 && dTrack < 18.0 && Math.abs(other.laneOffset - sim.laneOffset) < 1.1 && dTrack < carAheadDist) {
            carAheadDist = dTrack;
            carAheadSpeed = Number.isFinite(other.speed) ? other.speed : 50;
            carAheadLane = other.laneOffset;
          }
        }

        sim.laneChangeCooldown -= dt;
        if (sim.laneChangeCooldown <= 0 && carAheadDist < 14.0 && Math.abs(sim.laneOffset - carAheadLane) < 1.1) {
          sim.laneChangeCooldown = 2.0 + Math.random() * 1.5;
          const shiftDir = carAheadLane >= 0 ? -1.4 : 1.4;
          sim.targetLaneOffset = THREE.MathUtils.clamp(carAheadLane + shiftDir, -1.8, 1.8);
        }

        const minFollowDist = 4.5;
        if (carAheadDist < 12.0 && sim.speed > carAheadSpeed) {
          const factor = Math.max(0, Math.min(1, (carAheadDist - minFollowDist) / (12.0 - minFollowDist)));
          const targetSpd = carAheadSpeed + (sim.targetSpeed - carAheadSpeed) * factor;
          sim.speed = sim.speed > targetSpd
            ? Math.max(targetSpd, sim.speed - 10.0 * dt)
            : Math.min(targetSpd, sim.speed + sim.accelRate * 0.5 * dt);
        } else if (sim.speed < sim.targetSpeed) {
          sim.speed = Math.min(sim.targetSpeed, sim.speed + sim.accelRate * dt);
        } else {
          sim.speed = Math.max(sim.targetSpeed, sim.speed - 5.0 * dt);
        }

        sim.laneOffset = THREE.MathUtils.lerp(sim.laneOffset, sim.targetLaneOffset, 2.2 * dt);
        applyRivalTrackTransform(sim, trk, dt, 0.03);
        moved = true;
      } else if (sim.finished && (sim.speed > 0.01 || Math.abs(sim.pushX) > 0.01 || Math.abs(sim.pushZ) > 0.01)) {
        sim.speed = Math.max(0, sim.speed - 18.0 * dt);
        sim.trackDist = Math.min(TRACK_TOTAL_LENGTH, sim.trackDist + sim.speed * dt);
        const trk = sampleTrackAt(sim.trackDist, _trackOut);
        applyRivalTrackTransform(sim, trk, dt, 0);
        moved = true;
      }

      if (grp) {
        let isNear = true;
        if (playerPos) {
          const dx = sim.x - playerPos[0];
          const dz = sim.z - playerPos[2];
          isNear = dx * dx + dz * dz < RIVAL_VISIBLE_DIST_SQ;
        }
        const becameVisible = !grp.visible && isNear;
        grp.visible = isNear;
        if (isNear && (moved || becameVisible)) {
          grp.position.set(sim.x, sim.y, sim.z);
          grp.rotation.set(0, sim.rotY, 0);
          grp.updateMatrix();
        }
      }
    }

    if (canRace) {
      for (let i = 0; i < rivalCarsSim.length; i++) {
        const r1 = rivalCarsSim[i];
        if (r1.finished) continue;
        for (let j = i + 1; j < rivalCarsSim.length; j++) {
          const r2 = rivalCarsSim[j];
          if (r2.finished) continue;

          const col = checkCarCollision(
            r1.x, r1.z, r1.rotY, RIVAL_HALF_LENGTH, RIVAL_HALF_WIDTH,
            r2.x, r2.z, r2.rotY, RIVAL_HALF_LENGTH, RIVAL_HALF_WIDTH
          );
          if (!col) continue;

          const pushAmt = col.depth * 0.40;
          const sepX = col.normalX * pushAmt;
          const sepZ = col.normalZ * pushAmt;
          r1.pushX = THREE.MathUtils.clamp(r1.pushX + sepX, -1.5, 1.5);
          r1.pushZ = THREE.MathUtils.clamp(r1.pushZ + sepZ, -1.5, 1.5);
          r2.pushX = THREE.MathUtils.clamp(r2.pushX - sepX, -1.5, 1.5);
          r2.pushZ = THREE.MathUtils.clamp(r2.pushZ - sepZ, -1.5, 1.5);

          const laneShift = (r1.laneOffset <= r2.laneOffset ? -0.4 : 0.4) * dt;
          r1.targetLaneOffset = THREE.MathUtils.clamp(r1.targetLaneOffset + laneShift, -1.8, 1.8);
          r2.targetLaneOffset = THREE.MathUtils.clamp(r2.targetLaneOffset - laneShift, -1.8, 1.8);

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

    if (isRaceState && playerPos) {
      let closestDistSq = Infinity;
      let bestIdx = lastPlayerSampleIdx.current;
      const windowStart = Math.max(0, bestIdx - 6);
      const windowEnd = Math.min(SAMPLE_COUNT + 1, bestIdx + 24);
      const px = playerPos[0], pz = playerPos[2];

      for (let i = windowStart; i < windowEnd; i++) {
        const dx = SAMPLE_X[i] - px;
        const dz = SAMPLE_Z[i] - pz;
        const dSq = dx * dx + dz * dz;
        if (dSq < closestDistSq) {
          closestDistSq = dSq;
          bestIdx = i;
        }
      }

      if (closestDistSq > 900) {
        for (let i = 0; i <= SAMPLE_COUNT; i++) {
          const dx = SAMPLE_X[i] - px;
          const dz = SAMPLE_Z[i] - pz;
          const dSq = dx * dx + dz * dz;
          if (dSq < closestDistSq) {
            closestDistSq = dSq;
            bestIdx = i;
          }
        }
      }

      lastPlayerSampleIdx.current = bestIdx;
      const playerTrackDist = bestIdx * SAMPLE_DIST_STEP;

      let rivalsAhead = 0;
      for (let i = 0; i < rivalCarsSim.length; i++) {
        if (rivalCarsSim[i].trackDist > playerTrackDist) rivalsAhead++;
      }

      const liveRank = rivalsAhead + 1;
      if (st.racePosition !== liveRank) {
        st.setRacePosition(liveRank);
      }
    }
  });

  return (
    <group ref={rootRef}>
      {RIVAL_CARS_CONFIG.map((cfg, idx) => (
        <group
          key={cfg.id}
          ref={(el) => { groupRefs.current[idx] = el; }}
          position={cfg.startPos}
          rotation={[0, cfg.startRotY, 0]}
        >
          <primitive object={rivalAssets.scenes[idx]} />
        </group>
      ))}
    </group>
  );
}
