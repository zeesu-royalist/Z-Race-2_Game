import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const TARGET_CAR_LENGTH = 3.9;

export const KNOWN_ORIENTATIONS = {
  'bmw_m4_f82_razor_2014__www.vecarz.com.glb': [0, Math.PI, 0],
  'dominus_-_rocket_league_car.glb': [0, -Math.PI / 2, 0],
  'ferrari_488_pista_widebody.glb': [0, -Math.PI / 2, 0],
  'boat.glb': [0, Math.PI, 0],
  'tow_boat.glb': [0, 0, 0],
  'aquitaine_-_french_ship.glb': [0, -Math.PI / 2, 0],
  'helicopter.glb': [0, -Math.PI / 2, 0],
  'sh-60b_seahawk_helicopter.glb': [0, 0, 0]
};

export function spinRotors(rotors, speedRad, dt) {
  if (!rotors || rotors.length === 0) return;
  for (let i = 0; i < rotors.length; i++) {
    rotors[i].obj.rotation[rotors[i].axis] += speedRad * rotors[i].speedMul * dt;
  }
}

function centerGeometryOnMean(mesh) {
  const geo = mesh.geometry.clone();
  const pos = geo.attributes.position;
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < pos.count; i++) {
    sx += pos.getX(i); sy += pos.getY(i); sz += pos.getZ(i);
  }
  const n = Math.max(1, pos.count);
  const [cx, cy, cz] = [sx / n, sy / n, sz / n];
  geo.translate(-cx, -cy, -cz);
  mesh.geometry = geo;
  mesh.position.set(cx, cy, cz);
  return geo;
}

function setupHelicopterRotors(root, fileName) {
  const rotors = [];
  root.updateMatrixWorld(true);

  if (fileName === 'sh-60b_seahawk_helicopter.glb') {
    const HUB = [2.4, 422, 257];
    const rotorGroup = new THREE.Group();
    rotorGroup.position.set(HUB[0], HUB[1], HUB[2]);
    const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
    const shiftMat = new THREE.Matrix4().makeTranslation(-HUB[0], -HUB[1], -HUB[2]);

    root.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const pos = child.geometry.attributes.position;
      if (!pos) return;
      const idx = child.geometry.index;
      const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
      const bodyIdx = [], rotorIdx = [];

      for (let t = 0; t < triCount; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3;
        const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        vA.fromBufferAttribute(pos, i0).applyMatrix4(child.matrixWorld);
        vB.fromBufferAttribute(pos, i1).applyMatrix4(child.matrixWorld);
        vC.fromBufferAttribute(pos, i2).applyMatrix4(child.matrixWorld);
        const cy = (vA.y + vB.y + vC.y) / 3;
        const cz = (vA.z + vB.z + vC.z) / 3;
        if (cy > 400 && cz > -620) rotorIdx.push(i0, i1, i2);
        else bodyIdx.push(i0, i1, i2);
      }

      if (rotorIdx.length > 0) {
        const bodyGeo = child.geometry.clone();
        bodyGeo.setIndex(bodyIdx);
        child.geometry = bodyGeo;

        const rGeo = child.geometry.clone();
        rGeo.setIndex(rotorIdx);
        rGeo.applyMatrix4(shiftMat.clone().multiply(child.matrixWorld));
        rotorGroup.add(new THREE.Mesh(rGeo, child.material));
      }
    });

    if (rotorGroup.children.length > 0) {
      root.add(rotorGroup);
      rotors.push({ obj: rotorGroup, axis: 'y', speedMul: 1.0 });
    }

    // Add matching spinning tail rotor assembly on the starboard tail pylon
    const tailGroup = new THREE.Group();
    tailGroup.position.set(34, 495, -915);
    const bladeMat = new THREE.MeshStandardMaterial({ color: '#1f252d', roughness: 0.45, metalness: 0.55 });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(8, 220, 20), bladeMat);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(8, 20, 220), bladeMat);
    tailGroup.add(b1, b2);
    root.add(tailGroup);
    rotors.push({ obj: tailGroup, axis: 'x', speedMul: 2.5 });
    return rotors;
  }

  root.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const nm = `${child.name || ''} ${child.parent?.name || ''}`.toLowerCase();
    const isMain = nm.includes('elise') || (fileName === 'helicopter.glb' && child.name === 'Object_19') || nm.includes('main_rotor');
    const isTail = nm.includes('tail_rotor') || (fileName === 'helicopter.glb' && child.name === 'Object_21') || (nm.includes('rotor') && !isMain);
    if (!isMain && !isTail) return;

    const geo = centerGeometryOnMean(child);
    geo.computeBoundingBox();
    const sz = new THREE.Vector3();
    geo.boundingBox.getSize(sz);
    const axis = sz.y <= sz.x && sz.y <= sz.z ? 'y' : (sz.x <= sz.z ? 'x' : 'z');
    rotors.push({ obj: child, axis, speedMul: isTail ? 2.4 : 1.0 });
  });

  return rotors;
}

