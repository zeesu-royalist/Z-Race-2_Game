import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const TARGET_CAR_LENGTH = 3.9;

const KNOWN_ORIENTATIONS = {
  'bmw_m4_f82_razor_2014__www.vecarz.com.glb': [0, Math.PI, 0],
  'dominus_-_rocket_league_car.glb': [0, -Math.PI / 2, 0],
  'ferrari_488_pista_widebody.glb': [0, -Math.PI / 2, 0]
};

// Zero-Allocation Instanced Tire Smoke Particle System
function TireSmokeEmitter({ isDrifting }) {
  const maxParticles = 35;
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const particles = useRef(
    Array.from({ length: maxParticles }, () => ({
      pos: new THREE.Vector3(0, -999, 0),
      vel: new THREE.Vector3(),
      scale: 0.1,
      life: 1.0,
      maxLife: 0.75,
      active: false
    }))
  );

  const nextSpawnIndex = useRef(0);
  const spawnTimer = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const pList = particles.current;
    const mesh = meshRef.current;
    if (!mesh) return;

    spawnTimer.current += dt;
    if (isDrifting && spawnTimer.current > 0.04) {
      spawnTimer.current = 0;
      const sides = [-0.64, 0.64];
      for (let s = 0; s < 2; s++) {
        const xOff = sides[s];
        const p = pList[nextSpawnIndex.current % maxParticles];
        nextSpawnIndex.current++;
        p.active = true;
        p.life = 0;
        p.maxLife = 0.5 + Math.random() * 0.3;
        p.scale = 0.18 + Math.random() * 0.12;
        p.pos.set(xOff + (Math.random() - 0.5) * 0.15, 0.10 + Math.random() * 0.05, -1.48 - Math.random() * 0.2);
        p.vel.set((Math.random() - 0.5) * 0.5 + (xOff > 0 ? 0.3 : -0.3), 0.6 + Math.random() * 0.5, -1.2 - Math.random() * 1.0);
      }
    }

    let needsUpdate = false;
    for (let i = 0; i < maxParticles; i++) {
      const p = pList[i];
      if (!p.active) {
        dummy.position.set(0, -999, 0);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      needsUpdate = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        dummy.position.set(0, -999, 0);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      const progress = p.life / p.maxLife;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;
      dummy.position.copy(p.pos);
      dummy.scale.setScalar(p.scale * (1.0 + progress * 2.6));
      dummy.rotation.x += dt * 0.6;
      dummy.rotation.y += dt * 0.9;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    if (needsUpdate || isDrifting) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, maxParticles]}>
      <planeGeometry args={[0.32, 0.32]} />
      <meshBasicMaterial color="#d2dce6" transparent opacity={0.34} depthWrite={false} />
    </instancedMesh>
  );
}

