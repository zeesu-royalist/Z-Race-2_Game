import * as THREE from 'three';

/**
 * Shared 3D Water System for Z-Race V2.
 * Used identically by the animated 3D River mesh, Car splash/submersion physics,
 * and future navigable Boat physics.
 */
export const WATER_SURFACE_Y = -4.80;
export const WATER_BED_Y = -7.60;

export const WATER_ZONE = {
  minX: 255,
  maxX: 1320,
  minZ: -135,
  maxZ: 240,
  centerX: 787.5,
  centerZ: 52.5,
  width: 1065,
  depth: 375
};

/**
 * Returns true if world (x, z) lies within a navigable water body.
 */
export function isInWaterZone(x, z) {
  return (
    x >= WATER_ZONE.minX &&
    x <= WATER_ZONE.maxX &&
    z >= WATER_ZONE.minZ &&
    z <= WATER_ZONE.maxZ
  );
}

/**
 * Computes exact multi-wave water surface Y at world (x, z) and time (seconds).
 * Returns null if (x, z) is outside any water body.
 */
export function getWaterHeight(x, z, timeSec = 0) {
  if (!isInWaterZone(x, z)) return null;
  return (
    WATER_SURFACE_Y +
    Math.sin(x * 0.075 + timeSec * 1.9) * 0.14 +
    Math.cos(z * 0.09 + timeSec * 1.45) * 0.11 +
    Math.sin((x + z) * 0.048 - timeSec * 1.15) * 0.07
  );
}

/**
 * Computes analytical wave surface normal at (x, z, timeSec) into outVec (zero-GC).
 * Ideal for pitching and rolling boats and floating chassis realistically.
 */
export function getWaterNormal(x, z, timeSec = 0, outVec = new THREE.Vector3(0, 1, 0)) {
  const dHx =
    Math.cos(x * 0.075 + timeSec * 1.9) * 0.075 * 0.14 +
    Math.cos((x + z) * 0.048 - timeSec * 1.15) * 0.048 * 0.07;
  const dHz =
    -Math.sin(z * 0.09 + timeSec * 1.45) * 0.09 * 0.11 +
    Math.cos((x + z) * 0.048 - timeSec * 1.15) * 0.048 * 0.07;

  return outVec.set(-dHx, 1, -dHz).normalize();
}