// Zero-Allocation Reusable Instanced Wheel / Wake Emitter (tire smoke & water splash/wake)
function WheelParticleEmitter({ mode = 'smoke' }) {
  const isWater = mode === 'water';
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

    const st = useGameStore.getState();
    const isBoat = st.vehicleType === 'boat';
    const isHeli = st.vehicleType === 'helicopter';
    const shouldEmit = isHeli
      ? false
      : isWater
        ? (st.isInWater || isBoat) && Math.abs(st.speed) > 1.5
        : st.isDrifting && !st.isInWater && !isBoat;

    spawnTimer.current += dt;
    if (shouldEmit && spawnTimer.current > 0.04) {
      spawnTimer.current = 0;
      const halfLen = (st.vehicleLength || 3.9) * 0.44;
      const sideSpread = isBoat ? (st.vehicleLength || 10) * 0.12 : 0.68;
      const sides = [-sideSpread, sideSpread];
      for (let s = 0; s < 2; s++) {
        const xOff = sides[s];
        const p = pList[nextSpawnIndex.current % maxParticles];
        nextSpawnIndex.current++;
        p.active = true;
        p.life = 0;
        p.maxLife = isWater ? (isBoat ? 0.65 + Math.random() * 0.35 : 0.38 + Math.random() * 0.25) : 0.5 + Math.random() * 0.3;
        p.scale = isWater ? (isBoat ? 0.45 + Math.random() * 0.35 : 0.24 + Math.random() * 0.18) : 0.18 + Math.random() * 0.12;
        p.pos.set(
          xOff + (Math.random() - 0.5) * 0.3,
          (isWater ? (isBoat ? 0.15 : 0.28) : 0.10) + Math.random() * 0.08,
          isBoat ? -halfLen - Math.random() * 0.5 : (isWater ? 0.4 : -1.48) - Math.random() * 1.4
        );
        p.vel.set(
          (xOff > 0 ? 1 : -1) * (isWater ? (isBoat ? 2.2 : 1.4) : 0.35) + (Math.random() - 0.5) * 0.6,
          (isWater ? (isBoat ? 1.4 : 2.2) : 0.6) + Math.random() * 0.9,
          -1.4 - Math.random() * 1.2
        );
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
      if (isWater) p.vel.y -= 7.5 * dt; // splash arc gravity
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;
      dummy.position.copy(p.pos);
      dummy.scale.setScalar(p.scale * (1.0 + progress * (isWater ? 1.8 : 2.6)));
      dummy.rotation.x += dt * 0.6;
      dummy.rotation.y += dt * 0.9;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    if (needsUpdate || shouldEmit) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, maxParticles]}>
      <planeGeometry args={[0.32, 0.32]} />
      <meshBasicMaterial
        color={isWater ? '#b8f2ff' : '#d2dce6'}
        transparent
        opacity={isWater ? 0.52 : 0.34}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

export function adaptVehicleGLBScene(scene, url, { targetLength, waterlineOffset = 0, vehicleType = 'car' } = {}) {
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
      node.castShadow = vehicleType === 'car' && !isGlass && !isInterior;
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

  const rotors = vehicleType === 'helicopter' ? setupHelicopterRotors(root, fileName) : [];

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

  // Cars sit flush at y=0; boats sink partially by waterlineOffset so hull rests naturally in the water
  const ySink = vehicleType === 'boat' ? size.y * waterlineOffset : 0;
  root.position.set(-center.x, -box.min.y - ySink, -center.z);

  const finalLength = targetLength || (vehicleType === 'boat' ? 11.0 : vehicleType === 'helicopter' ? 11.5 : TARGET_CAR_LENGTH);
  const wrapper = new THREE.Group();
  wrapper.name = 'VehicleUniversalWrapper';
  wrapper.add(root);
  wrapper.scale.setScalar(finalLength / Math.max(0.01, size.z));
  wrapper.updateMatrixWorld(true);

  return { wrapper, rotors };
}

function UniversalCarGLB({ url, targetLength, waterlineOffset, vehicleType }) {
  const { scene } = useGLTF(url);

  const adapted = useMemo(
    () => adaptVehicleGLBScene(scene, url, { targetLength, waterlineOffset, vehicleType }),
    [scene, url, targetLength, waterlineOffset, vehicleType]
  );

  useFrame((_, delta) => {
    if (!adapted?.rotors?.length) return;
    const st = useGameStore.getState();
    const dt = Math.min(delta, 0.05);
    const rps = 16.0 + Math.min(12, Math.abs(st.speed || 0) * 0.05) + (st.isNitroActive ? 8.0 : 0);
    spinRotors(adapted.rotors, rps, dt);
  });

  useEffect(() => {
    return () => {
      // Keep shared boat, helicopter & parked-car materials alive for DockedVehicles
      const activeParkedPath = useGameStore.getState().parkedCar?.modelPath;
      const isShared = url && (url.startsWith('/boats/') || url.startsWith('/Helicopters/') || url === activeParkedPath);
      if (adapted?.wrapper && !isShared) {
        adapted.wrapper.traverse((child) => {
          if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => { if (m && typeof m.dispose === 'function') m.dispose(); });
          }
        });
      }
    };
  }, [adapted, url]);

  return <primitive object={adapted.wrapper} />;
}

