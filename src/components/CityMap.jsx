import React, { useEffect, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const cityColliders = [];

export function CityMap() {
  const { scene } = useGLTF('/city-models/terrain_retextured.glb');
  const floorRef = useRef();

  useEffect(() => {
    cityColliders.length = 0;

    scene.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = true;
      child.matrixAutoUpdate = false;
      child.updateMatrix();

      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if (mat.map) {
            mat.map.colorSpace = THREE.SRGBColorSpace;
            mat.map.anisotropy = 2;
          }
          if (mat.normalMap) mat.normalMap.anisotropy = 2;
          if (mat.name && (mat.name.includes('alpha') || mat.name.includes('cutout'))) {
            mat.alphaTest = 0.5;
            mat.depthWrite = true;
          }
        });
      }

      if (child.geometry) {
        try {
          if (!child.geometry.boundsTree) child.geometry.computeBoundsTree({ maxLeafTris: 15 });
          if (!child.geometry.boundingSphere) child.geometry.computeBoundingSphere();
          cityColliders.push(child);
        } catch {}
      }
    });

    if (floorRef.current?.geometry) {
      const geo = floorRef.current.geometry;
      try {
        if (!geo.boundsTree) geo.computeBoundsTree({ maxLeafTris: 15 });
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        cityColliders.push(floorRef.current);
      } catch {}
    }
  }, [scene]);

  return (
    <group>
      <primitive object={scene} />
      <mesh ref={floorRef} position={[-135, -0.05, -240]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3200, 3200]} />
        <meshStandardMaterial color="#11161d" roughness={0.88} metalness={0.12} />
      </mesh>
    </group>
  );
}

useGLTF.preload('/city-models/terrain_retextured.glb');
