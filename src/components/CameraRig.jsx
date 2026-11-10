import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { inputState } from './Car';

// 3 Dedicated Camera Angles: Close, Far, Aerial
export function getCameraDefaults(mode) {
  if (mode === 'far') return { dist: 6.8, height: 1.85, fov: 58, lookHeight: 0.95 };
  if (mode === 'aerial') return { dist: 8.6, height: 3.4, fov: 60, lookHeight: 0.65 };
  return { dist: 4.7, height: 1.45, fov: 56, lookHeight: 0.85 };
}

export function CameraRig() {
  const cameraMode = useGameStore((s) => s.cameraMode);
  const { camera, gl } = useThree();

  const currentCamPos = useRef(new THREE.Vector3(-3, 3, -5));
  const currentLookAt = useRef(new THREE.Vector3(-3, 1, 15));
  const math = useRef({
    carPosVec: new THREE.Vector3(),
    targetCamPos: new THREE.Vector3(),
    targetLookAt: new THREE.Vector3()
  });

  const initialCfg = getCameraDefaults(cameraMode);
  const orbit = useRef({
    yaw: 0,
    pitch: 0,
    distance: initialCfg.dist,
    targetDist: initialCfg.dist,
    isDragging: false,
    lastInteractionTime: 0,
    prevX: 0,
    prevY: 0,
    activeTouches: new Map(),
    initialPinchDist: 0,
    initialPinchTargetDist: initialCfg.dist
  });

  useEffect(() => {
    orbit.current.targetDist = getCameraDefaults(cameraMode).dist;
  }, [cameraMode]);

  useEffect(() => {
    const dom = gl.domElement;
    if (!dom) return;
    dom.style.touchAction = 'none';

    const onPointerDown = (e) => {
      if (e.target !== dom && !dom.contains(e.target)) return;
      orbit.current.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (orbit.current.activeTouches.size === 1) {
        orbit.current.isDragging = true;
        orbit.current.prevX = e.clientX;
        orbit.current.prevY = e.clientY;
      } else if (orbit.current.activeTouches.size === 2) {
        const [t1, t2] = Array.from(orbit.current.activeTouches.values());
        orbit.current.initialPinchDist = Math.hypot(t1.x - t2.x, t1.y - t2.y);
        orbit.current.initialPinchTargetDist = orbit.current.targetDist;
      }
      orbit.current.lastInteractionTime = performance.now();
    };

    const onPointerMove = (e) => {
      const orb = orbit.current;
      if (!orb.isDragging && orb.activeTouches.size === 0) return;
      if (orb.activeTouches.has(e.pointerId)) orb.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (orb.activeTouches.size === 1 && orb.isDragging) {
        const isRotated = window.matchMedia('(orientation: portrait) and (max-width: 1024px)').matches;
        const dx = isRotated ? (e.clientY - orb.prevY) : (e.clientX - orb.prevX);
        const dy = isRotated ? -(e.clientX - orb.prevX) : (e.clientY - orb.prevY);
        orb.yaw -= dx * 0.0055;
        orb.pitch = THREE.MathUtils.clamp(orb.pitch + dy * 0.0045, -0.45, 0.95);
        orb.prevX = e.clientX;
        orb.prevY = e.clientY;
        orb.lastInteractionTime = performance.now();
      } else if (orb.activeTouches.size === 2 && orb.initialPinchDist > 0) {
        const [t1, t2] = Array.from(orb.activeTouches.values());
        const pinch = Math.hypot(t1.x - t2.x, t1.y - t2.y);
        orb.targetDist = THREE.MathUtils.clamp(orb.initialPinchTargetDist * (orb.initialPinchDist / Math.max(1, pinch)), 1.8, 12.0);
        orb.lastInteractionTime = performance.now();
      }
    };

    const onPointerUp = (e) => {
      const orb = orbit.current;
      orb.activeTouches.delete(e.pointerId);
      if (orb.activeTouches.size === 0) {
        orb.isDragging = false;
      } else if (orb.activeTouches.size === 1) {
        const remaining = Array.from(orb.activeTouches.values())[0];
        orb.prevX = remaining.x;
        orb.prevY = remaining.y;
      }
      orb.lastInteractionTime = performance.now();
    };

    const onWheel = (e) => {
      e.preventDefault();
      orbit.current.targetDist = THREE.MathUtils.clamp(orbit.current.targetDist * (e.deltaY > 0 ? 1.10 : 0.90), 1.8, 12.0);
      orbit.current.lastInteractionTime = performance.now();
    };

    const onDblClick = () => {
      orbit.current.yaw = 0;
      orbit.current.pitch = 0;
      orbit.current.targetDist = getCameraDefaults(cameraMode).dist;
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('dblclick', onDblClick);

    return () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('dblclick', onDblClick);
    };
  }, [gl, cameraMode]);

  // Main 60-120 FPS Camera Dynamics Loop
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const m = math.current;
    const orb = orbit.current;
    const { carPosition, carRotation, speed, isNitroActive } = useGameStore.getState();

    m.carPosVec.set(carPosition[0], carPosition[1], carPosition[2]);

    const camCfg = getCameraDefaults(cameraMode);
    const speedKmH = Math.abs(speed);
    const isDriving = speedKmH > 2.5 || inputState.forward || inputState.backward || inputState.left || inputState.right;

    // Auto-recenter when driving
    if (!orb.isDragging && isDriving && (performance.now() - orb.lastInteractionTime) > 300) {
      const yawDiff = Math.atan2(Math.sin(orb.yaw), Math.cos(orb.yaw));
      const returnSpeed = 3.2 + Math.min(speedKmH / 30, 4.5);
      orb.yaw = THREE.MathUtils.lerp(yawDiff, 0, returnSpeed * dt);
      orb.pitch = THREE.MathUtils.lerp(orb.pitch, 0, 3.8 * dt);
      orb.targetDist = THREE.MathUtils.lerp(orb.targetDist, camCfg.dist, 3.2 * dt);
    }

    orb.distance = THREE.MathUtils.lerp(orb.distance, orb.targetDist, 10.0 * dt);

    const camAzimuth = carRotation + Math.PI + orb.yaw;
    const horizDist = orb.distance * Math.cos(orb.pitch);
    const vertDist = orb.distance * Math.sin(orb.pitch);
    const clampedY = Math.max(m.carPosVec.y + 0.35, m.carPosVec.y + camCfg.height + vertDist);

    m.targetCamPos.set(
      m.carPosVec.x + horizDist * Math.sin(camAzimuth),
      clampedY,
      m.carPosVec.z + horizDist * Math.cos(camAzimuth)
    );

    m.targetLookAt.set(
      m.carPosVec.x + 0.3 * Math.sin(carRotation),
      m.carPosVec.y + camCfg.lookHeight + Math.max(0, vertDist * 0.2),
      m.carPosVec.z + 0.3 * Math.cos(carRotation)
    );

    // Dynamic FOV (Only update projection matrix when FOV changes)
    const targetFov = camCfg.fov + Math.min(1.0, speed / 240) * 3.5 + (isNitroActive ? 2.5 : 0);
    const newFov = THREE.MathUtils.lerp(camera.fov, targetFov, 6.0 * dt);
    if (Math.abs(camera.fov - newFov) > 0.015) {
      camera.fov = newFov;
      camera.updateProjectionMatrix();
    }

    const speedFactor = Math.min(1.0, speedKmH / 160);
    const camLerpSpeed = orb.isDragging ? 22.0 : 14.0 + speedFactor * 14.0;
    const lookLerpSpeed = orb.isDragging ? 24.0 : 18.0 + speedFactor * 12.0;

    if (currentCamPos.current.distanceTo(m.targetCamPos) > 35) {
      currentCamPos.current.copy(m.targetCamPos);
      currentLookAt.current.copy(m.targetLookAt);
    } else {
      currentCamPos.current.lerp(m.targetCamPos, camLerpSpeed * dt);
      currentLookAt.current.lerp(m.targetLookAt, lookLerpSpeed * dt);
    }

    camera.position.copy(currentCamPos.current);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}