export function CarModel({
  isBraking = false,
  isNitroActive = false
}) {
  const carModelPath = useGameStore((s) => s.carModelPath);
  const vehicleType = useGameStore((s) => s.vehicleType);
  const vehicleLength = useGameStore((s) => s.vehicleLength);
  const waterlineOffset = useGameStore((s) => s.waterlineOffset);

  return (
    <group>
      {carModelPath && (
        <UniversalCarGLB
          url={carModelPath}
          targetLength={vehicleLength}
          waterlineOffset={waterlineOffset}
          vehicleType={vehicleType}
        />
      )}

      {/* Dynamic Tire Smoke & Water Wake/Splash Particles */}
      <WheelParticleEmitter mode="smoke" />
      <WheelParticleEmitter mode="water" />

      {/* Nitro Boost Thruster Flame */}
      {isNitroActive && (
        <group position={[0, vehicleType === 'boat' ? 0.8 : 0.3, -(vehicleLength || 3.9) * 0.48]}>
          <pointLight color="#00f0ff" intensity={6} distance={4} />
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.13, 1.3, 12]} />
            <meshBasicMaterial color="#00e5ff" transparent opacity={0.85} />
          </mesh>
        </group>
      )}

      {/* Taillight Brake Glow */}
      {isBraking && vehicleType === 'car' && (
        <group position={[0, 0.42, -1.9]}>
          <pointLight color="#ff0022" intensity={6} distance={4} />
        </group>
      )}
    </group>
  );
}