function UniversalCarGLB({ url }) {
  const { scene } = useGLTF(url);

  const adapted = useMemo(() => {
    const root = SkeletonUtils.clone(scene);
    const fileName = (url || '').split('/').pop();

    root.traverse((node) => {
      const name = (node.name || '').toLowerCase();
      if (name.includes('shadow') || (name.includes('ground') && !name.includes('compound'))) {
        node.visible = false;
      }
      if (node.isMesh) {
        const isGlass = name.includes('glass') || name.includes('window') || name.includes('windshield');
        const isInterior = name.includes('interior') || name.includes('seat') || name.includes('steering');
        node.castShadow = !isGlass && !isInterior;
        node.receiveShadow = false;

        if (node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach((mat) => {
            if (mat.map) {
              mat.map.colorSpace = THREE.SRGBColorSpace;
              mat.map.anisotropy = 2;
              mat.map.needsUpdate = true;
            }
            const matName = (mat.name || '').toLowerCase();
            if (fileName.includes('fenomeno')) {
              if (mat.name === 'Paint' || matName.includes('paint')) {
                mat.roughness = 0.18; mat.metalness = 0.55;
                if ('clearcoat' in mat) mat.clearcoat = 1.0;
                if ('clearcoatRoughness' in mat) mat.clearcoatRoughness = 0.08;
              } else if (mat.name === 'Coloured') {
                mat.roughness = 0.35; mat.metalness = 0.3;
              }
            } else if (mat.name === 'GREEN_car_paint' || matName.includes('green_car_paint')) {
              mat.color.set('#15803d'); mat.roughness = 0.2; mat.metalness = 0.5;
              if ('clearcoat' in mat) mat.clearcoat = 1.0;
            } else if (mat.name === 'Coloured' && fileName.includes('ferrari')) {
              mat.color.set('#1e293b'); mat.roughness = 0.35; mat.metalness = 0.5;
            } else if (mat.name === 'chassis.011' || (fileName.includes('bmw') && matName.includes('chassis'))) {
              mat.color.set('#c8d0dc'); mat.roughness = 0.22; mat.metalness = 0.75;
              if ('clearcoat' in mat) mat.clearcoat = 0.9;
            } else if (fileName.includes('dominus')) {
              if (mat.name === 'Window') {
                mat.color.set('#1a2634'); mat.transparent = true; mat.opacity = 0.45; mat.roughness = 0.1;
              } else if (mat.name === 'Cristiano' || mat.name === 'Tread') {
                mat.color.set('#1a1a1a'); mat.roughness = 0.88; mat.metalness = 0.08;
              }
            }

            if (matName.includes('window') || matName.includes('glass') || matName.includes('windshield')) {
              if (!mat.map && (mat.color.getHex() === 0 || mat.color.getHex() === 0xffffff)) {
                mat.color.set('#141c26'); mat.transparent = true; mat.opacity = 0.42; mat.roughness = 0.1; mat.metalness = 0.2;
              }
            } else if (!mat.map && mat.color.getHex() === 0) {
              const isTire = matName.includes('tire') || matName.includes('tyre') || matName.includes('tread') || matName.includes('rubber');
              const isBody = matName.includes('paint') || matName.includes('body') || matName.includes('chassis') || matName.includes('car');
              if (isBody) { mat.color.set('#242b35'); mat.roughness = 0.25; mat.metalness = 0.6; }
              else if (isTire) { mat.color.set('#1a1a1a'); mat.roughness = 0.85; mat.metalness = 0.05; }
              else { mat.color.set('#202328'); mat.roughness = Math.max(0.3, mat.roughness); }
            }
            if (mat.metalness >= 0.85 && mat.roughness <= 0.05) mat.roughness = 0.12;
            mat.needsUpdate = true;
          });
        }
      }
    });

    root.updateMatrixWorld(true);
    const rawBox = new THREE.Box3().setFromObject(root);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);

    const explicitRot = KNOWN_ORIENTATIONS[fileName];
    if (explicitRot) {
      root.rotation.set(explicitRot[0], explicitRot[1], explicitRot[2]);
    } else if (rawSize.x > rawSize.z * 1.3 && rawSize.x > rawSize.y) {
      root.rotation.y = -Math.PI / 2;
    } else if (rawSize.y > rawSize.z * 1.3 && rawSize.y > rawSize.x) {
      root.rotation.x = -Math.PI / 2;
    }

    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    root.position.set(-center.x, -box.min.y, -center.z);

    const wrapper = new THREE.Group();
    wrapper.name = 'CarUniversalWrapper';
    wrapper.add(root);
    wrapper.scale.setScalar(TARGET_CAR_LENGTH / size.z);
    wrapper.updateMatrixWorld(true);

    return { wrapper };
  }, [scene, url]);

  useEffect(() => {
    return () => {
      if (adapted?.wrapper) {
        adapted.wrapper.traverse((child) => {
          if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => { if (m && typeof m.dispose === 'function') m.dispose(); });
          }
        });
      }
    };
  }, [adapted]);

  return <primitive object={adapted.wrapper} />;
}

export function CarModel({
  isBraking = false,
  isNitroActive = false,
  isDrifting = false
}) {
  const carModelPath = useGameStore((s) => s.carModelPath);

  return (
    <group>
      {carModelPath && (
        <UniversalCarGLB url={carModelPath} />
      )}

      {/* Dynamic Tire Smoke Particles */}
      <TireSmokeEmitter isDrifting={isDrifting} />

      {/* Nitro Boost Thruster Flame */}
      {isNitroActive && (
        <group position={[0, 0.3, -1.9]}>
          <pointLight color="#00f0ff" intensity={6} distance={4} />
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.13, 1.3, 12]} />
            <meshBasicMaterial color="#00e5ff" transparent opacity={0.85} />
          </mesh>
        </group>
      )}

      {/* Taillight Brake Glow */}
      {isBraking && (
        <group position={[0, 0.42, -1.9]}>
          <pointLight color="#ff0022" intensity={6} distance={4} />
        </group>
      )}
    </group>
  );
}
