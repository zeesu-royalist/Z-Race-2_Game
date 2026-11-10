import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cityColliders } from './CityMap';

const NPC_MODEL_URL = '/npc/group_of_people.glb';

// Full-city New City (Paris) pedestrian plazas, promenades, boulevards, and parks
const PARIS_CROWD_ZONES = [
  { x0: 388, x1: 535, z0: -34, z1: 36, count: 120, walkRatio: 0.42 },     // West Entry Plaza & Waterfront Promenade
  { x0: 535, x1: 845, z0: -40, z1: 78, count: 210, walkRatio: 0.44 },     // Eiffel Champ-de-Mars Plaza & Gardens
  { x0: 410, x1: 1020, z0: -175, z1: -58, count: 145, walkRatio: 0.48 },  // Central Boulevards & Louvre Courtyards
  { x0: 420, x1: 1060, z0: -380, z1: -175, count: 110, walkRatio: 0.46 }, // Northern Historic Quarter & Track Sidewalks
  { x0: 845, x1: 1160, z0: -155, z1: 55, count: 90, walkRatio: 0.40 },    // East Paris Plazas & Bayfront
  { x0: 640, x1: 980, z0: 76, z1: 108, count: 45, walkRatio: 0.45 }       // South Frigate Bay Esplanade
];

const EXCLUDE_SPOTS = [
  [395, -35, 9],     // Initial Paris Plaza Spawn Berth
  [386, -49.35, 16], // West Bridge Entry Avenue
  [430, -20, 14],    // West Helipad
  [670, 20, 16],     // Central Seahawk Helipad
  [378, -51.6, 10],  // West Marina Ramp Top
  [755, 116.8, 10],  // South Frigate Ramp Top
  [1145, 40.8, 10]   // East Tugboat Ramp Top
];

/**
 * Extracts distinct standing person/couple archetypes from `group_of_people.glb`.
 * Restores legacy KHR_materials_pbrSpecularGlossiness colors (ignored by modern GLTFLoader)
 * and bakes them into vertex colors so all archetypes render in 1 shared InstancedMesh material.
 */
