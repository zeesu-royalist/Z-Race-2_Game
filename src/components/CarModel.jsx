import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const TARGET_CAR_LENGTH = 3.9;
let shipCustomCache = null;

function conformHullDecal(meshes, centerZ, centerY, width, height, sideSign, invS) {
  const geo = new THREE.PlaneGeometry(width, height, 24, 4);
  if (sideSign > 0) geo.rotateY(Math.PI / 2);
  else geo.rotateY(-Math.PI / 2);

  const pos = geo.attributes.position;
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3(-sideSign, 0, 0);
  let lastX = sideSign * 1.48;

  for (let i = 0; i < pos.count; i++) {
    const wy = pos.getY(i) + centerY;
    const wz = pos.getZ(i) + centerZ;
    origin.set(sideSign * 5.0, wy, wz);
    raycaster.set(origin, dir);
    const hits = raycaster.intersectObjects(meshes, false);
    const hitX = hits.length > 0 ? hits[0].point.x : lastX;
    lastX = hitX;
    pos.setXYZ(i, (hitX + sideSign * 0.016) * invS, wy * invS, wz * invS);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function getShipCustomAssets(origTex, meshes, invS) {
  if (shipCustomCache) return shipCustomCache;

  let hullMap = origTex || null;
  let decalMat = null;

  if (typeof document !== 'undefined') {
    const img = origTex?.image;
    if (img && (img.naturalWidth || img.width)) {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const hc = document.createElement('canvas');
      hc.width = w;
      hc.height = h;
      const hctx = hc.getContext('2d');
      hctx.drawImage(img, 0, 0, w, h);
      const imgData = hctx.getImageData(0, 0, w, h);
      const d = imgData.data;

      // Re-grade washed-out neutral pale steel into authentic matte Royal/French Navy Steel Blue-Grey
      // while preserving red keel, black boot-top, dark MD flight deck, yellow stripes & doors.
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const lum = (r + g + b) / 3;
        const wMix = Math.max(0, 1 - (max - min) / 28) * Math.max(0, Math.min(1, (lum - 85) / 55));
        if (wMix > 0) {
          d[i] = Math.round(r * (1 - wMix * 0.64));
          d[i + 1] = Math.round(g * (1 - wMix * 0.52));
          d[i + 2] = Math.round(b * (1 - wMix * 0.36));
        } else if (max - min >= 28) {
          // Deepen & enrich existing painted accents (crimson hull bottom, yellow deck markings)
          const boost = r > g + 25 ? 1.28 : 1.18;
          d[i] = Math.max(0, Math.min(255, Math.round(lum + (r - lum) * boost)));
          d[i + 1] = Math.max(0, Math.min(255, Math.round(lum + (g - lum) * boost)));
          d[i + 2] = Math.max(0, Math.min(255, Math.round(lum + (b - lum) * boost)));
        }
      }
      hctx.putImageData(imgData, 0, 0);

      const graded = new THREE.CanvasTexture(hc);
      graded.flipY = origTex.flipY;
      graded.wrapS = origTex.wrapS;
      graded.wrapT = origTex.wrapT;
      graded.colorSpace = THREE.SRGBColorSpace;
      graded.anisotropy = 8;
      graded.needsUpdate = true;
      hullMap = graded;
    }

    // Transparent naval stencil paint ("Zeesu Royalist") — no box or pasted banner background
    const dc = document.createElement('canvas');
    dc.width = 1024;
    dc.height = 128;
    const dctx = dc.getContext('2d');
    dctx.clearRect(0, 0, dc.width, dc.height);
    dctx.font = '800 84px "Arial Narrow", Arial, sans-serif';
    dctx.textAlign = 'center';
    dctx.textBaseline = 'middle';
    dctx.lineJoin = 'round';
    dctx.strokeStyle = 'rgba(10, 18, 30, 0.52)';
    dctx.lineWidth = 6;
    dctx.strokeText('Zeesu Royalist', 512, 64);
    dctx.fillStyle = 'rgba(241, 245, 249, 0.95)';
    dctx.fillText('Zeesu Royalist', 512, 64);

    const decalTex = new THREE.CanvasTexture(dc);
    decalTex.colorSpace = THREE.SRGBColorSpace;
    decalTex.anisotropy = 8;
    decalMat = new THREE.MeshStandardMaterial({
      map: decalTex,
      transparent: true,
      alphaTest: 0.05,
      depthWrite: false,
      roughness: 0.76,
      metalness: 0.10,
      polygonOffset: true,
      polygonOffsetFactor: -4
    });
  } else {
    decalMat = new THREE.MeshBasicMaterial({ color: '#f1f5f9' });
  }

  const hullMat = new THREE.MeshStandardMaterial({
    map: hullMap,
    color: '#ffffff',
    roughness: 0.74,
    metalness: 0.14,
    side: THREE.DoubleSide
  });

  shipCustomCache = {
    hullMat,
    decalMat,
    portGeo: conformHullDecal(meshes, 1.85, 0.90, 4.3, 0.54, 1, invS),
    stbdGeo: conformHullDecal(meshes, 1.85, 0.90, 4.3, 0.54, -1, invS)
  };
  return shipCustomCache;
}

function customizeAquitaineFrigate(wrapper) {
  let origTex = null;
  const meshes = [];
  wrapper.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    meshes.push(child);
    if (!origTex && child.material?.map?.image) origTex = child.material.map;
  });
  if (!meshes.length) return;

  const invS = 1 / Math.max(0.01, wrapper.scale.x);
  const { hullMat, decalMat, portGeo, stbdGeo } = getShipCustomAssets(origTex, meshes, invS);

  meshes.forEach((m) => {
    if (m.material?.map) {
      m.material = hullMat;
    } else if (m.material) {
      m.material = m.material.clone();
      m.material.color.multiplyScalar(0.62);
      m.material.roughness = 0.72;
      m.material.metalness = 0.14;
    }
  });

  wrapper.add(new THREE.Mesh(portGeo, decalMat), new THREE.Mesh(stbdGeo, decalMat));
}

