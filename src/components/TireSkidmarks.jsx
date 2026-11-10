import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';

const MAX_SKID_MARKS = 80;

/**
 * Ultra-Lightweight, Zero-GC Instanced Tire Skidmark Trail
 * Renders authentic dark rubber burn marks on the asphalt during power drifts.
 */
export function TireSkidmarks() {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Pre-allocated ring buffer
  const marks = useRef(
    Array.from({ length: MAX_SKID_MARKS }, () => ({
      pos: new THREE.Vector3(0, -999, 0),
      rotY: 0,
      opacity: 0,
      life: 0,
      maxLife: 6.0,
      active: false
    }))
  );

  const nextIndex = useRef(0);
  const dropTimer = useRef(0);

  const math = useRef({
    carPos: new THREE.Vector3(),
    sinR: 0,
    cosR: 0
  });

  // Initialize hidden instances once on mount (avoids resetting 120 matrices every frame)
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    dummy.position.set(0, -999, 0);
    dummy.scale.setScalar(0);
    dummy.updateMatrix();

    for (let i = 0; i < MAX_SKID_MARKS; i++) {
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const mesh = meshRef.current;
    if (!mesh) return;

    const { carPosition, carRotation, isDrifting, speed } = useGameStore.getState();
    const m = math.current;
    const markList = marks.current;

    dropTimer.current += dt;

    // Drop skidmarks when drifting at sufficient speed
    const shouldDropSkid = isDrifting && speed > 15 && dropTimer.current > 0.045;

    if (shouldDropSkid) {
      dropTimer.current = 0;
      m.carPos.set(carPosition[0], carPosition[1], carPosition[2]);
      m.sinR = Math.sin(carRotation);
      m.cosR = Math.cos(carRotation);

      const tireOffsets = [-0.64, 0.64];

      for (let i = 0; i < 2; i++) {
        const offX = tireOffsets[i];
        const offZ = -1.4;

        const worldX = m.carPos.x + offX * m.cosR + offZ * m.sinR;
        const worldZ = m.carPos.z - offX * m.sinR + offZ * m.cosR;
        const worldY = m.carPos.y + 0.015;

        const mark = markList[nextIndex.current % MAX_SKID_MARKS];
        nextIndex.current++;

        mark.active = true;
        mark.pos.set(worldX, worldY, worldZ);
        mark.rotY = carRotation;
        mark.life = 5.0;
        mark.maxLife = 5.0;
      }
    }

    // Only update active skidmarks (O(active) instead of O(total) per frame)
    let needsUpdate = false;
    for (let i = 0; i < MAX_SKID_MARKS; i++) {
      const mark = markList[i];
      if (!mark.active) {
        continue; // Skip inactive marks!
      }

      needsUpdate = true;
      mark.life -= dt;
      if (mark.life <= 0) {
        mark.active = false;
        dummy.position.set(0, -999, 0);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      const currentScaleX = 0.28;
      const currentScaleZ = Math.min(1.0, 0.45 * (speed / 40));

      dummy.position.copy(mark.pos);
      dummy.rotation.set(-Math.PI / 2, 0, mark.rotY);
      dummy.scale.set(currentScaleX, currentScaleZ, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    if (needsUpdate || shouldDropSkid) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, MAX_SKID_MARKS]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        color="#15171a"
        transparent
        opacity={0.48}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