function extractCrowdArchetypes(gltf, maxArchetypes = 8) {
  const scene = gltf?.scene;
  if (!scene) return [];
  scene.updateMatrixWorld(true);

  const matColorByName = new Map();
  const jsonMats = gltf?.parser?.json?.materials || [];
  for (let i = 0; i < jsonMats.length; i++) {
    const m = jsonMats[i];
    const df =
      m?.extensions?.KHR_materials_pbrSpecularGlossiness?.diffuseFactor ||
      m?.pbrMetallicRoughness?.baseColorFactor;
    if (df && m.name) {
      const r = Math.min(0.92, Math.max(0.03, df[0]));
      const g = Math.min(0.92, Math.max(0.03, df[1]));
      const b = Math.min(0.92, Math.max(0.03, df[2]));
      matColorByName.set(m.name, new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace));
    }
  }

  const CELL = 6;
  const cells = new Map();
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
  const nA = new THREE.Vector3(), nB = new THREE.Vector3(), nC = new THREE.Vector3();
  const normMat = new THREE.Matrix3();
  const fallbackColor = new THREE.Color('#7a8290');

  scene.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const pos = child.geometry.attributes.position;
    if (!pos) return;
    const normAttr = child.geometry.attributes.normal;
    const idx = child.geometry.index;
    const mat = Array.isArray(child.material) ? child.material[0] : child.material;
    const col = (mat?.name && matColorByName.get(mat.name)) || mat?.color || fallbackColor;
    const [cr, cg, cb] = [col.r, col.g, col.b];
    normMat.getNormalMatrix(child.matrixWorld);

    const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;

      vA.fromBufferAttribute(pos, i0).applyMatrix4(child.matrixWorld);
      vB.fromBufferAttribute(pos, i1).applyMatrix4(child.matrixWorld);
      vC.fromBufferAttribute(pos, i2).applyMatrix4(child.matrixWorld);

      const cx = (vA.x + vB.x + vC.x) / 3;
      const cy = (vA.y + vB.y + vC.y) / 3;
      const cz = (vA.z + vB.z + vC.z) / 3;
      if (cy < -6 || cy > 85) continue;

      if (normAttr) {
        nA.fromBufferAttribute(normAttr, i0).applyMatrix3(normMat).normalize();
        nB.fromBufferAttribute(normAttr, i1).applyMatrix3(normMat).normalize();
        nC.fromBufferAttribute(normAttr, i2).applyMatrix3(normMat).normalize();
      } else {
        nA.set(0, 1, 0); nB.set(0, 1, 0); nC.set(0, 1, 0);
      }

      const key = `${Math.floor(cx / CELL)},${Math.floor(cz / CELL)}`;
      let bucket = cells.get(key);
      if (!bucket) { bucket = []; cells.set(key, bucket); }
      bucket.push(
        vA.x, vA.y, vA.z, vB.x, vB.y, vB.z, vC.x, vC.y, vC.z,
        nA.x, nA.y, nA.z, nB.x, nB.y, nB.z, nC.x, nC.y, nC.z,
        cr, cg, cb
      );
    }
  });

  // Flood-fill adjacent cells into distinct intact people/couple clusters
  const visited = new Set();
  const candidates = [];

  for (const key of cells.keys()) {
    if (visited.has(key)) continue;
    const queue = [key];
    visited.add(key);
    const tris = [];
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;

    while (queue.length) {
      const cur = queue.pop();
      const bucket = cells.get(cur);
      for (let i = 0; i < bucket.length; i += 21) {
        for (let k = 0; k < 3; k++) {
          const x = bucket[i + k * 3], y = bucket[i + k * 3 + 1], z = bucket[i + k * 3 + 2];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        tris.push(bucket.slice(i, i + 21));
      }
      const [gx, gz] = cur.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const nk = `${gx + dx},${gz + dz}`;
          if (cells.has(nk) && !visited.has(nk)) { visited.add(nk); queue.push(nk); }
        }
      }
    }

    const h = maxY - minY, w = maxX - minX, d = maxZ - minZ;
    if (tris.length >= 300 && tris.length <= 1300 && h >= 55 && h <= 78 && minY > -3 && w < 38 && d < 38) {
      candidates.push({ tris, minY, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, h });
    }
  }

  candidates.sort((a, b) => a.tris.length - b.tris.length);
  const picked = [];
  const step = Math.max(1, Math.floor(candidates.length / maxArchetypes));
  for (let i = 0; i < candidates.length && picked.length < maxArchetypes; i += step) {
    picked.push(candidates[i]);
  }

  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  const e2 = new THREE.Vector3(), fn = new THREE.Vector3();
  const vKey = (x, y, z) => `${Math.round(x * 20)},${Math.round(y * 20)},${Math.round(z * 20)}`;

  return picked.map(({ tris, minY, cx, cz, h }) => {
    const scale = 1.68 / Math.max(1, h);
    const widthBoost = 1.14;

    // 1. Identify planar cutout normal and partition front vs back shell triangles
    const planeN = new THREE.Vector3(0, 0, 1);
    for (let t = 0; t < tris.length; t++) {
      const d = tris[t];
      p0.set(d[0], d[1], d[2]);
      p1.set(d[3], d[4], d[5]);
      p2.set(d[6], d[7], d[8]);
      fn.subVectors(p1, p0).cross(e2.subVectors(p2, p0));
      if (fn.lengthSq() > 1e-6) {
        planeN.copy(fn).normalize();
        break;
      }
    }

    const frontTris = [];
    const backTris = [];
    const edgeCounts = new Map();
    const edgeData = new Map();
    const adj = new Map();

    for (let t = 0; t < tris.length; t++) {
      const d = tris[t];
      p0.set(d[0], d[1], d[2]);
      p1.set(d[3], d[4], d[5]);
      p2.set(d[6], d[7], d[8]);
      fn.subVectors(p1, p0).cross(e2.subVectors(p2, p0));
      if (fn.dot(planeN) >= 0) {
        frontTris.push(d);
        const ks = [vKey(d[0], d[1], d[2]), vKey(d[3], d[4], d[5]), vKey(d[6], d[7], d[8])];
        for (let e = 0; e < 3; e++) {
          const a = e, b = (e + 1) % 3;
          if (ks[a] === ks[b]) continue;
          if (!adj.has(ks[a])) adj.set(ks[a], new Set());
          if (!adj.has(ks[b])) adj.set(ks[b], new Set());
          adj.get(ks[a]).add(ks[b]);
          adj.get(ks[b]).add(ks[a]);
          const ek = ks[a] < ks[b] ? `${ks[a]}|${ks[b]}` : `${ks[b]}|${ks[a]}`;
          edgeCounts.set(ek, (edgeCounts.get(ek) || 0) + 1);
          if (!edgeData.has(ek)) {
            edgeData.set(ek, [
              d[a * 3], d[a * 3 + 1], d[a * 3 + 2], ks[a],
              d[b * 3], d[b * 3 + 1], d[b * 3 + 2], ks[b],
              d[18], d[19], d[20]
            ]);
          }
        }
      } else {
        backTris.push(d);
      }
    }

    // 2. Compute distance from outer silhouette border so torso swells into a round 3D chest
    const ringDist = new Map();
    const bfsQ = [];
    const boundaryEdges = [];
    for (const [ek, cnt] of edgeCounts.entries()) {
      if (cnt === 1) {
        const info = edgeData.get(ek);
        boundaryEdges.push(info);
        if (!ringDist.has(info[3])) { ringDist.set(info[3], 0); bfsQ.push(info[3]); }
        if (!ringDist.has(info[7])) { ringDist.set(info[7], 0); bfsQ.push(info[7]); }
      }
    }
    for (let head = 0; head < bfsQ.length; head++) {
      const u = bfsQ[head];
      const du = ringDist.get(u);
      if (du >= 2) continue;
      const nbrs = adj.get(u);
      if (!nbrs) continue;
      for (const nb of nbrs) {
        if (!ringDist.has(nb)) { ringDist.set(nb, du + 1); bfsQ.push(nb); }
      }
    }

    const halfDepthFor = (k) => {
      const r = ringDist.get(k);
      if (r === 0) return 0.055;
      if (r === 1) return 0.12;
      return 0.16;
    };

    const totalTris = frontTris.length + backTris.length + boundaryEdges.length * 2;
    const positions = new Float32Array(totalTris * 9);
    const colors = new Float32Array(totalTris * 9);
    let triOut = 0;

    const pushVertex = (outIdx, vx, vy, vz, offX, offY, offZ, cr, cg, cb) => {
      positions[outIdx]     = (vx - cx) * scale * widthBoost + offX;
      positions[outIdx + 1] = (vy - minY) * scale + offY;
      positions[outIdx + 2] = (vz - cz) * scale * widthBoost + offZ;
      colors[outIdx]        = cr;
      colors[outIdx + 1]    = cg;
      colors[outIdx + 2]    = cb;
    };

    const emitShell = (list, sign) => {
      for (let t = 0; t < list.length; t++) {
        const d = list[t];
        const [cr, cg, cb] = [d[18], d[19], d[20]];
        for (let v = 0; v < 3; v++) {
          const vx = d[v * 3], vy = d[v * 3 + 1], vz = d[v * 3 + 2];
          const hd = halfDepthFor(vKey(vx, vy, vz)) * sign;
          pushVertex((triOut * 3 + v) * 3, vx, vy, vz, planeN.x * hd, planeN.y * hd, planeN.z * hd, cr, cg, cb);
        }
        triOut++;
      }
    };

    emitShell(frontTris, 1);
    emitShell(backTris, -1);

    // 3. Seal silhouette edges with solid outward-wound side walls
    for (let i = 0; i < boundaryEdges.length; i++) {
      const [ax, ay, az, ak, bx, by, bz, bk, cr, cg, cb] = boundaryEdges[i];
      const ha = halfDepthFor(ak);
      const hb = halfDepthFor(bk);
      const b0 = triOut * 9;
      pushVertex(b0,      ax, ay, az,  planeN.x * ha,  planeN.y * ha,  planeN.z * ha, cr, cg, cb);
      pushVertex(b0 + 3,  ax, ay, az, -planeN.x * ha, -planeN.y * ha, -planeN.z * ha, cr, cg, cb);
      pushVertex(b0 + 6,  bx, by, bz,  planeN.x * hb,  planeN.y * hb,  planeN.z * hb, cr, cg, cb);
      triOut++;
      const b1 = triOut * 9;
      pushVertex(b1,      ax, ay, az, -planeN.x * ha, -planeN.y * ha, -planeN.z * ha, cr, cg, cb);
      pushVertex(b1 + 3,  bx, by, bz, -planeN.x * hb, -planeN.y * hb, -planeN.z * hb, cr, cg, cb);
      pushVertex(b1 + 6,  bx, by, bz,  planeN.x * hb,  planeN.y * hb,  planeN.z * hb, cr, cg, cb);
      triOut++;
    }

    // Compute smooth area-weighted vertex normals across shared 3D vertices
    const normals = new Float32Array(totalTris * 9);
    const nMap = new Map();
    const nKeys = new Array(totalTris * 3);
    for (let t = 0; t < totalTris; t++) {
      const b = t * 9;
      p0.set(positions[b], positions[b + 1], positions[b + 2]);
      p1.set(positions[b + 3], positions[b + 4], positions[b + 5]);
      p2.set(positions[b + 6], positions[b + 7], positions[b + 8]);
      fn.subVectors(p1, p0).cross(e2.subVectors(p2, p0));
      for (let v = 0; v < 3; v++) {
        const vi = t * 3 + v;
        const o = vi * 3;
        const nk = `${Math.round(positions[o] * 500)},${Math.round(positions[o + 1] * 500)},${Math.round(positions[o + 2] * 500)}`;
        nKeys[vi] = nk;
        let acc = nMap.get(nk);
        if (!acc) { acc = [0, 0, 0]; nMap.set(nk, acc); }
        acc[0] += fn.x; acc[1] += fn.y; acc[2] += fn.z;
      }
    }
    for (let vi = 0; vi < totalTris * 3; vi++) {
      const acc = nMap.get(nKeys[vi]);
      const len = Math.hypot(acc[0], acc[1], acc[2]) || 1;
      const o = vi * 3;
      normals[o]     = acc[0] / len;
      normals[o + 1] = acc[1] / len;
      normals[o + 2] = acc[2] / len;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  });
}

