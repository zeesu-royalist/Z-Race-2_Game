import React, { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { useGameStore } from '../store/gameStore';
import { WATER_SURFACE_Y, WATER_BED_Y, WATER_ZONE, getWaterHeight } from '../utils/waterSystem';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const cityColliders = [];

const CITY_MODEL_URL = '/city-models/terrain_retextured.glb';
const PARIS_MODEL_URL = '/city-models/sports_car_racing_paris.glb';

// Placed cleanly East of current city (City max X = 273.3 -> Paris min X = 332.9)
const PARIS_POS = [815, -0.024, -118.0];
const PARIS_SCALE = 28;

// Bridge connecting Current City East Hwy (X=270.5..273.3, Z=-49.35) -> Paris West Blvd (X=349.7..354.5, Z=-49.35)
const BRIDGE_CENTER_X = 312.5;
const BRIDGE_LENGTH = 84;
const BRIDGE_Z = -49.35;
const BRIDGE_WIDTH = 8.8;

// Decorative / lightweight / floating meshes in Paris excluded from collision & BVH
const PARIS_NON_COLLIDABLE = ['zhibei', 'hulang', 'tong', 'guanggao', 'cao', 'shui', 'zhishi', 'jiantou', 'molde'];
const _tempBox = new THREE.Box3();

const WATERFRONT_DOCKS = [
  { id: 'west-marina', rampPos: [378, -2.519, -61.875], rampRotX: -0.2381, rampLen: 18.57, pierPos: [389, -4.68, -74.5], pierWidth: 30.0, cleatZ: -3.25, cleatXs: [-10, 0, 10], beaconZ: -51.6, apronY: 0.008 },
  { id: 'south-bay', rampPos: [755, -2.512, 128.55], rampRotX: 0.209, rampLen: 21.16, pierPos: [762, -4.68, 142.5], pierWidth: 26.0, cleatZ: 3.25, cleatXs: [-9, 0, 9], beaconZ: 116.8, apronY: 0.024 },
  { id: 'east-harbor', rampPos: [1145, -2.502, 52.55], rampRotX: 0.2099, rampLen: 21.16, pierPos: [1153, -4.68, 66.5], pierWidth: 26.0, cleatZ: 3.25, cleatXs: [-9, 0, 9], beaconZ: 40.8, apronY: 0.044 }
];

function createHarborMaterials() {
  if (typeof document === 'undefined') {
    const m = new THREE.MeshStandardMaterial({ color: '#333840', roughness: 0.85 });
    return { asphalt: m, bridgeAsphalt: m, pierDeck: m, stone: m, concrete: m, guardrail: m, iron: m, rubber: m };
  }

  let seed = 1337;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  const makePbr = (repeat, rotate, drawFn, bumpScale = 0.04) => {
    const sz = 256;
    const [c, b] = [document.createElement('canvas'), document.createElement('canvas')];
    c.width = c.height = b.width = b.height = sz;
    const [ctx, bctx] = [c.getContext('2d'), b.getContext('2d')];
    drawFn(ctx, bctx, sz);
    for (let i = 0; i < 3500; i++) {
      const [x, y, s, sh] = [rand() * sz, rand() * sz, 0.7 + rand() * 1.2, rand()];
      ctx.fillStyle = sh > 0.55 ? 'rgba(220,225,235,0.12)' : 'rgba(15,18,22,0.18)';
      ctx.fillRect(x, y, s, s);
      const bv = Math.round(90 + sh * 100);
      bctx.fillStyle = `rgb(${bv},${bv},${bv})`;
      bctx.fillRect(x, y, s, s);
    }
    const [map, bumpMap] = [new THREE.CanvasTexture(c), new THREE.CanvasTexture(b)];
    [map, bumpMap].forEach((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
      if (rotate) { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; }
      t.anisotropy = 4;
    });
    map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale, roughness: 0.88, metalness: 0.05 });
  };

  const makeAsphalt = (repeat, rotate) => makePbr(repeat, rotate, (ctx, bctx, sz) => {
    ctx.fillStyle = '#2d323a'; ctx.fillRect(0, 0, sz, sz);
    bctx.fillStyle = '#808080'; bctx.fillRect(0, 0, sz, sz);
    const g = ctx.createLinearGradient(0, 0, sz, 0);
    g.addColorStop(0.28, 'rgba(15,18,22,0.24)'); g.addColorStop(0.5, 'rgba(18,21,26,0)'); g.addColorStop(0.72, 'rgba(15,18,22,0.24)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, sz, sz);
    ctx.fillStyle = 'rgba(226,232,240,0.8)';
    ctx.fillRect(sz * 0.055, 0, 5, sz); ctx.fillRect(sz * 0.945 - 5, 0, 5, sz);
    ctx.fillStyle = 'rgba(235,185,70,0.85)';
    for (let y = 8; y < sz; y += 64) ctx.fillRect(sz * 0.5 - 2.5, y, 5, 34);
  });

  const makeTiles = (repeat, rows, cols, shift, baseRGB, bgHex, bumpScale) => makePbr(repeat, false, (ctx, bctx, sz) => {
    ctx.fillStyle = bgHex; ctx.fillRect(0, 0, sz, sz);
    bctx.fillStyle = '#585858'; bctx.fillRect(0, 0, sz, sz);
    const [rw, cw] = [sz / rows, sz / cols];
    for (let r = 0; r < rows; r++) {
      for (let col = -1; col <= cols; col++) {
        const [x, y, d] = [col * cw + (r % 2) * shift * cw, r * rw, Math.round((rand() - 0.5) * 20)];
        ctx.fillStyle = `rgb(${baseRGB[0] + d},${baseRGB[1] + d},${baseRGB[2] + d})`;
        ctx.fillRect(x + 1.5, y + 1.5, cw - 3, rw - 3);
        bctx.fillStyle = '#c4c4c4'; bctx.fillRect(x + 1.5, y + 1.5, cw - 3, rw - 3);
      }
    }
  }, bumpScale);

  return {
    asphalt: makeAsphalt([1, 3], false),
    bridgeAsphalt: makeAsphalt([1, 8], true),
    pierDeck: makeTiles([5, 1.4], 8, 8, 0, [80, 84, 90], '#474e57', 0.04),
    stone: makeTiles([3, 1.5], 8, 4, 0.5, [112, 108, 98], '#6c685e', 0.05),
    concrete: new THREE.MeshStandardMaterial({ color: '#7d838c', roughness: 0.9, metalness: 0.05 }),
    guardrail: new THREE.MeshStandardMaterial({ color: '#9ca4ae', roughness: 0.42, metalness: 0.68 }),
    iron: new THREE.MeshStandardMaterial({ color: '#242930', roughness: 0.52, metalness: 0.65 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#171a1f', roughness: 0.94, metalness: 0.04 })
  };
}

function GuardrailStrip({ xOffset, length, zShift = 0, mats }) {
  const n = Math.max(2, Math.floor(length / 3.8));
  return (
    <group position={[xOffset, 0, zShift]}>
      <mesh position={[0, 0.74, 0]} material={mats.guardrail}><boxGeometry args={[0.1, 0.24, length]} /></mesh>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[0, 0.54, -length / 2 + 0.8 + (i * (length - 1.6)) / (n - 1)]} material={mats.iron}>
          <boxGeometry args={[0.11, 0.68, 0.11]} />
        </mesh>
      ))}
    </group>
  );
}

