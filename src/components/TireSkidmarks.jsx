import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';

const MAX_SKID_MARKS = 80;
const HALF_TRACK = 0.64;
const REAR_AXLE_OFFSET = -1.4;
const SKID_WIDTH = 0.28;

const _skidMat4 = new THREE.Matrix4();
const _hiddenMat4 = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(0, -999, 0);

function writeSkidMatrix(mesh, index, x, y, z, rotY, scaleZ) {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const me = _skidMat4.elements;
  me[0] = SKID_WIDTH * c;  me[1] = 0; me[2] = -SKID_WIDTH * s; me[3] = 0;
  me[4] = -scaleZ * s;     me[5] = 0; me[6] = -scaleZ * c;     me[7] = 0;
  me[8] = 0;               me[9] = 1; me[10] = 0;              me[11] = 0;
  me[12] = x;              me[13] = y; me[14] = z;             me[15] = 1;
  mesh.setMatrixAt(index, _skidMat4);
}

/**
 * Zero-GC Instanced Tire Skidmark Trail.
 * Uses flat Float32 lifetimes, direct 4x4 matrix writes on spawn/expiry only, and idle draw-call hiding.
 */
export function TireSkidmarks() {
  const meshRef = useRef();
  const stateRef = useRef({
    life: new Float32Array(MAX_SKID_MARKS),
    nextIdx: 0,
    dropTimer: 0,
    activeCount: 0
  });

  const { geometry, material } = useMemo(() => ({
    geometry: new THREE.PlaneGeometry(1, 1),
    material: new THREE.MeshBasicMaterial({
      color: '#15171a',
      transparent: true,
      opacity: 0.48,
      depthWrite: false
    })
  }), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh) {
      for (let i = 0; i < MAX_SKID_MARKS; i++) mesh.setMatrixAt(i, _hiddenMat4);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;
      mesh.visible = false;
    }
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const st = stateRef.current;
    const { carPosition, carRotation, isDrifting, speed } = useGameStore.getState();

    // Early-out with zero draw calls when not drifting and no active trails remain
    if (!isDrifting && st.activeCount === 0) {
      if (mesh.visible) mesh.visible = false;
      return;
    }

    const dt = Math.min(delta, 0.05);
    let matrixDirty = false;

    st.dropTimer += dt;
    if (isDrifting && speed > 15 && st.dropTimer > 0.045) {
      st.dropTimer = 0;
      const sinR = Math.sin(carRotation);
      const cosR = Math.cos(carRotation);
      const scaleZ = Math.min(1.0, 0.45 * (speed / 40));
      const worldY = carPosition[1] + 0.015;
      const zShift = REAR_AXLE_OFFSET * sinR;
      const zCos = REAR_AXLE_OFFSET * cosR;

      for (let side = -1; side <= 1; side += 2) {
        const offX = side * HALF_TRACK;
        const slot = st.nextIdx % MAX_SKID_MARKS;
        st.nextIdx++;
        if (st.life[slot] <= 0) st.activeCount++;
        st.life[slot] = 5.0;

        writeSkidMatrix(
          mesh,
          slot,
          carPosition[0] + offX * cosR + zShift,
          worldY,
          carPosition[2] - offX * sinR + zCos,
          carRotation,
          scaleZ
        );
      }
      matrixDirty = true;
    }

    if (st.activeCount > 0) {
      const life = st.life;
      for (let i = 0; i < MAX_SKID_MARKS; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) {
          life[i] = 0;
          st.activeCount--;
          mesh.setMatrixAt(i, _hiddenMat4);
          matrixDirty = true;
        }
      }
    }

    mesh.visible = st.activeCount > 0;
    if (matrixDirty) mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={meshRef} args={[geometry, material, MAX_SKID_MARKS]} frustumCulled={false} />;
}
