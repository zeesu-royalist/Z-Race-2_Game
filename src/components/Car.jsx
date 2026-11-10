import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { CarModel } from './CarModel';
import { soundManager } from '../utils/AudioSystem';
import { cityColliders } from './CityMap';
import { rivalCarsSim } from './RivalCars';
import {
  checkCarCollision,
  PLAYER_HALF_LENGTH,
  PLAYER_HALF_WIDTH,
  RIVAL_HALF_LENGTH,
  RIVAL_HALF_WIDTH
} from '../utils/carCollision';

// Virtual keyboard & touch input tracker
export const inputState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  handbrake: false,
  nitro: false
};

const KEY_MAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'backward', ArrowDown: 'backward',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
  ShiftLeft: 'nitro', ShiftRight: 'nitro'
};

const ACTION_KEYS = {
  KeyR: () => useGameStore.getState().triggerReset(),
  KeyC: () => useGameStore.getState().cycleCameraMode(),
  KeyM: () => useGameStore.getState().toggleSound(),
  KeyT: () => useGameStore.getState().cycleTimeOfDay()
};

const GEAR_MINS = [0, 0, 45, 85, 125, 165, 205];
const SPAWN_POS = new THREE.Vector3(-3.0, 0.3, 10.0);
const SPAWN_ROT_Y = 0;