function WaterfrontDock({ dock, mats }) {
  const goingSouth = dock.rampRotX > 0;
  const railLen = dock.rampLen - 3.6;
  const railZShift = goingSouth ? -1.4 : 1.4;
  const bumperZ = dock.cleatZ > 0 ? 3.56 : -3.56;
  const landCurbZ = dock.cleatZ > 0 ? -3.4 : 3.4;
  const rampLocalX = dock.rampPos[0] - dock.pierPos[0];
  const eastCurbStart = rampLocalX + 4.8;
  const halfW = dock.pierWidth / 2;

  return (
    <group>
      <group position={[dock.rampPos[0], dock.apronY, dock.beaconZ]}>
        <mesh userData={{ isCollider: true }} position={[0, -0.255, 0]} material={mats.concrete} receiveShadow><boxGeometry args={[9.0, 0.5, 4.6]} /></mesh>
        <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.asphalt} receiveShadow><planeGeometry args={[8.3, 4.6]} /></mesh>
      </group>

      <group position={dock.rampPos} rotation={[dock.rampRotX, 0, 0]}>
        <mesh userData={{ isCollider: true }} material={mats.concrete} receiveShadow><boxGeometry args={[9.0, 0.6, dock.rampLen]} /></mesh>
        <mesh position={[0, -3.1, 0]} material={mats.stone}><boxGeometry args={[8.2, 5.6, dock.rampLen - 0.6]} /></mesh>
        <mesh position={[0, 0.305, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.asphalt} receiveShadow><planeGeometry args={[8.3, dock.rampLen]} /></mesh>
        {[-1, 1].map((side) => (
          <React.Fragment key={side}>
            <mesh position={[side * 4.32, 0.38, 0]} material={mats.concrete}><boxGeometry args={[0.36, 0.2, dock.rampLen - 0.6]} /></mesh>
            <GuardrailStrip xOffset={side * 4.42} length={railLen} zShift={railZShift} mats={mats} />
          </React.Fragment>
        ))}
      </group>

      <group position={dock.pierPos}>
        <mesh userData={{ isCollider: true }} material={mats.concrete} receiveShadow><boxGeometry args={[dock.pierWidth, 0.6, 7.2]} /></mesh>
        <mesh position={[0, 0.306, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.pierDeck} receiveShadow><planeGeometry args={[dock.pierWidth - 0.35, 6.85]} /></mesh>
        <mesh position={[(eastCurbStart + halfW) / 2, 0.38, landCurbZ]} material={mats.concrete}><boxGeometry args={[Math.max(2, halfW - eastCurbStart), 0.22, 0.38]} /></mesh>
        <group position={[rampLocalX - 0.5, 0.3, dock.cleatZ > 0 ? 3.42 : -3.42]}>
          <mesh userData={{ isCollider: true }} position={[0, 0.62, 0]} material={mats.concrete}><boxGeometry args={[11.2, 1.25, 0.48]} /></mesh>
          <mesh position={[0, 1.32, 0]} material={mats.guardrail}><boxGeometry args={[11.4, 0.22, 0.16]} /></mesh>
        </group>
        {[-1, 1].map((s) => (
          <mesh key={s} userData={{ isCollider: true }} position={[s * (halfW - 0.2), 0.92, 0]} material={mats.concrete}><boxGeometry args={[0.44, 1.25, 7.2]} /></mesh>
        ))}
        {[-0.42, -0.14, 0.14, 0.42].map((fx) =>
          [-2.8, 2.8].map((pz) => (
            <mesh key={`${fx}-${pz}`} position={[dock.pierWidth * fx, -2.05, pz]} material={mats.stone}><cylinderGeometry args={[0.42, 0.5, 4.1, 10]} /></mesh>
          ))
        )}
        {dock.cleatXs.map((px) => (
          <group key={px}>
            <mesh position={[px, 0.52, dock.cleatZ]} material={mats.iron}><cylinderGeometry args={[0.17, 0.21, 0.44, 10]} /></mesh>
            <mesh position={[px, 0.76, dock.cleatZ]} material={mats.iron}><cylinderGeometry args={[0.25, 0.22, 0.1, 10]} /></mesh>
            <mesh position={[px, 0.16, bumperZ]} material={mats.rubber}><boxGeometry args={[2.6, 0.36, 0.26]} /></mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function createWaterRippleTexture() {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Rich tiled ripple bump/albedo detail
  ctx.fillStyle = '#80a8b8';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 160; i++) {
    const x = (i * 73) % size;
    const y = (i * 137) % size;
    const rx = 18 + (i % 5) * 8;
    const ry = 6 + (i % 3) * 4;
    const grad = ctx.createRadialGradient(x, y, 1, x, y, rx);
    grad.addColorStop(0, 'rgba(210, 245, 255, 0.28)');
    grad.addColorStop(0.5, 'rgba(130, 195, 220, 0.12)');
    grad.addColorStop(1, 'rgba(40, 100, 130, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function AnimatedRiverWater() {
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  const geoRef = useRef();
  const baseZRef = useRef(null);

  const rippleTexture = useMemo(() => createWaterRippleTexture(), []);
  const waterColor = timeOfDay === 'night' ? '#062133' : timeOfDay === 'sunset' ? '#0e4c63' : '#0b6d87';
  const emissiveColor = timeOfDay === 'night' ? '#031524' : timeOfDay === 'sunset' ? '#1a2d3a' : '#053545';

  useEffect(() => {
    const geo = geoRef.current;
    if (!geo) return;
    const pos = geo.attributes.position;
    if (!baseZRef.current) {
      baseZRef.current = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) baseZRef.current[i] = pos.getZ(i);
    }
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (rippleTexture) {
      rippleTexture.offset.x = (t * 0.025) % 1;
      rippleTexture.offset.y = (t * 0.016) % 1;
    }

    const geo = geoRef.current;
    if (!geo || !baseZRef.current) return;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // Plane is rotated -PI/2 around X: local X -> world X, local Y -> -world Z, local Z -> world Y
      const wx = WATER_ZONE.centerX + pos.getX(i);
      const wz = WATER_ZONE.centerZ - pos.getY(i);
      const waveH = getWaterHeight(wx, wz, t);
      if (waveH !== null) {
        pos.setZ(i, waveH - WATER_SURFACE_Y);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });

  return (
    <mesh
      position={[WATER_ZONE.centerX, WATER_SURFACE_Y, WATER_ZONE.centerZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry ref={geoRef} args={[WATER_ZONE.width, WATER_ZONE.depth, 76, 32]} />
      <meshStandardMaterial
        color={waterColor}
        emissive={emissiveColor}
        emissiveIntensity={0.35}
        map={rippleTexture}
        bumpMap={rippleTexture}
        bumpScale={0.18}
        roughness={0.11}
        metalness={0.48}
        transparent
        opacity={0.80}
        envMapIntensity={1.6}
      />
    </mesh>
  );
}

function attachBVH(mesh) {
  if (!mesh?.geometry) return;
  try {
    if (!mesh.geometry.boundsTree) mesh.geometry.computeBoundsTree({ maxLeafTris: 15 });
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    cityColliders.push(mesh);
  } catch {}
}

function processMapScene(root, { isParis = false } = {}) {
  if (!root) return;
  root.updateMatrixWorld(true);

  root.traverse((child) => {
    if (!child.isMesh) return;
    const nm = (child.name || '').toLowerCase();

    // Replace static flat Paris Seine plane with AnimatedRiverWater
    if (isParis && nm.includes('55_13_d_shui')) {
      child.visible = false;
      return;
    }

    // Open the Paris West Boulevard entry where the highway bridge connects
    if (isParis && nm.includes('luzhang')) {
      _tempBox.setFromObject(child);
      if (_tempBox.max.x < 680) {
        child.visible = false;
        return;
      }
    }

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

        const matName = (mat.name || '').toLowerCase();
        const isCutout =
          matName.includes('alpha') ||
          matName.includes('cutout') ||
          matName.includes('zhibei') ||
          matName.includes('tiezhalan') ||
          matName.includes('cao');

        if (isCutout) {
          mat.alphaTest = 0.38;
          mat.transparent = false;
          mat.depthWrite = true;
        } else if (matName.includes('jiantou')) {
          mat.transparent = true;
          mat.depthWrite = false;
        }
      });
    }

    if (isParis && PARIS_NON_COLLIDABLE.some((kw) => nm.includes(kw))) {
      return;
    }

    attachBVH(child);
  });

  root.updateMatrixWorld(true);
}

export function CityMap() {
  const { scene } = useGLTF(CITY_MODEL_URL);
  const { scene: parisScene } = useGLTF(PARIS_MODEL_URL);
  const harborMats = useMemo(() => createHarborMaterials(), []);

  const cityGroupRef = useRef();
  const parisGroupRef = useRef();
  const bridgeGroupRef = useRef();
  const westFloorRef = useRef();
  const riverbedRef = useRef();
  const bridgeDeckRef = useRef();
  const bridgeRailLeftRef = useRef();
  const bridgeRailRightRef = useRef();

  useEffect(() => {
    cityColliders.length = 0;

    processMapScene(cityGroupRef.current, { isParis: false });
    processMapScene(parisGroupRef.current, { isParis: true });

    const extraColliders = [
      bridgeDeckRef.current,
      bridgeRailLeftRef.current,
      bridgeRailRightRef.current,
      westFloorRef.current,
      riverbedRef.current
    ];
    if (bridgeGroupRef.current) {
      bridgeGroupRef.current.updateMatrixWorld(true);
      bridgeGroupRef.current.traverse((child) => {
        if (child.isMesh && child.userData?.isCollider) {
          extraColliders.push(child);
        }
      });
    }
    extraColliders.forEach((mesh) => {
      if (!mesh) return;
      mesh.updateMatrixWorld(true);
      attachBVH(mesh);
    });
  }, [scene, parisScene]);

  return (
    <group>
      {/* West District: Main Metro City */}
      <group ref={cityGroupRef}>
        <primitive object={scene} />
      </group>

      {/* East Expansion District: Paris Street Circuit (Zero Conflict / Seamlessly Aligned) */}
      <group ref={parisGroupRef} position={PARIS_POS} scale={PARIS_SCALE}>
        <primitive object={parisScene} />
      </group>

      {/* Grand Connector Sky Bridge + Real Coastal Waterfront Roads & Quays */}
      <group ref={bridgeGroupRef}>
        {/* Bridge Structural Deck (Top surface flush at Y = +0.005) */}
        <mesh ref={bridgeDeckRef} position={[BRIDGE_CENTER_X, -0.295, BRIDGE_Z]} material={harborMats.concrete} receiveShadow>
          <boxGeometry args={[BRIDGE_LENGTH, 0.6, BRIDGE_WIDTH]} />
        </mesh>
        {/* Real Textured Asphalt Bridge Roadway Surface */}
        <mesh position={[BRIDGE_CENTER_X, 0.01, BRIDGE_Z]} rotation={[-Math.PI / 2, 0, 0]} material={harborMats.bridgeAsphalt} receiveShadow>
          <planeGeometry args={[BRIDGE_LENGTH, BRIDGE_WIDTH - 0.8]} />
        </mesh>

        {/* Concrete Side Parapet Curbs + Steel Guardrails */}
        <mesh ref={bridgeRailLeftRef} position={[BRIDGE_CENTER_X, 0.45, BRIDGE_Z - BRIDGE_WIDTH / 2 + 0.2]} material={harborMats.concrete}>
          <boxGeometry args={[BRIDGE_LENGTH, 0.9, 0.42]} />
        </mesh>
        <mesh ref={bridgeRailRightRef} position={[BRIDGE_CENTER_X, 0.45, BRIDGE_Z + BRIDGE_WIDTH / 2 - 0.2]} material={harborMats.concrete}>
          <boxGeometry args={[BRIDGE_LENGTH, 0.9, 0.42]} />
        </mesh>
        <mesh position={[BRIDGE_CENTER_X, 0.96, BRIDGE_Z - BRIDGE_WIDTH / 2 + 0.2]} material={harborMats.guardrail}>
          <boxGeometry args={[BRIDGE_LENGTH, 0.16, 0.16]} />
        </mesh>
        <mesh position={[BRIDGE_CENTER_X, 0.96, BRIDGE_Z + BRIDGE_WIDTH / 2 - 0.2]} material={harborMats.guardrail}>
          <boxGeometry args={[BRIDGE_LENGTH, 0.16, 0.16]} />
        </mesh>

        {/* Cut-Stone Masonry Viaduct Support Pillars over the Seine */}
        {[294, 331].map((px) => (
          <group key={px} position={[px, -4.5, BRIDGE_Z]}>
            <mesh position={[0, 0, -BRIDGE_WIDTH / 2 + 1.1]} material={harborMats.stone}>
              <boxGeometry args={[2.4, 8.6, 1.5]} />
            </mesh>
            <mesh position={[0, 0, BRIDGE_WIDTH / 2 - 1.1]} material={harborMats.stone}>
              <boxGeometry args={[2.4, 8.6, 1.5]} />
            </mesh>
          </group>
        ))}

        {/* 3 Separate Coastal Waterfront Launch Ramps & Piers (West Yacht, South Frigate, East Tugboat) */}
        {WATERFRONT_DOCKS.map((dock) => (
          <WaterfrontDock key={dock.id} dock={dock} mats={harborMats} />
        ))}
      </group>

      {/* Real Animated 3D Seine Water (Translucent, reflective waves, boat-ready) */}
      <AnimatedRiverWater />

      {/* Scoped Ground Plane for West City (Does not encroach into Paris underpasses or river) */}
      <mesh ref={westFloorRef} position={[-135, -0.06, -236]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[920, 960]} />
        <meshStandardMaterial color="#11161d" roughness={0.88} metalness={0.12} />
      </mesh>

      {/* Textured Riverbed & Mega-World Underwater Floor (Allows cars to drop & sink cleanly into water) */}
      <mesh ref={riverbedRef} position={[380, WATER_BED_Y, -240]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3200, 2200]} />
        <meshStandardMaterial color="#13222b" roughness={0.95} metalness={0.05} />
      </mesh>
    </group>
  );
}

useGLTF.preload(CITY_MODEL_URL);
useGLTF.preload(PARIS_MODEL_URL);
