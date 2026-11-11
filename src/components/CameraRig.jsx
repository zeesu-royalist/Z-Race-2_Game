import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { inputState } from './Car';

const TWO_PI = Math.PI * 2;
const THREE_PI = Math.PI * 3;

// 3 Dedicated Camera Angles: Close, Far, Aerial (frozen singletons, 0 per-frame GC)
const CAMERA_DEFAULTS = {
  close: Object.freeze({ dist: 4.7, height: 1.45, fov: 56, lookHeight: 0.85 }),
  far: Object.freeze({ dist: 6.8, height: 1.85, fov: 58, lookHeight: 0.95 }),
  aerial: Object.freeze({ dist: 8.6, height: 3.4, fov: 60, lookHeight: 0.65 })
};

export function getCameraDefaults(mode) {
  return CAMERA_DEFAULTS[mode] || CAMERA_DEFAULTS.close;
}

export function CameraRig() {
  const { camera, gl } = useThree();

  const rig = useRef(null);
  if (!rig.current) {
    const { cameraMode, vehicleCamScale } = useGameStore.getState();
    const scale = vehicleCamScale || 1.0;
    const cfg = getCameraDefaults(cameraMode);
    rig.current = {
      camPos: new THREE.Vector3(390.53, 1.8, -36.45),
      lookAt: new THREE.Vector3(396.43, 1.2, -34.54),
      targetPos: new THREE.Vector3(),
      targetLook: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      distance: cfg.dist * scale,
      targetDist: cfg.dist * scale,
      lastMode: cameraMode,
      lastScale: scale,
      isDragging: false,
      lastInteractionTime: 0,
      prevX: 0,
      prevY: 0,
      touches: [],
      initialPinchDist: 0,
      initialPinchTargetDist: cfg.dist * scale,
      isRotated: false
    };
  }

  useEffect(() => {
    const dom = gl.domElement;
    if (!dom) return;
    dom.style.touchAction = 'none';

    const r = rig.current;
    const mq = window.matchMedia('(orientation: portrait) and (max-width: 1024px)');
    r.isRotated = mq.matches;
    const onMqChange = (e) => { r.isRotated = e.matches; };
    if (mq.addEventListener) mq.addEventListener('change', onMqChange);
    else if (mq.addListener) mq.addListener(onMqChange);

    const clampDist = (dist, scale) => THREE.MathUtils.clamp(dist, 1.8 * scale, 12.0 * scale);
    const getCamScale = () => useGameStore.getState().vehicleCamScale || 1.0;
    const findTouch = (id) => r.touches.findIndex((t) => t.id === id);

    const onPointerDown = (e) => {
      if (e.target !== dom && !dom.contains(e.target)) return;
      const idx = findTouch(e.pointerId);
      if (idx >= 0) {
        r.touches[idx].x = e.clientX;
        r.touches[idx].y = e.clientY;
      } else if (r.touches.length < 4) {
        r.touches.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
      }
      if (r.touches.length === 1) {
        r.isDragging = true;
        r.prevX = e.clientX;
        r.prevY = e.clientY;
      } else if (r.touches.length === 2) {
        const [t1, t2] = r.touches;
        r.initialPinchDist = Math.hypot(t1.x - t2.x, t1.y - t2.y);
        r.initialPinchTargetDist = r.targetDist;
      }
      r.lastInteractionTime = performance.now();
    };

    const onPointerMove = (e) => {
      if (!r.isDragging && r.touches.length === 0) return;
      const idx = findTouch(e.pointerId);
      if (idx >= 0) {
        r.touches[idx].x = e.clientX;
        r.touches[idx].y = e.clientY;
      }

      if (r.touches.length === 1 && r.isDragging) {
        const dx = r.isRotated ? (e.clientY - r.prevY) : (e.clientX - r.prevX);
        const dy = r.isRotated ? -(e.clientX - r.prevX) : (e.clientY - r.prevY);
        r.yaw -= dx * 0.0055;
        r.pitch = THREE.MathUtils.clamp(r.pitch + dy * 0.0045, -0.45, 0.95);
        r.prevX = e.clientX;
        r.prevY = e.clientY;
        r.lastInteractionTime = performance.now();
      } else if (r.touches.length === 2 && r.initialPinchDist > 0) {
        const [t1, t2] = r.touches;
        const pinch = Math.hypot(t1.x - t2.x, t1.y - t2.y);
        r.targetDist = clampDist(r.initialPinchTargetDist * (r.initialPinchDist / Math.max(1, pinch)), getCamScale());
        r.lastInteractionTime = performance.now();
      }
    };

    const onPointerUp = (e) => {
      const idx = findTouch(e.pointerId);
      if (idx >= 0) r.touches.splice(idx, 1);
      if (r.touches.length === 0) {
        r.isDragging = false;
      } else if (r.touches.length === 1) {
        r.prevX = r.touches[0].x;
        r.prevY = r.touches[0].y;
      }
      r.lastInteractionTime = performance.now();
    };

    const onWheel = (e) => {
      e.preventDefault();
      r.targetDist = clampDist(r.targetDist * (e.deltaY > 0 ? 1.10 : 0.90), getCamScale());
      r.lastInteractionTime = performance.now();
    };

    const onDblClick = () => {
      r.yaw = 0;
      r.pitch = 0;
      r.targetDist = getCameraDefaults(useGameStore.getState().cameraMode).dist * getCamScale();
    };

    const onBlur = () => {
      r.touches.length = 0;
      r.isDragging = false;
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('blur', onBlur);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('dblclick', onDblClick);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onMqChange);
      else if (mq.removeListener) mq.removeListener(onMqChange);
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', onBlur);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('dblclick', onDblClick);
    };
  }, [gl]);

  // Main 60-120 FPS Camera Dynamics Loop (Zero GC allocations)
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const r = rig.current;
    const { carPosition, carRotation, speed, isNitroActive, cameraMode, vehicleCamScale } = useGameStore.getState();

    const cx = carPosition[0], cy = carPosition[1], cz = carPosition[2];
    const camScale = vehicleCamScale || 1.0;
    const camCfg = getCameraDefaults(cameraMode);

    if (r.lastMode !== cameraMode || r.lastScale !== camScale) {
      r.lastMode = cameraMode;
      r.lastScale = camScale;
      r.targetDist = camCfg.dist * camScale;
    }

    const scaledDist = camCfg.dist * camScale;
    const scaledHeight = camCfg.height * (1 + (camScale - 1) * 0.68);
    const scaledLookHeight = camCfg.lookHeight * (1 + (camScale - 1) * 0.42);
    const speedKmH = Math.abs(speed);
    const isDriving = speedKmH > 2.5 || inputState.forward || inputState.backward || inputState.left || inputState.right;

    // Auto-recenter when driving
    if (!r.isDragging && isDriving && (performance.now() - r.lastInteractionTime) > 300) {
      const yawDiff = ((r.yaw % TWO_PI) + THREE_PI) % TWO_PI - Math.PI;
      const returnSpeed = 3.2 + Math.min(speedKmH / 30, 4.5);
      r.yaw = yawDiff * (1 - Math.min(1, returnSpeed * dt));
      r.pitch = THREE.MathUtils.lerp(r.pitch, 0, Math.min(1, 3.8 * dt));
      r.targetDist = THREE.MathUtils.lerp(r.targetDist, scaledDist, Math.min(1, 3.2 * dt));
    }

    r.distance = THREE.MathUtils.lerp(r.distance, r.targetDist, Math.min(1, 10.0 * dt));

    const camAzimuth = carRotation + Math.PI + r.yaw;
    const horizDist = r.distance * Math.cos(r.pitch);
    const vertDist = r.distance * Math.sin(r.pitch);
    const clampedY = Math.max(cy + 0.35 * camScale, cy + scaledHeight + vertDist);

    r.targetPos.set(
      cx + horizDist * Math.sin(camAzimuth),
      clampedY,
      cz + horizDist * Math.cos(camAzimuth)
    );

    r.targetLook.set(
      cx + 0.3 * Math.sin(carRotation),
      cy + scaledLookHeight + Math.max(0, vertDist * 0.2),
      cz + 0.3 * Math.cos(carRotation)
    );

    // Dynamic FOV (Only update projection matrix when FOV changes)
    const targetFov = camCfg.fov + Math.min(1.0, speed / 240) * 3.5 + (isNitroActive ? 2.5 : 0);
    const newFov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, 6.0 * dt));
    if (Math.abs(camera.fov - newFov) > 0.015) {
      camera.fov = newFov;
      camera.updateProjectionMatrix();
    }

    const snapLimit = 35 * camScale;
    if (r.camPos.distanceToSquared(r.targetPos) > snapLimit * snapLimit) {
      r.camPos.copy(r.targetPos);
      r.lookAt.copy(r.targetLook);
    } else {
      const speedFactor = Math.min(1.0, speedKmH / 160);
      const camLerp = Math.min(1, (r.isDragging ? 22.0 : 14.0 + speedFactor * 14.0) * dt);
      const lookLerp = Math.min(1, (r.isDragging ? 24.0 : 18.0 + speedFactor * 12.0) * dt);
      r.camPos.lerp(r.targetPos, camLerp);
      r.lookAt.lerp(r.targetLook, lookLerp);
    }

    camera.position.copy(r.camPos);
    camera.lookAt(r.lookAt);
  });

  return null;
}
