import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, BOAT_SPAWN_POS, BOAT_SPAWN_ROT_Y, HELI_SPAWN_POS, HELI_SPAWN_ROT_Y } from '../store/gameStore';
import { CarModel } from './CarModel';
import { soundManager } from '../utils/AudioSystem';
import { cityColliders } from './CityMap';
import { rivalCarsSim } from './RivalCars';
import { WATER_SURFACE_Y, WATER_ZONE, getWaterHeight, getWaterNormal } from '../utils/waterSystem';
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
  nitro: false,
  descend: false
};

const KEY_MAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'backward', ArrowDown: 'backward',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
  ShiftLeft: 'nitro', ShiftRight: 'nitro',
  KeyQ: 'descend', KeyZ: 'descend', ControlLeft: 'descend'
};

const ACTION_KEYS = {
  KeyR: () => useGameStore.getState().triggerReset(),
  KeyC: () => useGameStore.getState().cycleCameraMode(),
  KeyM: () => useGameStore.getState().toggleSound(),
  KeyT: () => useGameStore.getState().cycleTimeOfDay(),
  KeyE: () => {
    const st = useGameStore.getState();
    const prompt = st.nearbyPrompt;
    if (prompt?.kind === 'board_boat' || prompt?.kind === 'board_heli') {
      st.boardWorldVehicle(
        prompt.vehicleType || (prompt.kind === 'board_heli' ? 'helicopter' : 'boat'),
        prompt.targetId,
        prompt.carParkSpot || st.carPosition,
        prompt.carRotY ?? st.carRotation
      );
    } else if (prompt?.kind === 'return_car') {
      st.returnToParkedCar(st.carPosition, st.carRotation);
    }
  }
};

const GEAR_MINS = [0, 0, 45, 85, 125, 165, 205];
const SPAWN_POS = new THREE.Vector3(395, 0.25, -35);
const SPAWN_ROT_Y = Math.PI * 0.4;