export const KNOWN_ORIENTATIONS = {
  'bmw_m4_f82_razor_2014__www.vecarz.com.glb': [0, Math.PI, 0],
  'dominus_-_rocket_league_car.glb': [0, -Math.PI / 2, 0],
  'ferrari_488_pista_widebody.glb': [0, -Math.PI / 2, 0],
  'boat.glb': [0, Math.PI, 0],
  'tow_boat.glb': [0, 0, 0],
  'aquitaine_-_french_ship.glb': [0, -Math.PI / 2, 0],
  'helicopter.glb': [0, -Math.PI / 2, 0],
  'sh-60b_seahawk_helicopter.glb': [0, 0, 0],
  'axis_fighter_plane.glb': [0, -Math.PI / 2, 0],
  'stylized_war_plane.glb': [0, 0, 0]
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

  if (fileName === 'axis_fighter_plane.glb') {
    const propSources = [];
    root.traverse((child) => {
      if (child.isMesh && child.geometry && child.name === 'Object_17') propSources.push(child);
    });
    const tmpV = new THREE.Vector3();
    propSources.forEach((child) => {
      const baseGeo = child.geometry.clone();
      baseGeo.applyMatrix4(child.matrixWorld);
      const pos = baseGeo.attributes.position;
      const idx = baseGeo.index;
      const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
      const leftIdx = [], rightIdx = [];
      for (let t = 0; t < triCount; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3;
        const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        const cz = (pos.getZ(i0) + pos.getZ(i1) + pos.getZ(i2)) / 3;
        if (cz < 0) leftIdx.push(i0, i1, i2);
        else rightIdx.push(i0, i1, i2);
      }
      child.visible = false;
      [leftIdx, rightIdx].forEach((sideIdx) => {
        if (!sideIdx.length) return;
        const box = new THREE.Box3();
        for (let k = 0; k < sideIdx.length; k++) box.expandByPoint(tmpV.fromBufferAttribute(pos, sideIdx[k]));
        const c = new THREE.Vector3();
        box.getCenter(c);
        const sideGeo = baseGeo.clone();
        sideGeo.setIndex(sideIdx);
        sideGeo.translate(-c.x, -c.y, -c.z);
        const propMesh = new THREE.Mesh(sideGeo, child.material);
        propMesh.position.copy(c);
        root.add(propMesh);
        rotors.push({ obj: propMesh, axis: 'x', speedMul: 2.4 });
      });
    });
    return rotors;
  }

  if (fileName === 'stylized_war_plane.glb') {
    let fanNode = null;
    root.traverse((node) => {
      if ((node.name || '').toLowerCase() === 'fan_1') fanNode = node;
    });
    if (fanNode) {
      // Align spin axis to the taildragger's tilted +14.7deg nose propeller shaft
      const shaftPivot = new THREE.Group();
      shaftPivot.position.set(0, 7.855, 12.7);
      shaftPivot.rotation.x = -0.256;
      root.add(shaftPivot);
      shaftPivot.updateMatrixWorld(true);
      const invPivot = shaftPivot.matrixWorld.clone().invert();

      const spinGroup = new THREE.Group();
      shaftPivot.add(spinGroup);

      const propMeshes = [];
      fanNode.traverse((ch) => {
        if (ch.isMesh && ch.geometry) propMeshes.push(ch);
      });
      propMeshes.forEach((ch) => {
        const g = ch.geometry.clone();
        g.applyMatrix4(invPivot.clone().multiply(ch.matrixWorld));
        spinGroup.add(new THREE.Mesh(g, ch.material));
        ch.visible = false;
      });
      rotors.push({ obj: spinGroup, axis: 'z', speedMul: 2.6 });
    }
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

  const toRemove = [];
  root.traverse((node) => {
    const name = (node.name || '').toLowerCase();
    if (name.startsWith('plane_')) {
      toRemove.push(node);
      return;
    }
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

  toRemove.forEach((n) => n.parent?.remove(n));
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

  if (fileName === 'aquitaine_-_french_ship.glb') {
    customizeAquitaineFrigate(wrapper);
  }

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