/**
 * Lightweight instanced pedestrian crowds populating Paris plazas, parks & sidewalks.
 * Places ~720 pedestrians in social groups & strolling pairs using just 8 InstancedMesh draw calls.
 */
export function CityCrowds() {
  const gltf = useGLTF(NPC_MODEL_URL);
  const archetypes = useMemo(() => extractCrowdArchetypes(gltf, 8), [gltf]);
  const sharedMat = useMemo(
    () => new THREE.MeshLambertMaterial({ vertexColors: true }),
    []
  );

  const [buckets, setBuckets] = useState([]);
  const meshRefs = useRef([]);
  const accumRef = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    return () => {
      archetypes.forEach((g) => g.dispose());
      sharedMat.dispose();
    };
  }, [archetypes, sharedMat]);

  useEffect(() => {
    if (archetypes.length === 0) return;

    const placeCrowds = () => {
      if (cityColliders.length === 0) return false;

      let seed = 4209;
      const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      const rc = new THREE.Raycaster();
      const down = new THREE.Vector3(0, -1, 0);
      const origin = new THREE.Vector3();
      const tmpNorm = new THREE.Vector3();

      const probeGround = (x, z) => {
        if (x < 340 && Math.abs(z + 49.35) < 7.5) return null;
        for (let i = 0; i < EXCLUDE_SPOTS.length; i++) {
          const [ex, ez, rad] = EXCLUDE_SPOTS[i];
          if (Math.hypot(x - ex, z - ez) < rad) return null;
        }
        origin.set(x, 45, z);
        rc.set(origin, down);
        rc.far = 50;
        const hits = rc.intersectObjects(cityColliders, false);
        if (!hits.length) return null;
        const h = hits[0];
        if (h.point.y < -0.25 || h.point.y > 0.45) return null;
        const rawN = h.normal || h.face?.normal;
        if (!rawN) return null;
        tmpNorm.copy(rawN).transformDirection(h.object.matrixWorld);
        if (Math.abs(tmpNorm.y) < 0.82) return null;
        const objName = (h.object.name || '').toLowerCase();
        const matName = (h.object.material?.name || '').toLowerCase();
        if (objName.includes('qiang') || objName.includes('tiezhalan') || matName.includes('qiang') || matName.includes('tiezhalan')) {
          return null;
        }
        // Keep pedestrians on sidewalks (`lujian`), lawns (`cao`), and plazas — off track tarmac (`shaidao`)
        if (objName.includes('shaidao') && !matName.includes('lujian') && !matName.includes('cao') && !matName.includes('dibiao_13')) {
          return null;
        }
        return h.point.y;
      };

      const grouped = Array.from({ length: archetypes.length }, () => []);

      for (const zone of PARIS_CROWD_ZONES) {
        let placed = 0;
        for (let attempt = 0; attempt < zone.count * 14 && placed < zone.count; attempt++) {
          const ax = zone.x0 + rand() * (zone.x1 - zone.x0);
          const az = zone.z0 + rand() * (zone.z1 - zone.z0);
          const ay = probeGround(ax, az);
          if (ay === null) continue;

          // 48% spawn in tight 2-3 person social huddles facing inward; others stroll/stand along paths
          const isHuddle = rand() < 0.48 && placed + 2 <= zone.count;
          if (isHuddle) {
            const members = 2 + (rand() < 0.45 ? 1 : 0);
            for (let m = 0; m < members && placed < zone.count; m++) {
              const ang = (m / members) * Math.PI * 2 + rand() * 0.6;
              const rad = 1.1 + rand() * 1.4;
              const px = ax + Math.cos(ang) * rad;
              const pz = az + Math.sin(ang) * rad;
              const py = probeGround(px, pz);
              if (py === null || Math.abs(py - ay) > 0.25) continue;
              const archIdx = Math.floor(rand() * archetypes.length);
              grouped[archIdx].push({
                x: px, y: py, z: pz,
                rotY: Math.atan2(ax - px, az - pz),
                scale: 0.94 + rand() * 0.14,
                walkLen: 0, dirX: 0, dirZ: 1,
                phase: rand() * Math.PI * 2,
                speed: 0.75 + rand() * 0.55
              });
              placed++;
            }
            continue;
          }

          const angle = rand() * Math.PI * 2;
          let walkLen = 0;
          if (rand() < zone.walkRatio) {
            const testDist = 5.0 + rand() * 6.0;
            const endY = probeGround(ax + Math.sin(angle) * testDist, az + Math.cos(angle) * testDist);
            if (endY !== null && Math.abs(endY - ay) < 0.25) walkLen = testDist;
          }

          const archIdx = Math.floor(rand() * archetypes.length);
          grouped[archIdx].push({
            x: ax, y: ay, z: az,
            rotY: angle,
            scale: 0.94 + rand() * 0.14,
            walkLen,
            dirX: Math.sin(angle),
            dirZ: Math.cos(angle),
            phase: rand() * Math.PI * 2,
            speed: 0.75 + rand() * 0.65
          });
          placed++;
        }
      }

      setBuckets(grouped);
      return true;
    };

    if (!placeCrowds()) {
      const timer = setInterval(() => {
        if (placeCrowds()) clearInterval(timer);
      }, 300);
      return () => clearInterval(timer);
    }
  }, [archetypes.length]);

  useEffect(() => {
    buckets.forEach((list, idx) => {
      const mesh = meshRefs.current[idx];
      if (!mesh || !list.length) return;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.rotY, 0);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }, [buckets, dummy]);

  // Throttled ~22Hz lightweight stroll & idle sway animation
  useFrame(({ clock }, delta) => {
    if (buckets.length === 0) return;
    accumRef.current += delta;
    if (accumRef.current < 0.045) return;
    accumRef.current = 0;

    const t = clock.getElapsedTime();
    for (let idx = 0; idx < buckets.length; idx++) {
      const list = buckets[idx];
      const mesh = meshRefs.current[idx];
      if (!mesh || !list.length) continue;

      let moved = false;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.walkLen <= 0) continue;
        moved = true;
        const cycle = (t * p.speed + p.phase) % (Math.PI * 2);
        const pingPong = 0.5 - 0.5 * Math.cos(cycle);
        const heading = Math.sin(cycle) >= 0 ? p.rotY : p.rotY + Math.PI;
        const stepBob = Math.abs(Math.sin(t * p.speed * 4.5 + p.phase)) * 0.045;
        dummy.position.set(
          p.x + p.dirX * p.walkLen * pingPong,
          p.y + stepBob,
          p.z + p.dirZ * p.walkLen * pingPong
        );
        dummy.rotation.set(0, heading, 0);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      if (moved) mesh.instanceMatrix.needsUpdate = true;
    }
  });

  if (archetypes.length === 0 || buckets.length === 0) return null;

  return (
    <group>
      {archetypes.map((geo, idx) => {
        const count = buckets[idx]?.length || 0;
        if (count === 0) return null;
        return (
          <instancedMesh
            key={idx}
            ref={(el) => { meshRefs.current[idx] = el; }}
            args={[geo, sharedMat, count]}
            frustumCulled={false}
          />
        );
      })}
    </group>
  );
}

useGLTF.preload(NPC_MODEL_URL);