export function Car() {
  const carGroup = useRef();

  const resetSignal = useGameStore((s) => s.resetSignal);
  const teleportSignal = useGameStore((s) => s.teleportSignal);
  const currentCarId = useGameStore((s) => s.currentCarId);
  const soundEnabled = useGameStore((s) => s.soundEnabled);

  const activeCarCategoryRef = useRef('jdm_turbo');
  const tuningRef = useRef({ maxSpeed: 64, accelRate: 19, gripFactor: 0.9, turnMultiplier: 1.0 });
  const lastCrashSoundTime = useRef(0);

  const state = useRef({
    position: SPAWN_POS.clone(),
    rotationY: SPAWN_ROT_Y,
    pitch: 0,
    roll: 0,
    speed: 0,
    steerAngle: 0,
    wheelRotation: 0,
    angularVelocity: 0,
    verticalVelocity: 0,
    isGrounded: true,
    isDrifting: false,
    driftTimer: 0,
    driftIntensity: 0,
    driftScore: 0,
    currentGear: 1,
    rpm: 900,
    isBraking: false,
    nitro: 100,
    isNitroActive: false,
    nitroCooldown: 0,
    nitroLocked: false
  });

  const math = useRef({
    raycaster: new THREE.Raycaster(),
    downVec: new THREE.Vector3(0, -1, 0),
    forwardVec: new THREE.Vector3(),
    rightVec: new THREE.Vector3(),
    normalVec: new THREE.Vector3(0, 1, 0),
    wallRaycaster: new THREE.Raycaster(),
    rayOrigin: new THREE.Vector3(),
    wallOrigin: new THREE.Vector3(),
    checkDir: new THREE.Vector3(),
    groundHits: [],
    wallHits: []
  });

  // Setup Keyboard Listeners
  useEffect(() => {
    const onKeyDown = (e) => {
      soundManager.init();
      soundManager.resume();
      const mapped = KEY_MAP[e.code];
      if (mapped) {
        inputState[mapped] = true;
        if (e.code === 'Space') e.preventDefault();
      } else if (ACTION_KEYS[e.code]) {
        ACTION_KEYS[e.code]();
      }
    };

    const onKeyUp = (e) => {
      const mapped = KEY_MAP[e.code];
      if (mapped) inputState[mapped] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Handle Car Reset Signal
  useEffect(() => {
    if (resetSignal > 0) {
      const s = state.current;
      s.position.copy(SPAWN_POS);
      s.rotationY = SPAWN_ROT_Y;
      s.pitch = s.roll = s.speed = s.steerAngle = s.angularVelocity = s.verticalVelocity = s.driftScore = s.driftTimer = 0;
      s.isDrifting = false;
      s.currentGear = 1;
      s.rpm = 900;
      if (carGroup.current) {
        carGroup.current.position.copy(s.position);
        carGroup.current.rotation.set(0, s.rotationY, 0);
      }
    }
  }, [resetSignal]);

  // Audio mute/unmute sync
  useEffect(() => {
    soundManager.setEnabled(soundEnabled);
  }, [soundEnabled]);

  // Fast Travel & District Teleport Handler
  useEffect(() => {
    if (teleportSignal > 0) {
      const target = useGameStore.getState().teleportTarget;
      if (target) {
        const s = state.current;
        s.position.set(target.pos[0], target.pos[1], target.pos[2]);
        s.rotationY = target.rotY;
        s.pitch = s.roll = s.speed = s.steerAngle = s.angularVelocity = s.verticalVelocity = 0;
        s.isGrounded = true;
        if (carGroup.current) {
          carGroup.current.position.copy(s.position);
          carGroup.current.rotation.set(0, s.rotationY, 0);
        }
      }
    }
  }, [teleportSignal]);

  // Cache tuning and sound profile once when car changes
  useEffect(() => {
    const s = state.current;
    s.speed = s.angularVelocity = s.steerAngle = s.verticalVelocity = 0;
    const car = useGameStore.getState().cars.find((c) => c.id === currentCarId);
    if (car) {
      activeCarCategoryRef.current = car.category || '';
      tuningRef.current = car.tuning || { maxSpeed: 64, accelRate: 19, gripFactor: 0.9, turnMultiplier: 1.0 };
      soundManager.setProfile(car.category || '');
    }
  }, [currentCarId]);

  // Highly Optimized 60-120 FPS Vehicle Physics Loop
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = state.current;
    const m = math.current;

    // 1. NITRO BOOST LOGIC (Auto-accelerates even without pressing GAS)
    if (s.nitro <= 0) s.nitroLocked = true;
    else if (s.nitro >= 50) s.nitroLocked = false;

    let nitroMultiplier = 1.0;
    if (inputState.nitro && !s.nitroLocked && s.nitro > 0 && !inputState.backward) {
      nitroMultiplier = 1.65;
      s.isNitroActive = true;
      s.nitro = Math.max(0, s.nitro - dt * 25);
      s.nitroCooldown = 2.0; // 2 sec cooldown before recharging begins
    } else {
      s.isNitroActive = false;
      if (s.nitroCooldown > 0) {
        s.nitroCooldown -= dt;
      } else if (s.nitro < 100) {
        s.nitro = Math.min(100, s.nitro + dt * 3.5); // Slow recharge
      }
    }
    const isDrivingForward = inputState.forward || s.isNitroActive;

    // 2. STEERING DYNAMICS (Speed-sensitive)
    const speedKmH = Math.abs(s.speed * 3.6);
    const speedFactor = Math.max(0.28, 1.0 - (speedKmH / 220) * 0.72);
    const maxSteer = 0.58 * speedFactor;
    const steerSpeed = 4.8 * dt;

    if (inputState.left) {
      s.steerAngle = Math.min(maxSteer, s.steerAngle + steerSpeed);
    } else if (inputState.right) {
      s.steerAngle = Math.max(-maxSteer, s.steerAngle - steerSpeed);
    } else {
      s.steerAngle = THREE.MathUtils.lerp(s.steerAngle, 0, 8.5 * dt);
    }

    const tuning = tuningRef.current;
    const raceCountdown = useGameStore.getState().raceCountdown;
    const isLockedByCountdown = raceCountdown !== null && raceCountdown > 0;

    const normalMaxSpeed = tuning.maxSpeed || 64;
    const maxForwardSpeed = normalMaxSpeed * nitroMultiplier;
    const maxReverseSpeed = -15;
    const accelRate = (tuning.accelRate || 19) * nitroMultiplier;
    const brakeRate = 34;
    const naturalFriction = 3.6;

    // When nitro is NOT active, bleed excess boost speed back to normal car top speed
    if (!s.isNitroActive && s.speed > normalMaxSpeed) {
      s.speed = Math.max(normalMaxSpeed, s.speed - 14.0 * dt);
    }

    s.isBraking = false;

    // 3. ACCELERATION & BRAKING
    if (isLockedByCountdown) {
      s.speed = 0;
      s.steerAngle = 0;
      s.rpm = inputState.forward ? Math.min(6200, s.rpm + 5000 * dt) : Math.max(900, s.rpm - 3500 * dt);
    } else if (isDrivingForward) {
      if (s.speed < 0) {
        s.speed += brakeRate * dt;
        s.isBraking = true;
      } else {
        s.speed = Math.min(maxForwardSpeed, s.speed + accelRate * dt);
      }
    } else if (inputState.backward) {
      if (s.speed > 0.5) {
        s.speed = Math.max(0, s.speed - brakeRate * dt);
        s.isBraking = true;
      } else {
        s.speed = Math.max(maxReverseSpeed, s.speed - accelRate * 0.65 * dt);
      }
    } else {
      if (s.speed > 0) s.speed = Math.max(0, s.speed - naturalFriction * dt);
      else if (s.speed < 0) s.speed = Math.min(0, s.speed + naturalFriction * dt);
    }

    let gripFactor = 1.0;
    if (inputState.handbrake) {
      gripFactor = 0.28;
      s.speed = Math.max(0, s.speed - 12 * dt);
      s.isBraking = true;
    }

    // 4. YAW ROTATION & DRIFT
    const directionSign = s.speed < -0.5 ? -1 : 1;
    let turnRate = 0;
    if (Math.abs(s.speed) > 0.2) {
      turnRate = s.steerAngle * (Math.abs(s.speed) / 5.5) * directionSign * (tuning.turnMultiplier || 1.0);
      if (inputState.handbrake && Math.abs(s.speed) > 5) turnRate *= 1.85;
    }

    s.angularVelocity = THREE.MathUtils.lerp(s.angularVelocity, turnRate, 9.5 * dt);
    s.rotationY += s.angularVelocity * dt;

    // 4.1 SUSTAINED DRIFT CHECK (Prevents casual steering from flashing drift UI)
    const canDrift = s.isGrounded && speedKmH > 38 && (inputState.handbrake || (Math.abs(s.steerAngle) > 0.24 && speedKmH > 60));
    s.driftTimer = canDrift ? s.driftTimer + dt : Math.max(0, s.driftTimer - dt * 2.5);
    s.isDrifting = s.driftTimer > (inputState.handbrake ? 0.12 : 0.45);
    s.driftIntensity = s.isDrifting ? Math.min(1.0, (speedKmH / 100) * (inputState.handbrake ? 1.4 : 0.9)) : 0;
    if (s.isDrifting) {
      s.driftScore += Math.round(s.driftIntensity * 10);
    } else if (s.driftTimer === 0) {
      s.driftScore = 0;
    }

    // 5. POSITION DISPLACEMENT (Zero GC)
    m.forwardVec.set(Math.sin(s.rotationY), 0, Math.cos(s.rotationY)).normalize();
    m.rightVec.set(m.forwardVec.z, 0, -m.forwardVec.x);

    const forwardStep = s.speed * dt;
    s.position.x += m.forwardVec.x * forwardStep;
    s.position.z += m.forwardVec.z * forwardStep;

    if (s.isDrifting) {
      const slip = (1.0 - gripFactor) * s.angularVelocity * 0.4 * dt * s.speed;
      s.position.x += m.rightVec.x * slip;
      s.position.z += m.rightVec.z * slip;
    }

    // 5.1 CAR-TO-CAR RACING COLLISION (Player vs 6 Rival Cars)
    const { raceActive, raceFinished } = useGameStore.getState();
    if (raceActive || raceFinished) {
      const px = s.position.x;
      const pz = s.position.z;
      const pRot = s.rotationY;
      const pSin = m.forwardVec.x;
      const pCos = m.forwardVec.z;
      const pVx = pSin * s.speed;
      const pVz = pCos * s.speed;

      for (let i = 0; i < rivalCarsSim.length; i++) {
        const rival = rivalCarsSim[i];
        const col = checkCarCollision(
          px, pz, pRot, PLAYER_HALF_LENGTH, PLAYER_HALF_WIDTH,
          rival.x, rival.z, rival.rotY, RIVAL_HALF_LENGTH, RIVAL_HALF_WIDTH
        );

        if (col) {
          s.position.x += col.normalX * col.depth * 0.55;
          s.position.z += col.normalZ * col.depth * 0.55;
          rival.pushX = THREE.MathUtils.clamp(rival.pushX - col.normalX * col.depth * 0.45, -1.5, 1.5);
          rival.pushZ = THREE.MathUtils.clamp(rival.pushZ - col.normalZ * col.depth * 0.45, -1.5, 1.5);

          const rSin = Math.sin(rival.rotY);
          const rCos = Math.cos(rival.rotY);
          const relVx = pVx - rSin * rival.speed;
          const relVz = pVz - rCos * rival.speed;
          const normalVel = relVx * col.normalX + relVz * col.normalZ;

          const now = performance.now() * 0.001;
          if (now - lastCrashSoundTime.current > 0.16 && normalVel < -1.0) {
            soundManager.playCrash(Math.min(2.0, Math.abs(normalVel) / 8.0 + 0.35));
            lastCrashSoundTime.current = now;
          }

          if (normalVel < 0) {
            const impulse = -1.35 * normalVel * 0.5;
            const pForwardDot = col.normalX * pSin + col.normalZ * pCos;
            const pRightDot = col.normalX * pCos - col.normalZ * pSin;

            s.speed = Math.max(0, s.speed + impulse * pForwardDot);
            const rx = col.contactX - s.position.x;
            const rz = col.contactZ - s.position.z;
            const torque = (rx * pSin + rz * pCos) * (impulse * pRightDot);
            s.angularVelocity += THREE.MathUtils.clamp(torque * 0.10, -2.2, 2.2);
            s.speed *= 0.985;

            const rForwardDot = (-col.normalX) * rSin + (-col.normalZ) * rCos;
            const rRightDot = (-col.normalX) * rCos - (-col.normalZ) * rSin;
            const rivalMax = (rival.topSpeed || 58) + 10;
            const targetSpd = rival.speed + impulse * rForwardDot;
            rival.speed = Number.isFinite(targetSpd) ? THREE.MathUtils.clamp(targetSpd, 12, rivalMax) : 30;
            rival.targetLaneOffset = THREE.MathUtils.clamp(rival.laneOffset + rRightDot * 0.45, -1.8, 1.8);
          }
        }
      }
    }

    // 6. BVH SUSPENSION & ROAD RAYCAST (Zero Heap Allocation)
    if (cityColliders.length > 0) {
      m.rayOrigin.copy(s.position);
      m.rayOrigin.y += 0.45;
      m.raycaster.set(m.rayOrigin, m.downVec);
      m.raycaster.far = 25.0;

      m.groundHits.length = 0;
      m.raycaster.intersectObjects(cityColliders, false, m.groundHits);
      const groundHits = m.groundHits;

      let validHit = null;
      for (let i = 0; i < groundHits.length; i++) {
        const h = groundHits[i];
        if (h.normal && h.normal.y > 0.45 && h.point.y <= s.position.y + 0.35) {
          validHit = h;
          break;
        }
      }

      if (validHit) {
        const targetY = validHit.point.y + 0.02;
        if (s.position.y - targetY <= 0.45) {
          s.position.y = THREE.MathUtils.lerp(s.position.y, targetY, 24.0 * dt);
          s.verticalVelocity = 0;
          s.isGrounded = true;
          if (validHit.normal) {
            m.normalVec.copy(validHit.normal);
            const targetPitch = m.normalVec.z * Math.cos(s.rotationY) + m.normalVec.x * Math.sin(s.rotationY);
            s.pitch = THREE.MathUtils.lerp(s.pitch, -targetPitch * 0.4, 10.0 * dt);
          }
        } else {
          s.isGrounded = false;
          s.verticalVelocity -= 22.0 * dt;
          s.position.y += s.verticalVelocity * dt;
          if (s.position.y <= targetY) {
            s.position.y = targetY;
            s.verticalVelocity = 0;
            s.isGrounded = true;
          }
        }
      } else {
        if (s.position.y > 0.0) {
          s.isGrounded = false;
          s.verticalVelocity -= 22.0 * dt;
          s.position.y = Math.max(0.0, s.position.y + s.verticalVelocity * dt);
        }
        if (s.position.y <= 0.0) {
          s.position.y = 0.0;
          s.verticalVelocity = 0;
          s.isGrounded = true;
        }
      }

      // Wall / Building collision
      if (Math.abs(s.speed) > 2) {
        m.wallOrigin.copy(s.position);
        m.wallOrigin.y += 0.85;
        m.checkDir.copy(m.forwardVec);
        if (s.speed < 0) m.checkDir.negate();

        m.wallRaycaster.set(m.wallOrigin, m.checkDir);
        m.wallRaycaster.far = 2.4;
        m.wallHits.length = 0;
        m.wallRaycaster.intersectObjects(cityColliders, false, m.wallHits);
        const wallHits = m.wallHits;

        if (wallHits.length > 0 && wallHits[0].distance < 2.0) {
          const hitNorm = wallHits[0].normal;
          if (hitNorm && Math.abs(hitNorm.y) < 0.55) {
            const dot = m.checkDir.dot(hitNorm);
            if (dot < -0.65) {
              soundManager.playCrash(Math.abs(s.speed) / 25);
              s.speed = -s.speed * 0.25;
              s.position.x += hitNorm.x * 0.35;
              s.position.z += hitNorm.z * 0.35;
            } else {
              soundManager.playCrash(Math.abs(s.speed) / 50);
              s.speed *= 0.8;
              s.position.x += hitNorm.x * 0.2;
              s.position.z += hitNorm.z * 0.2;
            }
          }
        }
      }
    }

    // Unlocked open-world city boundaries
    if (s.position.x < -800) { s.position.x = -795; s.speed = 0; }
    if (s.position.x > 500) { s.position.x = 495; s.speed = 0; }
    if (s.position.z < -900) { s.position.z = -895; s.speed = 0; }
    if (s.position.z > 400) { s.position.z = 395; s.speed = 0; }

    // Wheel rotation
    s.wheelRotation += (s.speed * dt / (2 * Math.PI * 0.36)) * Math.PI * 2;

    // Automatic Gears & RPM
    let gear = 1;
    let gearMaxSpeed = 10;
    if (s.speed < -0.1) {
      gear = 'R';
    } else {
      if (speedKmH < 45) { gear = 1; gearMaxSpeed = 45; }
      else if (speedKmH < 85) { gear = 2; gearMaxSpeed = 85; }
      else if (speedKmH < 125) { gear = 3; gearMaxSpeed = 125; }
      else if (speedKmH < 165) { gear = 4; gearMaxSpeed = 165; }
      else if (speedKmH < 205) { gear = 5; gearMaxSpeed = 205; }
      else { gear = 6; gearMaxSpeed = 270; }
    }

    let rpm = 900;
    if (gear === 'R') {
      rpm = 900 + (Math.abs(speedKmH) / 50) * 5500;
    } else {
      const gearMin = gear === 1 ? 0 : GEAR_MINS[gear];
      const normGearSpeed = Math.max(0, Math.min(1, (speedKmH - gearMin) / (gearMaxSpeed - gearMin)));
      rpm = 900 + normGearSpeed * 6800 + (isDrivingForward ? 300 : 0);
    }
    s.rpm = Math.min(8000, Math.max(900, rpm));
    if (s.currentGear !== gear && s.currentGear !== 'R' && gear !== 'R' && gear > s.currentGear && speedKmH > 25) {
      soundManager.playGearShift();
    }
    s.currentGear = gear;

    // Apply Transforms to 3D Car Root
    if (carGroup.current) {
      carGroup.current.position.copy(s.position);
      carGroup.current.rotation.set(s.pitch, s.rotationY, 0, 'YXZ');
    }

    // Sound Engine Update
    soundManager.updateEngine(s.rpm, isDrivingForward, speedKmH);
    soundManager.updateDrift(s.isDrifting, s.driftIntensity);
    soundManager.updateNitro(s.isNitroActive);

    // Update Store Telemetry directly (Zero GC heap churn)
    const st = useGameStore.getState();
    st.carPosition[0] = s.position.x;
    st.carPosition[1] = s.position.y;
    st.carPosition[2] = s.position.z;
    st.speed = Math.round(speedKmH);
    st.rpm = Math.round(s.rpm);
    st.gear = String(s.currentGear);
    st.steerAngle = s.steerAngle;
    st.nitro = Math.round(s.nitro);
    st.isNitroActive = s.isNitroActive;
    st.isDrifting = s.isDrifting;
    st.driftScore = s.driftScore;
    st.carRotation = s.rotationY;
  });

  return (
    <group ref={carGroup} position={[SPAWN_POS.x, SPAWN_POS.y, SPAWN_POS.z]}>
      <CarModel
        isBraking={state.current.isBraking}
        isNitroActive={state.current.isNitroActive}
        isDrifting={state.current.isDrifting}
      />
    </group>
  );
}
