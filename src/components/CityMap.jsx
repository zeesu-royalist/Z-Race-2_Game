import { Fragment, useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { useGameStore } from '../store/gameStore';
import { WATER_SURFACE_Y, WATER_BED_Y, WATER_ZONE } from '../utils/waterSystem';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const cityColliders = [];

const CITY_MODEL_URLS = ['/city-models/terrain_retextured.glb', '/city-models/sports_car_racing_paris.glb'];

// Placed cleanly East of current city (City max X = 273.3 -> Paris min X = 332.9)
const PARIS_POS = [815, -0.024, -118.0];
const PARIS_SCALE = 28;

// Bridge connecting Current City East Hwy (X=270.5..273.3, Z=-49.35) -> Paris West Blvd (X=349.7..354.5, Z=-49.35)
const BRIDGE_CENTER_X = 312.5;
const BRIDGE_LENGTH = 84;
const BRIDGE_Z = -49.35;
const BRIDGE_WIDTH = 8.8;

const PARIS_NON_COLLIDABLE = ['zhibei', 'hulang', 'tong', 'guanggao', 'cao', 'shui', 'zhishi', 'jiantou', 'molde'];
const CUTOUT_MAT_KEYWORDS = ['alpha', 'cutout', 'zhibei', 'tiezhalan', 'cao'];

const WATERFRONT_DOCKS = [
  { id: 'west-marina', rampPos: [378, -2.519, -61.875], rampRotX: -0.2381, rampLen: 18.57, pierPos: [389, -4.68, -74.5], pierWidth: 30.0, cleatZ: -3.25, cleatXs: [-10, 0, 10], beaconZ: -51.6, apronY: 0.008 },
  { id: 'south-bay', rampPos: [755, -2.512, 128.55], rampRotX: 0.209, rampLen: 21.16, pierPos: [762, -4.68, 142.5], pierWidth: 26.0, cleatZ: 3.25, cleatXs: [-9, 0, 9], beaconZ: 116.8, apronY: 0.024 },
  { id: 'east-harbor', rampPos: [1145, -2.502, 52.55], rampRotX: 0.2099, rampLen: 21.16, pierPos: [1153, -4.68, 66.5], pierWidth: 26.0, cleatZ: 3.25, cleatXs: [-9, 0, 9], beaconZ: 40.8, apronY: 0.044 }
];

const WATER_COLORS = {
  day: ['#0b6d87', '#053545'],
  sunset: ['#0e4c63', '#1a2d3a'],
  night: ['#062133', '#031524']
};

const _tempBox = new THREE.Box3();
const _instMat = new THREE.Matrix4();

function hasKeyword(str, keywords) {
  for (let i = 0; i < keywords.length; i++) {
    if (str.includes(keywords[i])) return true;
  }
  return false;
}

function setTranslationMatrix(x, y, z, out = _instMat) {
  const me = out.elements;
  me[0] = 1; me[1] = 0; me[2] = 0; me[3] = 0;
  me[4] = 0; me[5] = 1; me[6] = 0; me[7] = 0;
  me[8] = 0; me[9] = 0; me[10] = 1; me[11] = 0;
  me[12] = x; me[13] = y; me[14] = z; me[15] = 1;
  return out;
}

function setXRotTranslatedMatrix(px, py, pz, rx, lx, ly, lz, out = _instMat) {
  const c = Math.cos(rx), s = Math.sin(rx);
  const me = out.elements;
  me[0] = 1; me[1] = 0; me[2] = 0; me[3] = 0;
  me[4] = 0; me[5] = c; me[6] = s; me[7] = 0;
  me[8] = 0; me[9] = -s; me[10] = c; me[11] = 0;
  me[12] = px + lx;
  me[13] = py + ly * c - lz * s;
  me[14] = pz + ly * s + lz * c;
  me[15] = 1;
  return out;
}

/**
 * Generates shared procedural harbor/bridge PBR materials using direct ImageData grain synthesis
 * (zero CSS string parsing) and shares texture sources across asphalt variants.
 */
function createHarborMaterials() {
  if (typeof document === 'undefined') {
    const m = new THREE.MeshStandardMaterial({ color: '#333840', roughness: 0.85 });
    return { asphalt: m, bridgeAsphalt: m, pierDeck: m, stone: m, concrete: m, guardrail: m, iron: m, rubber: m, westFloor: m, riverbed: m };
  }

  let seed = 1337;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  const configureTex = (tex, repX, repY, rotate, isColor) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repX, repY);
    if (rotate) { tex.center.set(0.5, 0.5); tex.rotation = Math.PI / 2; }
    tex.anisotropy = 4;
    if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  const makePbr = (repeat, drawFn, bumpScale = 0.04) => {
    const sz = 256;
    const c = document.createElement('canvas');
    const b = document.createElement('canvas');
    c.width = c.height = b.width = b.height = sz;
    const ctx = c.getContext('2d');
    const bctx = b.getContext('2d');
    drawFn(ctx, bctx, sz);

    const cImg = ctx.getImageData(0, 0, sz, sz);
    const bImg = bctx.getImageData(0, 0, sz, sz);
    const cd = cImg.data, bd = bImg.data;

    // Direct typed-array speckle replaces 28,000 fillRect & rgb() string calls
    for (let i = 0; i < 3500; i++) {
      const px = (rand() * sz) | 0;
      const py = (rand() * sz) | 0;
      const s = 0.7 + rand() * 1.2;
      const sh = rand();
      const bv = Math.round(90 + sh * 100);
      const isLight = sh > 0.55;
      const alpha = isLight ? 0.12 : 0.18;
      const invA = 1 - alpha;
      const sr = isLight ? 220 * alpha : 15 * alpha;
      const sg = isLight ? 225 * alpha : 18 * alpha;
      const sb = isLight ? 235 * alpha : 22 * alpha;
      const maxD = s > 1.35 ? 2 : 1;

      for (let dy = 0; dy < maxD && py + dy < sz; dy++) {
        for (let dx = 0; dx < maxD && px + dx < sz; dx++) {
          const idx = ((py + dy) * sz + (px + dx)) * 4;
          cd[idx] = cd[idx] * invA + sr;
          cd[idx + 1] = cd[idx + 1] * invA + sg;
          cd[idx + 2] = cd[idx + 2] * invA + sb;
          bd[idx] = bd[idx + 1] = bd[idx + 2] = bv;
        }
      }
    }
    ctx.putImageData(cImg, 0, 0);
    bctx.putImageData(bImg, 0, 0);

    const map = configureTex(new THREE.CanvasTexture(c), repeat[0], repeat[1], false, true);
    const bumpMap = configureTex(new THREE.CanvasTexture(b), repeat[0], repeat[1], false, false);
    return new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale, roughness: 0.88, metalness: 0.05 });
  };

  const makeTiles = (repeat, rows, cols, shift, baseRGB, bgHex, bumpScale) => makePbr(repeat, (ctx, bctx, sz) => {
    ctx.fillStyle = bgHex; ctx.fillRect(0, 0, sz, sz);
    bctx.fillStyle = '#585858'; bctx.fillRect(0, 0, sz, sz);
    const rw = sz / rows, cw = sz / cols;
    for (let r = 0; r < rows; r++) {
      for (let col = -1; col <= cols; col++) {
        const x = col * cw + (r % 2) * shift * cw;
        const y = r * rw;
        const d = Math.round((rand() - 0.5) * 20);
        ctx.fillStyle = `rgb(${baseRGB[0] + d},${baseRGB[1] + d},${baseRGB[2] + d})`;
        ctx.fillRect(x + 1.5, y + 1.5, cw - 3, rw - 3);
        bctx.fillStyle = '#c4c4c4';
        bctx.fillRect(x + 1.5, y + 1.5, cw - 3, rw - 3);
      }
    }
  }, bumpScale);

  const asphalt = makePbr([1, 3], (ctx, bctx, sz) => {
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

  // Share the generated asphalt canvas Source with the bridge roadway
  const bridgeMap = configureTex(asphalt.map.clone(), 1, 8, true, true);
  const bridgeBump = configureTex(asphalt.bumpMap.clone(), 1, 8, true, false);
  const bridgeAsphalt = new THREE.MeshStandardMaterial({ map: bridgeMap, bumpMap: bridgeBump, bumpScale: 0.04, roughness: 0.88, metalness: 0.05 });

  return {
    asphalt,
    bridgeAsphalt,
    pierDeck: makeTiles([5, 1.4], 8, 8, 0, [80, 84, 90], '#474e57', 0.04),
    stone: makeTiles([3, 1.5], 8, 4, 0.5, [112, 108, 98], '#6c685e', 0.05),
    concrete: new THREE.MeshStandardMaterial({ color: '#7d838c', roughness: 0.9, metalness: 0.05 }),
    guardrail: new THREE.MeshStandardMaterial({ color: '#9ca4ae', roughness: 0.42, metalness: 0.68 }),
    iron: new THREE.MeshStandardMaterial({ color: '#242930', roughness: 0.52, metalness: 0.65 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#171a1f', roughness: 0.94, metalness: 0.04 }),
    westFloor: new THREE.MeshStandardMaterial({ color: '#11161d', roughness: 0.88, metalness: 0.12 }),
    riverbed: new THREE.MeshStandardMaterial({ color: '#13222b', roughness: 0.95, metalness: 0.05 })
  };
}

/** Creates deduplicated harbor/bridge BufferGeometries and tracks all disposables. */
function createHarborGeometries() {
  const cache = new Map();
  const list = [];
  const get = (key, factory) => {
    let g = cache.get(key);
    if (!g) {
      g = factory();
      cache.set(key, g);
      list.push(g);
    }
    return g;
  };
  return {
    box: (w, h, d) => get(`b:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)),
    plane: (w, d) => get(`p:${w}:${d}`, () => new THREE.PlaneGeometry(w, d)),
    piling: get('c:piling', () => new THREE.CylinderGeometry(0.42, 0.5, 4.1, 10)),
    cleatStem: get('c:stem', () => new THREE.CylinderGeometry(0.17, 0.21, 0.44, 10)),
    cleatCap: get('c:cap', () => new THREE.CylinderGeometry(0.25, 0.22, 0.1, 10)),
    bumper: get('b:bumper', () => new THREE.BoxGeometry(2.6, 0.36, 0.26)),
    guardPost: get('b:post', () => new THREE.BoxGeometry(0.11, 0.68, 0.11)),
    viaductPillar: get('b:pillar', () => new THREE.BoxGeometry(2.4, 8.6, 1.5)),
    westFloor: get('p:west', () => new THREE.PlaneGeometry(920, 960)),
    riverbed: get('p:bed', () => new THREE.PlaneGeometry(3200, 2200)),
    dispose: () => {
      for (let i = 0; i < list.length; i++) list[i].dispose();
    }
  };
}

function populateDockAndBridgeInstances(refs) {
  const { pilings, cleatStems, cleatCaps, bumpers, guardPosts, viaductPillars } = refs;
  let pilingIdx = 0, cleatIdx = 0, postIdx = 0;

  for (let d = 0; d < WATERFRONT_DOCKS.length; d++) {
    const dock = WATERFRONT_DOCKS[d];
    const [px0, py0, pz0] = dock.pierPos;
    const bumperZ = dock.cleatZ > 0 ? 3.56 : -3.56;

    if (pilings) {
      const fxs = [-0.42, -0.14, 0.14, 0.42];
      const pzs = [-2.8, 2.8];
      for (let ix = 0; ix < fxs.length; ix++) {
        for (let iz = 0; iz < pzs.length; iz++) {
          pilings.setMatrixAt(pilingIdx++, setTranslationMatrix(px0 + dock.pierWidth * fxs[ix], py0 - 2.05, pz0 + pzs[iz]));
        }
      }
    }

    for (let cx = 0; cx < dock.cleatXs.length; cx++) {
      const lx = dock.cleatXs[cx];
      if (cleatStems) cleatStems.setMatrixAt(cleatIdx, setTranslationMatrix(px0 + lx, py0 + 0.52, pz0 + dock.cleatZ));
      if (cleatCaps) cleatCaps.setMatrixAt(cleatIdx, setTranslationMatrix(px0 + lx, py0 + 0.76, pz0 + dock.cleatZ));
      if (bumpers) bumpers.setMatrixAt(cleatIdx, setTranslationMatrix(px0 + lx, py0 + 0.16, pz0 + bumperZ));
      cleatIdx++;
    }

    if (guardPosts) {
      const railLen = dock.rampLen - 3.6;
      const railZShift = dock.rampRotX > 0 ? -1.4 : 1.4;
      const n = Math.max(2, Math.floor(railLen / 3.8));
      const [rx0, ry0, rz0] = dock.rampPos;
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < n; i++) {
          const lz = railZShift - railLen / 2 + 0.8 + (i * (railLen - 1.6)) / (n - 1);
          guardPosts.setMatrixAt(postIdx++, setXRotTranslatedMatrix(rx0, ry0, rz0, dock.rampRotX, side * 4.42, 0.54, lz));
        }
      }
    }
  }

  if (viaductPillars) {
    let vIdx = 0;
    const zOff = BRIDGE_WIDTH / 2 - 1.1;
    const xs = [294, 331];
    for (let i = 0; i < xs.length; i++) {
      viaductPillars.setMatrixAt(vIdx++, setTranslationMatrix(xs[i], -4.5, BRIDGE_Z - zOff));
      viaductPillars.setMatrixAt(vIdx++, setTranslationMatrix(xs[i], -4.5, BRIDGE_Z + zOff));
    }
  }

  for (const m of [pilings, cleatStems, cleatCaps, bumpers, guardPosts, viaductPillars]) {
    if (!m) continue;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingBox();
    m.computeBoundingSphere();
  }
}

function WaterfrontDock({ dock, mats, geos }) {
  const railLen = dock.rampLen - 3.6;
  const railZShift = dock.rampRotX > 0 ? -1.4 : 1.4;
  const landCurbZ = dock.cleatZ > 0 ? -3.4 : 3.4;
  const rampLocalX = dock.rampPos[0] - dock.pierPos[0];
  const eastCurbWidth = Math.max(2, dock.pierWidth / 2 - (rampLocalX + 4.8));
  const halfW = dock.pierWidth / 2;

  return (
    <group>
      <group position={[dock.rampPos[0], dock.apronY, dock.beaconZ]}>
        <mesh userData={{ isCollider: true }} position={[0, -0.255, 0]} geometry={geos.box(9.0, 0.5, 4.6)} material={mats.concrete} receiveShadow />
        <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={geos.plane(8.3, 4.6)} material={mats.asphalt} receiveShadow />
      </group>

      <group position={dock.rampPos} rotation={[dock.rampRotX, 0, 0]}>
        <mesh userData={{ isCollider: true }} geometry={geos.box(9.0, 0.6, dock.rampLen)} material={mats.concrete} receiveShadow />
        <mesh position={[0, -3.1, 0]} geometry={geos.box(8.2, 5.6, dock.rampLen - 0.6)} material={mats.stone} />
        <mesh position={[0, 0.305, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={geos.plane(8.3, dock.rampLen)} material={mats.asphalt} receiveShadow />
        {[-1, 1].map((side) => (
          <Fragment key={side}>
            <mesh position={[side * 4.32, 0.38, 0]} geometry={geos.box(0.36, 0.2, dock.rampLen - 0.6)} material={mats.concrete} />
            <mesh position={[side * 4.42, 0.74, railZShift]} geometry={geos.box(0.1, 0.24, railLen)} material={mats.guardrail} />
          </Fragment>
        ))}
      </group>

      <group position={dock.pierPos}>
        <mesh userData={{ isCollider: true }} geometry={geos.box(dock.pierWidth, 0.6, 7.2)} material={mats.concrete} receiveShadow />
        <mesh position={[0, 0.306, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={geos.plane(dock.pierWidth - 0.35, 6.85)} material={mats.pierDeck} receiveShadow />
        <mesh position={[(rampLocalX + 4.8 + halfW) / 2, 0.38, landCurbZ]} geometry={geos.box(eastCurbWidth, 0.22, 0.38)} material={mats.concrete} />
        <group position={[rampLocalX - 0.5, 0.3, dock.cleatZ > 0 ? 3.42 : -3.42]}>
          <mesh userData={{ isCollider: true }} position={[0, 0.62, 0]} geometry={geos.box(11.2, 1.25, 0.48)} material={mats.concrete} />
          <mesh position={[0, 1.32, 0]} geometry={geos.box(11.4, 0.22, 0.16)} material={mats.guardrail} />
        </group>
        {[-1, 1].map((s) => (
          <mesh key={s} userData={{ isCollider: true }} position={[s * (halfW - 0.2), 0.92, 0]} geometry={geos.box(0.44, 1.25, 7.2)} material={mats.concrete} />
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
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * GPU vertex-shader animated Seine River matching waterSystem.getWaterHeight/getWaterNormal
 * mathematically with zero per-frame JS vertex loops, normal recomputation, or buffer uploads.
 */
function AnimatedRiverWater() {
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  const meshRef = useRef();

  const water = useMemo(() => {
    const texture = createWaterRippleTexture();
    const geometry = new THREE.PlaneGeometry(WATER_ZONE.width, WATER_ZONE.depth, 76, 32);
    const uniforms = {
      uWaterTime: { value: 0 },
      uCenterX: { value: WATER_ZONE.centerX },
      uCenterZ: { value: WATER_ZONE.centerZ }
    };
    const [initCol, initEmissive] = WATER_COLORS[useGameStore.getState().timeOfDay] || WATER_COLORS.day;
    const material = new THREE.MeshStandardMaterial({
      color: initCol,
      emissive: initEmissive,
      emissiveIntensity: 0.35,
      map: texture,
      bumpMap: texture,
      bumpScale: 0.18,
      roughness: 0.11,
      metalness: 0.48,
      transparent: true,
      opacity: 0.80,
      envMapIntensity: 1.6
    });
    material.customProgramCacheKey = () => 'zrace-river-water-v1';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWaterTime = uniforms.uWaterTime;
      shader.uniforms.uCenterX = uniforms.uCenterX;
      shader.uniforms.uCenterZ = uniforms.uCenterZ;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uWaterTime;\nuniform float uCenterX;\nuniform float uCenterZ;'
        )
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
          float zWx = uCenterX + position.x;
          float zWz = uCenterZ - position.y;
          float zP1 = zWx * 0.075 + uWaterTime * 1.9;
          float zP2 = zWz * 0.09 + uWaterTime * 1.45;
          float zP3 = (zWx + zWz) * 0.048 - uWaterTime * 1.15;
          float zDHx = cos(zP1) * 0.0105 + cos(zP3) * 0.00336;
          float zDHz = -sin(zP2) * 0.0099 + cos(zP3) * 0.00336;
          objectNormal = normalize(vec3(-zDHx, zDHz, 1.0));`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed.z = sin(zP1) * 0.14 + cos(zP2) * 0.11 + sin(zP3) * 0.07;`
        );
    };
    return { texture, geometry, material, uniforms };
  }, []);

  useEffect(() => {
    const [col, em] = WATER_COLORS[timeOfDay] || WATER_COLORS.day;
    water.material.color.set(col);
    water.material.emissive.set(em);
  }, [timeOfDay, water]);

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.updateMatrix();
      meshRef.current.matrixAutoUpdate = false;
    }
    return () => {
      water.texture?.dispose();
      water.geometry.dispose();
      water.material.dispose();
    };
  }, [water]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    water.uniforms.uWaterTime.value = t;
    if (water.texture) {
      water.texture.offset.x = (t * 0.025) % 1;
      water.texture.offset.y = (t * 0.016) % 1;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[WATER_ZONE.centerX, WATER_SURFACE_Y, WATER_ZONE.centerZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      geometry={water.geometry}
      material={water.material}
      receiveShadow
    />
  );
}

function attachCollider(mesh) {
  const geo = mesh?.geometry;
  if (!geo) return;
  try {
    const triCount = (geo.index ? geo.index.count : geo.attributes.position?.count || 0) / 3;
    if (triCount > 16 && !geo.boundsTree) {
      geo.computeBoundsTree({ maxLeafTris: 15 });
    }
    if (!geo.boundingBox) geo.computeBoundingBox();
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    mesh.userData._wBox = (mesh.userData._wBox || new THREE.Box3()).setFromObject(mesh);
    cityColliders.push(mesh);
  } catch {}
}

function processMapScene(root, isParis, seenMats) {
  if (!root) return;
  root.updateMatrixWorld(true);

  root.traverse((child) => {
    if (!child.isMesh) return;
    const nm = (child.name || '').toLowerCase();

    if (isParis && nm.includes('55_13_d_shui')) {
      child.visible = false;
      return;
    }

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
      for (let i = 0; i < mats.length; i++) {
        const mat = mats[i];
        if (!mat || seenMats.has(mat)) continue;
        seenMats.add(mat);

        if (mat.map) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.anisotropy = 2;
        }
        if (mat.normalMap) mat.normalMap.anisotropy = 2;

        const matName = (mat.name || '').toLowerCase();
        if (hasKeyword(matName, CUTOUT_MAT_KEYWORDS)) {
          mat.alphaTest = 0.38;
          mat.transparent = false;
          mat.depthWrite = true;
        } else if (matName.includes('jiantou')) {
          mat.transparent = true;
          mat.depthWrite = false;
        }
      }
    }

    if (isParis && hasKeyword(nm, PARIS_NON_COLLIDABLE)) return;
    attachCollider(child);
  });

  root.updateMatrixWorld(true);
}

export function CityMap() {
  const [{ scene }, { scene: parisScene }] = useGLTF(CITY_MODEL_URLS);
  const harborMats = useMemo(() => createHarborMaterials(), []);
  const geos = useMemo(() => createHarborGeometries(), []);

  const guardPostCount = useMemo(
    () => WATERFRONT_DOCKS.reduce((sum, d) => sum + 2 * Math.max(2, Math.floor((d.rampLen - 3.6) / 3.8)), 0),
    []
  );

  const cityGroupRef = useRef();
  const parisGroupRef = useRef();
  const bridgeGroupRef = useRef();
  const westFloorRef = useRef();
  const riverbedRef = useRef();
  const bridgeDeckRef = useRef();
  const bridgeRailLeftRef = useRef();
  const bridgeRailRightRef = useRef();
  const pilingsRef = useRef();
  const cleatStemsRef = useRef();
  const cleatCapsRef = useRef();
  const bumpersRef = useRef();
  const guardPostsRef = useRef();
  const viaductPillarsRef = useRef();

  useEffect(() => {
    cityColliders.length = 0;
    const seenMats = new WeakSet();

    processMapScene(cityGroupRef.current, false, seenMats);
    processMapScene(parisGroupRef.current, true, seenMats);

    populateDockAndBridgeInstances({
      pilings: pilingsRef.current,
      cleatStems: cleatStemsRef.current,
      cleatCaps: cleatCapsRef.current,
      bumpers: bumpersRef.current,
      guardPosts: guardPostsRef.current,
      viaductPillars: viaductPillarsRef.current
    });

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
        child.matrixAutoUpdate = false;
      });
    }

    for (let i = 0; i < extraColliders.length; i++) {
      const mesh = extraColliders[i];
      if (!mesh) continue;
      mesh.updateMatrixWorld(true);
      mesh.matrixAutoUpdate = false;
      attachCollider(mesh);
    }

    return () => {
      cityColliders.length = 0;
    };
  }, [scene, parisScene]);

  useEffect(() => {
    return () => {
      const disposedTex = new Set();
      Object.values(harborMats).forEach((m) => {
        if (!m) return;
        for (const t of [m.map, m.bumpMap]) {
          if (t && !disposedTex.has(t)) {
            disposedTex.add(t);
            t.dispose();
          }
        }
        m.dispose();
      });
      geos.dispose();
    };
  }, [harborMats, geos]);

  return (
    <group>
      <group ref={cityGroupRef}>
        <primitive object={scene} />
      </group>

      <group ref={parisGroupRef} position={PARIS_POS} scale={PARIS_SCALE}>
        <primitive object={parisScene} />
      </group>

      <group ref={bridgeGroupRef}>
        <mesh ref={bridgeDeckRef} position={[BRIDGE_CENTER_X, -0.295, BRIDGE_Z]} geometry={geos.box(BRIDGE_LENGTH, 0.6, BRIDGE_WIDTH)} material={harborMats.concrete} receiveShadow />
        <mesh position={[BRIDGE_CENTER_X, 0.01, BRIDGE_Z]} rotation={[-Math.PI / 2, 0, 0]} geometry={geos.plane(BRIDGE_LENGTH, BRIDGE_WIDTH - 0.8)} material={harborMats.bridgeAsphalt} receiveShadow />
        <mesh ref={bridgeRailLeftRef} position={[BRIDGE_CENTER_X, 0.45, BRIDGE_Z - BRIDGE_WIDTH / 2 + 0.2]} geometry={geos.box(BRIDGE_LENGTH, 0.9, 0.42)} material={harborMats.concrete} />
        <mesh ref={bridgeRailRightRef} position={[BRIDGE_CENTER_X, 0.45, BRIDGE_Z + BRIDGE_WIDTH / 2 - 0.2]} geometry={geos.box(BRIDGE_LENGTH, 0.9, 0.42)} material={harborMats.concrete} />
        <mesh position={[BRIDGE_CENTER_X, 0.96, BRIDGE_Z - BRIDGE_WIDTH / 2 + 0.2]} geometry={geos.box(BRIDGE_LENGTH, 0.16, 0.16)} material={harborMats.guardrail} />
        <mesh position={[BRIDGE_CENTER_X, 0.96, BRIDGE_Z + BRIDGE_WIDTH / 2 - 0.2]} geometry={geos.box(BRIDGE_LENGTH, 0.16, 0.16)} material={harborMats.guardrail} />

        {WATERFRONT_DOCKS.map((dock) => (
          <WaterfrontDock key={dock.id} dock={dock} mats={harborMats} geos={geos} />
        ))}

        {/* Instanced static dock/viaduct details (75 meshes batched into 6 draw calls) */}
        <instancedMesh ref={viaductPillarsRef} args={[geos.viaductPillar, harborMats.stone, 4]} />
        <instancedMesh ref={pilingsRef} args={[geos.piling, harborMats.stone, 24]} />
        <instancedMesh ref={cleatStemsRef} args={[geos.cleatStem, harborMats.iron, 9]} />
        <instancedMesh ref={cleatCapsRef} args={[geos.cleatCap, harborMats.iron, 9]} />
        <instancedMesh ref={bumpersRef} args={[geos.bumper, harborMats.rubber, 9]} />
        <instancedMesh ref={guardPostsRef} args={[geos.guardPost, harborMats.iron, guardPostCount]} />
      </group>

      <AnimatedRiverWater />

      <mesh ref={westFloorRef} position={[-135, -0.06, -236]} rotation={[-Math.PI / 2, 0, 0]} geometry={geos.westFloor} material={harborMats.westFloor} receiveShadow />
      <mesh ref={riverbedRef} position={[380, WATER_BED_Y, -240]} rotation={[-Math.PI / 2, 0, 0]} geometry={geos.riverbed} material={harborMats.riverbed} receiveShadow />
    </group>
  );
}