export function Car() {
  const carGroup = useRef();

  const resetSignal = useGameStore((s) => s.resetSignal);
  const teleportSignal = useGameStore((s) => s.teleportSignal);
  const currentCarId = useGameStore((s) => s.currentCarId);
  const vehicleType = useGameStore((s) => s.vehicleType);
  const soundEnabled = useGameStore((s) => s.soundEnabled);

  const activeCarCategoryRef = useRef('jdm_turbo');
  const tuningRef = useRef({ maxSpeed: 64, accelRate: 19, gripFactor: 0.9, turnMultiplier: 1.0 });
  const lastCrashSoundTime = useRef(0);
  const handledTeleportRef = useRef(0);
  const lastDryPoseRef = useRef({ pos: [395, 0.25, -35], rotY: Math.PI * 0.4, valid: false });

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
    nitroLocked: false,
    isInWater: false
  });

  const math = useRef({
    raycaster: new THREE.Raycaster(),
    downVec: new THREE.Vector3(0, -1, 0),
    forwardVec: new THREE.Vector3(),
    rightVec: new THREE.Vector3(),
    normalVec: new THREE.Vector3(0, 1, 0),
    tmpNorm: new THREE.Vector3(0, 1, 0),
    waterNorm: new THREE.Vector3(0, 1, 0),
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

  // Shared helper to place car cleanly on road and clear velocities/water state
  const placeCarAt = (x, y, z, rotY) => {
    const s = state.current;
    s.position.set(x, y, z);
    s.rotationY = rotY;
    s.pitch = s.roll = s.speed = s.steerAngle = s.angularVelocity = s.verticalVelocity = s.driftScore = s.driftTimer = 0;
    s.isDrifting = false;
    s.isGrounded = true;
    s.isInWater = false;
    s.currentGear = 1;
    s.rpm = 900;
    useGameStore.setState({ isInWater: false });
    if (carGroup.current) {
      carGroup.current.position.copy(s.position);
      carGroup.current.rotation.set(0, s.rotationY, 0);
    }
  };

  // Handle Vehicle Reset Signal (keeps player at boat home berth or current city district)
  useEffect(() => {
    if (resetSignal > 0) {
      const st = useGameStore.getState();
      if (st.vehicleType === 'boat' || st.vehicleType === 'helicopter') {
        const list = st.vehicleType === 'helicopter' ? st.dockedHelicopters : st.dockedBoats;
        const homeSlot = list.find((v) => v.id === st.currentCarId);
        const pos = homeSlot?.homePosition || (st.vehicleType === 'helicopter' ? HELI_SPAWN_POS : BOAT_SPAWN_POS);
        const rotY = homeSlot?.homeRotationY ?? (st.vehicleType === 'helicopter' ? HELI_SPAWN_ROT_Y : BOAT_SPAWN_ROT_Y);
        st.switchLock.cooldownUntil = performance.now() + 2000;
        st.switchLock.armedCarReturn = false;
        placeCarAt(pos[0], pos[1], pos[2], rotY);
      } else if (state.current.position.x > 330) {
        placeCarAt(SPAWN_POS.x, SPAWN_POS.y, SPAWN_POS.z, SPAWN_ROT_Y);
      } else {
        placeCarAt(-3.0, 0.3, 10.0, 0);
      }
    }
  }, [resetSignal]);

  // Audio mute/unmute sync
  useEffect(() => {
    soundManager.setEnabled(soundEnabled);
  }, [soundEnabled]);

  // Fast Travel & District Teleport Handler
  useEffect(() => {
    if (teleportSignal > handledTeleportRef.current) {
      handledTeleportRef.current = teleportSignal;
      const target = useGameStore.getState().teleportTarget;
      if (target) {
        placeCarAt(target.pos[0], target.pos[1], target.pos[2], target.rotY);
      }
    }
  }, [teleportSignal]);

  // Cache tuning and sound profile once when active vehicle changes
  useEffect(() => {
    const s = state.current;
    s.speed = s.angularVelocity = s.steerAngle = s.verticalVelocity = 0;
    const st = useGameStore.getState();
    const pool = st.vehicleType === 'boat' ? st.boats : st.vehicleType === 'helicopter' ? st.helicopters : st.cars;
    const vehicle = pool.find((c) => c.id === currentCarId);
    if (vehicle) {
      activeCarCategoryRef.current = vehicle.category || '';
      tuningRef.current = vehicle.tuning || { maxSpeed: 64, accelRate: 19, gripFactor: 0.9, turnMultiplier: 1.0 };
      soundManager.setProfile(vehicle.category || '');
    }
  }, [currentCarId, vehicleType]);

  // Highly Optimized 60-120 FPS Vehicle Physics Loop
  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const elapsed = clock.getElapsedTime();
    const s = state.current;
    const m = math.current;
    const st = useGameStore.getState();

    // Synchronously consume pending teleport before physics ticks (prevents 1-frame race after Zustand updates)
    if (st.teleportSignal > handledTeleportRef.current && st.teleportTarget) {
      handledTeleportRef.current = st.teleportSignal;
      placeCarAt(st.teleportTarget.pos[0], st.teleportTarget.pos[1], st.teleportTarget.pos[2], st.teleportTarget.rotY);
      st.switchLock.armedCarReturn = false;
    }

    const isBoat = st.vehicleType === 'boat';
    const isHeli = st.vehicleType === 'helicopter';
    const isPlane = Boolean(tuningRef.current?.flightMode === 'plane');

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

    // 2. STEERING DYNAMICS (Speed-sensitive; boats use heavier rudder response)
    const speedKmH = Math.abs(s.speed * 3.6);
    const speedFactor = Math.max(0.28, 1.0 - (speedKmH / 220) * 0.72);
    const maxSteer = (isBoat ? 0.50 : 0.58) * speedFactor;
    const steerSpeed = (isBoat ? 3.4 : 4.8) * dt;

    if (inputState.left) {
      s.steerAngle = Math.min(maxSteer, s.steerAngle + steerSpeed);
    } else if (inputState.right) {
      s.steerAngle = Math.max(-maxSteer, s.steerAngle - steerSpeed);
    } else {
      s.steerAngle = THREE.MathUtils.lerp(s.steerAngle, 0, (isBoat ? 5.0 : 8.5) * dt);
    }

    const tuning = tuningRef.current;
    const raceCountdown = st.raceCountdown;
    const isLockedByCountdown = raceCountdown !== null && raceCountdown > 0;

    const normalMaxSpeed = tuning.maxSpeed || (isBoat ? 28 : isPlane ? 96 : isHeli ? 62 : 64);
    const maxForwardSpeed = normalMaxSpeed * nitroMultiplier;
    const maxReverseSpeed = isBoat ? -12 : isPlane ? -5 : isHeli ? -22 : -15;
    const accelRate = (tuning.accelRate || (isBoat ? 12 : isPlane ? 24 : isHeli ? 22 : 19)) * nitroMultiplier;
    const brakeRate = isBoat ? 14 : isPlane ? 28 : isHeli ? 20 : 34;
    const naturalFriction = isBoat ? 2.1 : isPlane ? (s.isGrounded ? 2.8 : 1.4) : isHeli ? 5.0 : 3.6;

    // When nitro is NOT active, bleed excess boost speed back to normal top speed
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
      const floorSpd = isPlane && !s.isGrounded ? 12.0 : maxReverseSpeed;
      if (s.speed > (isPlane && !s.isGrounded ? 12.5 : 0.5)) {
        s.speed = Math.max(isPlane && !s.isGrounded ? 12.0 : 0, s.speed - brakeRate * dt);
        s.isBraking = true;
      } else if (!(isPlane && !s.isGrounded)) {
        s.speed = Math.max(floorSpd, s.speed - accelRate * 0.65 * dt);
      }
    } else if (isPlane && !s.isGrounded) {
      // Airborne fixed-wing glide maintains clean minimum cruise speed unless braking
      if (s.speed > 24.0) s.speed = Math.max(24.0, s.speed - naturalFriction * dt);
      else s.speed = Math.min(24.0, s.speed + 8.0 * dt);
    } else {
      if (s.speed > 0) s.speed = Math.max(0, s.speed - naturalFriction * dt);
      else if (s.speed < 0) s.speed = Math.min(0, s.speed + naturalFriction * dt);
    }

    let gripFactor = 1.0;
    if (inputState.handbrake && !isHeli) {
      gripFactor = isBoat ? 0.85 : 0.28;
      s.speed = Math.max(0, s.speed - (isBoat ? 9 : 12) * dt);
      s.isBraking = true;
    }

    // 4. YAW ROTATION & DRIFT
    const directionSign = s.speed < -0.5 ? -1 : 1;
    let turnRate = 0;
    if (isPlane) {
      const yawInput = (inputState.left ? 1 : 0) - (inputState.right ? 1 : 0);
      const authority = s.isGrounded ? Math.min(1, Math.abs(s.speed) / 14.0) * directionSign : 1.0;
      turnRate = yawInput * (s.isGrounded ? 0.95 : 1.15) * authority * (tuning.turnMultiplier || 1.15);
    } else if (isHeli) {
      const yawInput = (inputState.left ? 1 : 0) - (inputState.right ? 1 : 0);
      turnRate = yawInput * 1.45 * (tuning.turnMultiplier || 1.15);
    } else if (Math.abs(s.speed) > 0.2) {
      turnRate = s.steerAngle * (Math.abs(s.speed) / (isBoat ? 7.2 : 5.5)) * directionSign * (tuning.turnMultiplier || 1.0);
      if (inputState.handbrake && Math.abs(s.speed) > 5) turnRate *= isBoat ? 1.35 : 1.85;
    } else if (isBoat && Math.abs(s.steerAngle) > 0.02) {
      // Bow thruster pivot for low-speed harbor maneuvering
      turnRate = s.steerAngle * 0.65 * (tuning.turnMultiplier || 1.0);
    }

    s.angularVelocity = THREE.MathUtils.lerp(s.angularVelocity, turnRate, (isBoat || isHeli ? 5.5 : 9.5) * dt);
    s.rotationY += s.angularVelocity * dt;

    // 4.1 SUSTAINED DRIFT CHECK (Road cars only)
    const canDrift = !isBoat && !isHeli && s.isGrounded && speedKmH > 38 && (inputState.handbrake || (Math.abs(s.steerAngle) > 0.24 && speedKmH > 60));
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
    const { raceActive, raceFinished } = st;
    if (!isBoat && !isHeli && (raceActive || raceFinished)) {
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

    // 6. BVH SUSPENSION, WATER HYDRODYNAMICS & HELICOPTER VTOL FLIGHT
    if (isHeli) {
      if (s.isInWater) {
        s.isInWater = false;
        useGameStore.setState({ isInWater: false });
      }
      let floorY = WATER_SURFACE_Y + 0.18;
      if (cityColliders.length > 0) {
        m.rayOrigin.copy(s.position);
        m.rayOrigin.y += 1.5;
        m.raycaster.set(m.rayOrigin, m.downVec);
        m.raycaster.far = 220.0;
        m.groundHits.length = 0;
        m.raycaster.intersectObjects(cityColliders, false, m.groundHits);
        for (let i = 0; i < m.groundHits.length; i++) {
          const h = m.groundHits[i];
          const rawN = h.normal || h.face?.normal;
          if (!rawN) continue;
          m.tmpNorm.copy(rawN).transformDirection(h.object.matrixWorld);
          if (m.tmpNorm.y < 0 && h.object.material?.side === THREE.DoubleSide) m.tmpNorm.negate();
          if (m.tmpNorm.y > 0.45 && h.point.y <= s.position.y + 1.5) {
            floorY = Math.max(floorY, h.point.y + 0.02);
            break;
          }
        }
      }

      const climbSpd = tuning.climbRate || (isPlane ? 20 : 16);
      let targetVz = 0;
      if (isPlane) {
        const lift = THREE.MathUtils.clamp((s.speed - 16.0) / 16.0, 0, 1.35);
        if (inputState.handbrake && s.speed > 17.5) {
          targetVz = climbSpd * lift;
        } else if (inputState.descend) {
          targetVz = -climbSpd * 0.72;
        } else if (s.isGrounded) {
          targetVz = s.speed > 35.0 ? 5.5 * lift : 0;
        } else {
          targetVz = s.speed < 25.0 ? -(25.0 - s.speed) * 0.55 : 0;
        }
      } else if (inputState.handbrake) {
        targetVz = climbSpd;
      } else if (inputState.descend) {
        targetVz = -climbSpd * 0.85;
      } else if (isDrivingForward && s.position.y < floorY + 2.2) {
        // Gentle automatic hover lift when throttling forward from helipad
        targetVz = 4.2;
      }

      s.verticalVelocity = THREE.MathUtils.lerp(s.verticalVelocity, targetVz, (isPlane ? 4.2 : 5.5) * dt);
      s.position.y = Math.min(185.0, s.position.y + s.verticalVelocity * dt);
      if (s.position.y <= floorY) {
        s.position.y = floorY;
        if (s.verticalVelocity < 0) s.verticalVelocity = 0;
        s.isGrounded = true;
      } else {
        s.isGrounded = false;
      }

      const fwdFrac = THREE.MathUtils.clamp(s.speed / (normalMaxSpeed || 62), -0.6, 1.0);
      const targetPitch = isPlane
        ? (s.isGrounded
            ? (inputState.handbrake && s.speed > 16.0 ? -0.14 * Math.min(1, (s.speed - 16.0) / 10.0) : 0)
            : THREE.MathUtils.clamp(-s.verticalVelocity * 0.022, -0.34, 0.28))
        : (s.isGrounded ? 0 : fwdFrac * 0.21);
      const targetRoll = s.isGrounded
        ? 0
        : isPlane
          ? -s.angularVelocity * 0.36
          : -s.angularVelocity * 0.22 * (0.35 + 0.65 * Math.abs(fwdFrac));
      s.pitch = THREE.MathUtils.lerp(s.pitch, targetPitch, 5.5 * dt);
      s.roll = THREE.MathUtils.lerp(s.roll, targetRoll, 5.5 * dt);
    } else if (isBoat) {
      if (s.isInWater) {
        s.isInWater = false;
        useGameStore.setState({ isInWater: false });
      }
      const wY = getWaterHeight(s.position.x, s.position.z, elapsed) ?? WATER_SURFACE_Y;
      const speedRatio = Math.min(1, Math.max(0, s.speed) / (normalMaxSpeed || 28));
      const planingLift = speedRatio * 0.14;
      s.position.y = THREE.MathUtils.lerp(s.position.y, wY + planingLift, Math.min(1, 10.0 * dt));
      s.verticalVelocity = 0;
      s.isGrounded = true;

      getWaterNormal(s.position.x, s.position.z, elapsed, m.waterNorm);
      const wavePitch = m.waterNorm.z * Math.cos(s.rotationY) + m.waterNorm.x * Math.sin(s.rotationY);
      const waveRoll = -m.waterNorm.x * Math.cos(s.rotationY) + m.waterNorm.z * Math.sin(s.rotationY);
      const bowTrimPitch = -(speedRatio * 0.055 + (s.isNitroActive ? 0.035 : 0));
      const turnBankRoll = -s.angularVelocity * 0.08 * speedRatio;
      s.pitch = THREE.MathUtils.lerp(s.pitch, wavePitch * 1.15 + bowTrimPitch, 5.5 * dt);
      s.roll = THREE.MathUtils.lerp(s.roll, waveRoll * 1.15 + turnBankRoll, 5.5 * dt);
    } else {
      const waterY = getWaterHeight(s.position.x, s.position.z, elapsed);
      const inWaterNow = waterY !== null && s.position.y < waterY - 0.10;
      if (inWaterNow && !s.isInWater) {
        soundManager.playWaterSplash(Math.min(1.6, Math.abs(s.verticalVelocity) * 0.08 + Math.abs(s.speed) * 0.03 + 0.4));
      }
      if (inWaterNow !== s.isInWater) {
        s.isInWater = inWaterNow;
        useGameStore.setState({ isInWater: inWaterNow });
      }

      if (cityColliders.length > 0) {
        m.rayOrigin.copy(s.position);
        m.rayOrigin.y += 1.25;
        m.raycaster.set(m.rayOrigin, m.downVec);
        m.raycaster.far = 30.0;

        m.groundHits.length = 0;
        m.raycaster.intersectObjects(cityColliders, false, m.groundHits);
        const groundHits = m.groundHits;

        let validHit = null;
        for (let i = 0; i < groundHits.length; i++) {
          const h = groundHits[i];
          const rawN = h.normal || h.face?.normal;
          if (!rawN) continue;
          m.tmpNorm.copy(rawN).transformDirection(h.object.matrixWorld);
          if (m.tmpNorm.y < 0 && h.object.material?.side === THREE.DoubleSide) {
            m.tmpNorm.negate();
          }
          // Only upward-facing drivable surfaces within +1.05m step-up (avoids snapping onto bridges overhead)
          if (m.tmpNorm.y > 0.45 && h.point.y <= s.position.y + 1.05) {
            validHit = h;
            m.normalVec.copy(m.tmpNorm);
            break;
          }
        }

        if (validHit) {
          const targetY = validHit.point.y + 0.02;
          if (s.position.y - targetY <= 0.65) {
            s.position.y = THREE.MathUtils.lerp(s.position.y, targetY, Math.min(1, 26.0 * dt));
            if (targetY - s.position.y > 0.12) {
              s.position.y = targetY - 0.12; // Prevent front chassis clipping below fast uphill ramps
            }
            s.verticalVelocity = 0;
            s.isGrounded = true;
            const slopeDot = m.normalVec.z * Math.cos(s.rotationY) + m.normalVec.x * Math.sin(s.rotationY);
            s.pitch = THREE.MathUtils.lerp(s.pitch, slopeDot * 0.85, 12.0 * dt);
          } else {
            // Airborne drop off quay/ramp or diving down toward water/riverbed
            s.isGrounded = false;
            s.verticalVelocity -= (s.isInWater ? 11.0 : 24.0) * dt;
            if (s.isInWater) s.verticalVelocity *= Math.exp(-4.5 * dt);
            s.position.y += s.verticalVelocity * dt;
            if (s.position.y <= targetY) {
              s.position.y = targetY;
              s.verticalVelocity = 0;
              s.isGrounded = true;
            }
          }
        } else {
          // Free fall (no fake Y=0 floor clamp so car always falls smoothly onto sunken terrain or water)
          s.isGrounded = false;
          s.verticalVelocity -= (s.isInWater ? 11.0 : 24.0) * dt;
          if (s.isInWater) s.verticalVelocity *= Math.exp(-4.5 * dt);
          s.position.y = Math.max(-12.0, s.position.y + s.verticalVelocity * dt);
        }

        // Hydrodynamic drag & wave rock while in Seine River water
        if (s.isInWater) {
          s.speed *= Math.exp(-2.8 * dt);
          const maxWaterSpd = s.position.y < waterY - 0.65 ? 8.0 : 14.0;
          if (s.speed > maxWaterSpd) s.speed = maxWaterSpd;
          else if (s.speed < -6.0) s.speed = -6.0;
          getWaterNormal(s.position.x, s.position.z, elapsed, m.waterNorm);
          const wavePitch = m.waterNorm.z * Math.cos(s.rotationY) + m.waterNorm.x * Math.sin(s.rotationY);
          const waveRoll = -m.waterNorm.x * Math.cos(s.rotationY) + m.waterNorm.z * Math.sin(s.rotationY);
          s.pitch = THREE.MathUtils.lerp(s.pitch, wavePitch * 1.4, 5.0 * dt);
          s.roll = THREE.MathUtils.lerp(s.roll, waveRoll * 1.4, 5.0 * dt);
        } else {
          s.roll = THREE.MathUtils.lerp(s.roll, 0, 8.0 * dt);
        }
      }
    }

    // Shared Wall / Building Collision (skips high-altitude flying helicopters above buildings)
    if (cityColliders.length > 0 && Math.abs(s.speed) > 2 && (!isHeli || s.position.y < 42)) {
      const checkHeights = isBoat ? [0.85, 3.0, 4.85] : isHeli ? [1.2, 2.8] : [0.85];
      const rayFar = isBoat || isHeli ? Math.max(2.6, (st.vehicleLength || 10.5) * 0.48) : 2.4;
      const hitLimit = isBoat || isHeli ? Math.max(2.2, (st.vehicleLength || 10.5) * 0.44) : 2.0;

      m.checkDir.copy(m.forwardVec);
      if (s.speed < 0) m.checkDir.negate();
      m.wallRaycaster.far = rayFar;

      let resolvedWall = false;
      for (let hi = 0; hi < checkHeights.length && !resolvedWall; hi++) {
        m.wallOrigin.copy(s.position);
        m.wallOrigin.y += checkHeights[hi];
        m.wallRaycaster.set(m.wallOrigin, m.checkDir);
        m.wallHits.length = 0;
        m.wallRaycaster.intersectObjects(cityColliders, false, m.wallHits);

        for (let i = 0; i < m.wallHits.length; i++) {
          const wh = m.wallHits[i];
          if (wh.distance >= hitLimit) break;
          const rawN = wh.normal || wh.face?.normal;
          if (!rawN) continue;
          m.tmpNorm.copy(rawN).transformDirection(wh.object.matrixWorld);
          if (Math.abs(m.tmpNorm.y) < 0.45) {
            const dot = m.checkDir.dot(m.tmpNorm);
            if (dot < -0.65) {
              soundManager.playCrash(Math.abs(s.speed) / 25);
              s.speed = -s.speed * 0.25;
              s.position.x += m.tmpNorm.x * 0.45;
              s.position.z += m.tmpNorm.z * 0.45;
            } else {
              soundManager.playCrash(Math.abs(s.speed) / 50);
              s.speed *= 0.8;
              s.position.x += m.tmpNorm.x * 0.25;
              s.position.z += m.tmpNorm.z * 0.25;
            }
            resolvedWall = true;
            break;
          }
        }
      }
    }

    // Open-world boundaries (Boats stay inside Seine Harbor; cars roam City + Paris)
    const minX = isBoat ? 342 : -750;
    const maxX = isBoat ? WATER_ZONE.maxX - 12 : 1380;
    const minZ = isBoat ? WATER_ZONE.minZ + 12 : -850;
    const maxZ = isBoat ? WATER_ZONE.maxZ - 12 : 350;
    if (s.position.x < minX) { s.position.x = minX + 1; s.speed = 0; }
    if (s.position.x > maxX) { s.position.x = maxX - 1; s.speed = 0; }
    if (s.position.z < minZ) { s.position.z = minZ + 1; s.speed = 0; }
    if (s.position.z > maxZ) { s.position.z = maxZ - 1; s.speed = 0; }

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
    if (isHeli || isBoat) {
      const topKmH = Math.max(40, (tuningRef.current?.maxSpeed || 65) * 3.6);
      rpm = 1200 + Math.min(1, speedKmH / topKmH) * 6300 + (isDrivingForward ? 500 : 0);
    } else if (gear === 'R') {
      rpm = 900 + (Math.abs(speedKmH) / 50) * 5500;
    } else {
      const gearMin = gear === 1 ? 0 : GEAR_MINS[gear];
      const normGearSpeed = Math.max(0, Math.min(1, (speedKmH - gearMin) / (gearMaxSpeed - gearMin)));
      rpm = 900 + normGearSpeed * 6800 + (isDrivingForward ? 300 : 0);
    }
    s.rpm = Math.min(8000, Math.max(900, rpm));
    if (!isHeli && !isBoat && s.currentGear !== gear && s.currentGear !== 'R' && gear !== 'R' && gear > s.currentGear && speedKmH > 25) {
      soundManager.playGearShift();
    }
    s.currentGear = gear;

    // Apply Transforms to 3D Car Root (includes slope pitch & water wave roll)
    if (carGroup.current) {
      carGroup.current.position.copy(s.position);
      carGroup.current.rotation.set(s.pitch, s.rotationY, s.roll, 'YXZ');
    }

    // Record last safe dry shoreline / road position for clean shore car-parking
    if (!isBoat && !s.isInWater && s.isGrounded && s.position.y > WATER_SURFACE_Y + 0.14) {
      lastDryPoseRef.current.pos[0] = s.position.x;
      lastDryPoseRef.current.pos[1] = s.position.y;
      lastDryPoseRef.current.pos[2] = s.position.z;
      lastDryPoseRef.current.rotY = s.rotationY;
      lastDryPoseRef.current.valid = true;
    }

    // Sound Engine Update
    soundManager.updateEngine(s.rpm, isDrivingForward, speedKmH, activeCarCategoryRef.current);
    soundManager.updateDrift(!isHeli && !isBoat && s.isDrifting, s.driftIntensity);
    soundManager.updateNitro(s.isNitroActive);

    // Update Store Telemetry directly (Zero GC heap churn)
    st.carPosition[0] = s.position.x;
    st.carPosition[1] = s.position.y;
    st.carPosition[2] = s.position.z;
    st.speed = Math.round(speedKmH);
    st.rpm = Math.round(s.rpm);
    st.gear = isHeli ? `${Math.max(0, Math.round(s.position.y))}M` : String(s.currentGear);
    st.steerAngle = s.steerAngle;
    st.nitro = Math.round(s.nitro);
    st.isNitroActive = s.isNitroActive;
    st.isDrifting = s.isDrifting;
    st.driftScore = s.driftScore;
    st.carRotation = s.rotationY;
    st.isInWater = s.isInWater;

    // Universal Manual Proximity Prompt (never auto-transfers; user confirms via ENTER button or [E])
    if (!st.raceActive) {
      let best = null;
      let bestDist = Infinity;
      const worldVehicles = [...st.dockedBoats, ...st.dockedHelicopters];
      for (let i = 0; i < worldVehicles.length; i++) {
        const v = worldVehicles[i];
        if (v.vehicleType === st.vehicleType && v.id === st.currentCarId) continue;
        if (Math.abs(s.position.y - v.position[1]) > 8.5) continue;
        const d = Math.hypot(s.position.x - v.position[0], s.position.z - v.position[2]);
        if (d <= 24.0 && d < bestDist) {
          bestDist = d;
          best = { type: 'world', item: v };
        }
      }
      if (st.vehicleType !== 'car' && st.parkedCar) {
        const p = st.parkedCar;
        const dCar = Math.hypot(s.position.x - p.position[0], s.position.z - p.position[2]);
        if (dCar <= 24.0 && Math.abs(s.position.y - p.position[1]) <= 8.5 && dCar < bestDist) {
          best = { type: 'car', item: p };
        }
      }

      if (best?.type === 'world') {
        const v = best.item;
        const useCurrent = !s.isInWater && s.position.y > WATER_SURFACE_Y + 0.14;
        const parkSpot = useCurrent
          ? [s.position.x, s.position.y, s.position.z]
          : (lastDryPoseRef.current.valid ? [...lastDryPoseRef.current.pos] : [...v.pierPark]);
        const parkRot = useCurrent ? s.rotationY : (lastDryPoseRef.current.valid ? lastDryPoseRef.current.rotY : Math.PI * 0.5);
        const kind = v.vehicleType === 'helicopter' ? 'board_heli' : 'board_boat';
        const vehicleNoun = v.flightMode === 'plane' ? 'Plane' : v.vehicleType === 'helicopter' ? 'Helicopter' : 'Boat';
        if (st.nearbyPrompt?.kind !== kind || st.nearbyPrompt?.targetId !== v.id) {
          st.setNearbyPrompt({
            kind,
            vehicleType: v.vehicleType,
            vehicleNoun,
            targetId: v.id,
            label: v.name,
            carParkSpot: parkSpot,
            carRotY: parkRot
          });
        } else {
          st.nearbyPrompt.carParkSpot = parkSpot;
          st.nearbyPrompt.carRotY = parkRot;
        }
      } else if (best?.type === 'car') {
        const p = best.item;
        if (st.nearbyPrompt?.kind !== 'return_car' || st.nearbyPrompt?.targetId !== p.carId) {
          st.setNearbyPrompt({
            kind: 'return_car',
            vehicleType: 'car',
            vehicleNoun: 'Car',
            targetId: p.carId,
            label: p.name
          });
        }
      } else if (st.nearbyPrompt) {
        st.setNearbyPrompt(null);
      }
    } else if (st.nearbyPrompt) {
      st.setNearbyPrompt(null);
    }
  });

  return (
    <group ref={carGroup} position={[SPAWN_POS.x, SPAWN_POS.y, SPAWN_POS.z]} rotation={[0, SPAWN_ROT_Y, 0]}>
      <CarModel
        isBraking={state.current.isBraking}
        isNitroActive={state.current.isNitroActive}
        isDrifting={state.current.isDrifting}
      />
    </group>
  );
}
