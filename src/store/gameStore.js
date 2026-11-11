import { create } from 'zustand';
import { useGLTF } from '@react-three/drei';
import { CAR_CATALOG, BOAT_CATALOG, HELI_CATALOG, DEFAULT_CAR_ID } from '../config/cars';
import { soundManager } from '../utils/AudioSystem';
import { WATER_SURFACE_Y } from '../utils/waterSystem';

export const BOAT_SPAWN_POS = [392, WATER_SURFACE_Y, -82.5];
export const BOAT_SPAWN_ROT_Y = Math.PI * 0.5;
export const HELI_SPAWN_POS = [430, 0.01, -20];
export const HELI_SPAWN_ROT_Y = Math.PI * 0.25;

export const DOCK_HOME_SLOTS = {
  boat: {
    position: [392, WATER_SURFACE_Y, -82.5],
    rotationY: Math.PI * 0.5,
    pierPark: [386, WATER_SURFACE_Y + 0.44, -74.5]
  },
  tow_boat: {
    position: [1156, WATER_SURFACE_Y, 76.0],
    rotationY: Math.PI * 0.5,
    pierPark: [1153, WATER_SURFACE_Y + 0.44, 66.5]
  },
  'aquitaine_-_french_ship': {
    position: [762, WATER_SURFACE_Y, 156.0],
    rotationY: Math.PI * 0.5,
    pierPark: [762, WATER_SURFACE_Y + 0.44, 142.5]
  }
};

export const HELIPAD_HOME_SLOTS = {
  helicopter: {
    position: [430, 0.01, -20.0],
    rotationY: Math.PI * 0.25,
    pierPark: [418, 0.02, -20.0]
  },
  'sh-60b_seahawk_helicopter': {
    position: [670, 0.14, 20.0],
    rotationY: -Math.PI * 0.35,
    pierPark: [656, 0.14, 20.0]
  },
  axis_fighter_plane: {
    flightMode: 'plane',
    position: [435, 0.01, 44.0],
    rotationY: Math.PI * 0.5,
    pierPark: [418, 0.02, 44.0]
  },
  stylized_war_plane: {
    flightMode: 'plane',
    position: [560, 0.01, 74.0],
    rotationY: Math.PI * 0.5,
    pierPark: [542, 0.02, 74.0]
  }
};

function buildWorldSlots(list, slotsMap, vehicleType, existing = []) {
  return list.map((item, idx) => {
    const prev = existing.find((v) => v.id === item.id);
    const isHeli = vehicleType === 'helicopter';
    const home = slotsMap[item.id] || (isHeli
      ? { position: [430 + idx * 45, 0.05, -20.0], rotationY: 0, pierPark: [418 + idx * 45, 0.05, -20.0] }
      : { position: [430 + idx * 18, WATER_SURFACE_Y, -88.0], rotationY: Math.PI * 0.5, pierPark: [386, WATER_SURFACE_Y + 0.44, -74.5] });
    const flightMode = home.flightMode || item.flightMode || item.tuning?.flightMode || vehicleType;
    return {
      id: item.id,
      vehicleType,
      flightMode,
      modelPath: item.modelPath,
      name: item.name,
      brand: item.brand || (isHeli ? 'AIRBUS' : 'MARINE'),
      targetLength: item.targetLength || (isHeli ? 11.5 : 11.0),
      waterlineOffset: item.waterlineOffset ?? (isHeli ? 0 : 0.18),
      boardRadius: flightMode === 'plane' ? 12.5 : isHeli ? 11.0 : ((item.targetLength || 11.0) > 16 ? 16.5 : 11.5),
      position: prev ? [...prev.position] : [...home.position],
      rotationY: prev ? prev.rotationY : home.rotationY,
      homePosition: [...home.position],
      homeRotationY: home.rotationY,
      pierPark: [...home.pierPark]
    };
  });
}

function applyVehicleFields(item, type, lastCarId, defaultCarItem) {
  const nextType = type === 'boat' ? 'boat' : type === 'helicopter' ? 'helicopter' : 'car';
  return {
    currentCarId: item.id,
    lastCarId: nextType === 'car' ? item.id : lastCarId,
    vehicleType: nextType,
    vehicleLength: item.targetLength || (nextType === 'boat' ? 11.0 : nextType === 'helicopter' ? 11.5 : 3.9),
    waterlineOffset: item.waterlineOffset ?? (nextType === 'boat' ? 0.18 : 0),
    vehicleCamScale: item.camScale || (nextType === 'boat' ? 2.3 : nextType === 'helicopter' ? 2.5 : 1.0),
    carModelPath: item.modelPath,
    carName: item.name,
    carBrand: item.brand || (nextType === 'boat' ? 'MARINE' : nextType === 'helicopter' ? 'AIR' : 'HYPERCAR'),
    carTuning: item.tuning || defaultCarItem.tuning,
    speed: 0,
    rpm: 900,
    isInWater: false,
    isDrifting: false
  };
}

let countdownTimers = [];
const clearCountdownTimers = () => {
  countdownTimers.forEach(clearTimeout);
  countdownTimers = [];
};

async function fetchVehicleManifest(apiUrl, manifestUrl) {
  try {
    const url = import.meta.env.DEV ? apiUrl : manifestUrl;
    let res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok && import.meta.env.DEV) {
      res = await fetch(manifestUrl, { cache: 'no-cache' });
    }
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch {}
  return null;
}

const defaultCar = CAR_CATALOG.find((c) => c.id === DEFAULT_CAR_ID) || CAR_CATALOG[0];

export const useGameStore = create((set, get) => ({
  // Active Vehicle Selection (Cars + Docked Boats/Ships + Helipad Helicopters)
  cars: [...CAR_CATALOG],
  boats: [...BOAT_CATALOG],
  helicopters: [...HELI_CATALOG],
  dockedBoats: buildWorldSlots(BOAT_CATALOG, DOCK_HOME_SLOTS, 'boat'),
  dockedHelicopters: buildWorldSlots(HELI_CATALOG, HELIPAD_HOME_SLOTS, 'helicopter'),
  parkedCar: null,
  nearbyPrompt: null,
  switchLock: { cooldownUntil: 0, armedCarReturn: false, blockedBoatId: null },
  lastCarId: defaultCar.id,
  vehicleType: 'car',
  vehicleLength: 3.9,
  waterlineOffset: 0,
  vehicleCamScale: 1.0,
  currentCarId: defaultCar.id,
  carModelPath: defaultCar.modelPath,
  carName: defaultCar.name,
  carBrand: defaultCar.brand || 'McLaren',
  carTuning: defaultCar.tuning,

  // Car Telemetry
  speed: 0,
  rpm: 900,
  gear: '1',
  steerAngle: 0,
  isDrifting: false,
  driftScore: 0,
  totalDriftScore: 0,
  nitro: 100,
  isNitroActive: false,
  isInWater: false,
  carPosition: [395, 0.25, -35],
  carRotation: Math.PI * 0.4,

  // Game Settings & Camera (3 Dedicated Angles: Close, Far, Aerial)
  cameraMode: 'close',
  timeOfDay: 'sunset',
  soundEnabled: true,

  // Racing & Checkpoints
  gameMode: 'freeroam',
  raceActive: false,
  raceCountdown: null,
  racePosition: 4,
  totalRacers: 7,
  lapTime: 0,
  bestLapTime: null,
  currentCheckpoint: 0,
  totalCheckpoints: 16,
  raceFinished: false,

  // Reset & Teleport Signals
  resetSignal: 0,
  teleportSignal: 0,
  teleportTarget: null,

  teleportTo: (pos, rotY = 0) => set((s) => ({
    teleportSignal: s.teleportSignal + 1,
    teleportTarget: { pos, rotY }
  })),

  setNearbyPrompt: (nearbyPrompt) => set({ nearbyPrompt }),

  parkCurrentWorldPose: (pos, rotY) => set((s) => {
    if (s.vehicleType === 'boat') {
      return {
        dockedBoats: s.dockedBoats.map((b) =>
          b.id === s.currentCarId ? { ...b, position: [pos[0], WATER_SURFACE_Y, pos[2]], rotationY: rotY } : b
        )
      };
    }
    if (s.vehicleType === 'helicopter') {
      return {
        dockedHelicopters: s.dockedHelicopters.map((h) =>
          h.id === s.currentCarId ? { ...h, position: [pos[0], Math.max(0, pos[1]), pos[2]], rotationY: rotY } : h
        )
      };
    }
    return {};
  }),

  boardWorldVehicle: (type, vehicleId, carPos, carRotY) => {
    const st = get();
    const isHeli = type === 'helicopter';
    const pool = isHeli ? st.helicopters : st.boats;
    const worldPool = isHeli ? st.dockedHelicopters : st.dockedBoats;
    const item = pool.find((v) => v.id === vehicleId);
    const slot = worldPool.find((v) => v.id === vehicleId);
    if (!item || !slot) return;

    let nextParkedCar = st.parkedCar;
    let nextLastCarId = st.lastCarId;
    if (st.vehicleType === 'car') {
      const activeCar = st.cars.find((c) => c.id === st.currentCarId) || st.cars.find((c) => c.id === st.lastCarId) || defaultCar;
      const carSpot = Array.isArray(carPos) ? [carPos[0], carPos[1], carPos[2]] : [...slot.pierPark];
      nextLastCarId = activeCar.id;
      nextParkedCar = {
        carId: activeCar.id,
        modelPath: activeCar.modelPath,
        name: activeCar.name,
        brand: activeCar.brand || 'CAR',
        position: carSpot,
        rotationY: carRotY ?? Math.PI * 0.5
      };
    } else {
      st.parkCurrentWorldPose(st.carPosition, st.carRotation);
    }

    set({
      ...applyVehicleFields(item, type, nextLastCarId, defaultCar),
      parkedCar: nextParkedCar,
      nearbyPrompt: null,
      switchLock: { cooldownUntil: performance.now() + 800, armedCarReturn: false, blockedBoatId: null }
    });
    get().teleportTo(slot.position, slot.rotationY);
  },

  boardBoat: (boatId, carPos, carRotY) => get().boardWorldVehicle('boat', boatId, carPos, carRotY),

  returnToParkedCar: (livePos, liveRotY) => {
    const { vehicleType, parkedCar, cars, currentCarId } = get();
    if (vehicleType === 'car' || !parkedCar) return;
    const car = cars.find((c) => c.id === parkedCar.carId) || defaultCar;
    const pos = Array.isArray(livePos) ? livePos : get().carPosition;
    const rot = liveRotY ?? get().carRotation;

    get().parkCurrentWorldPose(pos, rot);
    set({
      ...applyVehicleFields(car, 'car', car.id, defaultCar),
      parkedCar: null,
      nearbyPrompt: null,
      switchLock: { cooldownUntil: performance.now() + 2600, armedCarReturn: false, blockedBoatId: currentCarId }
    });
    get().teleportTo(parkedCar.position, parkedCar.rotationY);
  },

  selectVehicle: (vehicleId, type = 'car', resetToSpawn = false) => {
    const { cars, boats, helicopters, dockedBoats, dockedHelicopters, parkedCar, currentCarId, carModelPath, vehicleType: prevType, carPosition, carRotation, lastCarId } = get();
    if (vehicleId === currentCarId) return;
    const pool = type === 'boat' ? boats : type === 'helicopter' ? helicopters : cars;
    const item = pool.find((v) => v.id === vehicleId);
    if (!item) return;

    const oldModelPath = carModelPath;
    const nextType = type === 'boat' ? 'boat' : type === 'helicopter' ? 'helicopter' : 'car';

    // Keep previously driven world vehicle parked where player left it
    if (prevType !== 'car') {
      get().parkCurrentWorldPose(carPosition, carRotation);
    }

    const worldPool = nextType === 'helicopter' ? dockedHelicopters : dockedBoats;
    const targetSlot = nextType !== 'car' ? worldPool.find((v) => v.id === item.id) : null;

    let nextParkedCar = parkedCar;
    if (nextType !== 'car' && prevType === 'car') {
      const prevCar = cars.find((c) => c.id === currentCarId) || defaultCar;
      const fallbackSpot = targetSlot?.pierPark || (nextType === 'helicopter' ? [418, 0.02, -20] : [386, WATER_SURFACE_Y + 0.44, -74.5]);
      const nearSpot = Math.hypot(carPosition[0] - fallbackSpot[0], carPosition[2] - fallbackSpot[2]) < 42;
      nextParkedCar = {
        carId: prevCar.id,
        modelPath: prevCar.modelPath,
        name: prevCar.name,
        brand: prevCar.brand || 'CAR',
        position: nearSpot ? [carPosition[0], Math.max(carPosition[1], nextType === 'boat' ? WATER_SURFACE_Y + 0.42 : 0), carPosition[2]] : [...fallbackSpot],
        rotationY: nearSpot ? carRotation : Math.PI * 0.5
      };
    } else if (nextType === 'car') {
      nextParkedCar = null;
    }

    set({
      ...applyVehicleFields(item, nextType, prevType === 'car' ? currentCarId : lastCarId, defaultCar),
      parkedCar: nextParkedCar,
      nearbyPrompt: null,
      switchLock: {
        cooldownUntil: performance.now() + 2400,
        armedCarReturn: false,
        blockedBoatId: nextType === 'car' && prevType !== 'car' ? currentCarId : null
      }
    });

    if (
      oldModelPath &&
      oldModelPath !== item.modelPath &&
      !oldModelPath.startsWith('/boats/') &&
      !oldModelPath.startsWith('/Helicopters/') &&
      oldModelPath !== nextParkedCar?.modelPath
    ) {
      try { useGLTF.clear(oldModelPath); } catch {}
    }

    if (nextType === 'boat' || nextType === 'helicopter') {
      const fallbackPos = nextType === 'helicopter' ? HELI_SPAWN_POS : BOAT_SPAWN_POS;
      const fallbackRot = nextType === 'helicopter' ? HELI_SPAWN_ROT_Y : BOAT_SPAWN_ROT_Y;
      get().teleportTo(targetSlot ? targetSlot.position : fallbackPos, targetSlot ? targetSlot.rotationY : fallbackRot);
    } else if (prevType !== 'car') {
      const inParis = carPosition[0] > 330;
      get().teleportTo(inParis ? [395, 0.25, -35] : [-3.0, 0.3, 10.0], inParis ? Math.PI * 0.4 : 0);
    } else if (resetToSpawn) {
      get().triggerReset();
    }
  },

  selectCar: (carId, resetToSpawn = false) => get().selectVehicle(carId, 'car', resetToSpawn),

  syncCarsList: (newCarList) => {
    if (!Array.isArray(newCarList) || newCarList.length === 0) return;
    const { currentCarId, vehicleType } = get();
    if (vehicleType !== 'car') {
      set({ cars: newCarList });
      return;
    }
    const activeCar = newCarList.find((c) => c.id === currentCarId) || newCarList[0];
    set({
      cars: newCarList,
      currentCarId: activeCar.id,
      carModelPath: activeCar.modelPath,
      carName: activeCar.name,
      carBrand: activeCar.brand || 'HYPERCAR',
      carTuning: activeCar.tuning || defaultCar.tuning
    });
  },

  syncBoatsList: (newBoatList) => {
    if (!Array.isArray(newBoatList) || newBoatList.length === 0) return;
    set((s) => ({
      boats: newBoatList,
      dockedBoats: buildWorldSlots(newBoatList, DOCK_HOME_SLOTS, 'boat', s.dockedBoats)
    }));
  },

  syncHelicoptersList: (newHeliList) => {
    if (!Array.isArray(newHeliList) || newHeliList.length === 0) return;
    set((s) => ({
      helicopters: newHeliList,
      dockedHelicopters: buildWorldSlots(newHeliList, HELIPAD_HOME_SLOTS, 'helicopter', s.dockedHelicopters)
    }));
  },

  fetchCars: async () => {
    const list = await fetchVehicleManifest('/api/cars', '/cars-manifest.json');
    if (list) get().syncCarsList(list);
  },

  fetchBoats: async () => {
    const list = await fetchVehicleManifest('/api/boats', '/boats-manifest.json');
    if (list) get().syncBoatsList(list);
  },

  fetchHelicopters: async () => {
    const list = await fetchVehicleManifest('/api/helicopters', '/helicopters-manifest.json');
    if (list) get().syncHelicoptersList(list);
  },

  triggerReset: () => set((s) => ({ resetSignal: s.resetSignal + 1 })),
  setNitro: (nitro) => set({ nitro }),
  setNitroActive: (isNitroActive) => set({ isNitroActive }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  cycleCameraMode: () => {
    const modes = ['close', 'far', 'aerial'];
    set((s) => ({ cameraMode: modes[(modes.indexOf(s.cameraMode) + 1) % modes.length] }));
  },
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  cycleTimeOfDay: () => {
    const times = ['day', 'sunset', 'night'];
    set((s) => ({ timeOfDay: times[(times.indexOf(s.timeOfDay) + 1) % times.length] }));
  },
  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
  addDriftScore: (pts) => set((s) => ({ driftScore: s.driftScore + pts, totalDriftScore: s.totalDriftScore + pts })),
  setRacePosition: (racePosition) => set({ racePosition }),

  startRace: () => {
    clearCountdownTimers();
    if (get().vehicleType !== 'car') {
      get().selectVehicle(get().lastCarId || defaultCar.id, 'car', false);
    }
    get().teleportTo([-4.8, 0.3, 10.0], 0);
    set({
      gameMode: 'race',
      raceActive: true,
      raceCountdown: 3,
      racePosition: 4,
      lapTime: 0,
      currentCheckpoint: 0,
      raceFinished: false,
      speed: 0
    });
    soundManager.playCountdown(3);

    [2, 1, 0, null].forEach((val, i) => {
      const t = setTimeout(() => {
        set({ raceCountdown: val });
        if (val !== null) soundManager.playCountdown(val);
      }, (i + 1) * 1000 + (val === null ? 200 : 0));
      countdownTimers.push(t);
    });
  },

  stopRace: () => {
    clearCountdownTimers();
    set({ gameMode: 'freeroam', raceActive: false, raceCountdown: null, raceFinished: false });
  },

  reachCheckpoint: (checkpointIdx) => {
    const { currentCheckpoint, totalCheckpoints, lapTime, bestLapTime } = get();
    if (checkpointIdx === currentCheckpoint) {
      if (currentCheckpoint + 1 >= totalCheckpoints) {
        set({
          currentCheckpoint: totalCheckpoints,
          raceFinished: true,
          bestLapTime: bestLapTime === null ? lapTime : Math.min(bestLapTime, lapTime),
          raceActive: false
        });
      } else {
        set({ currentCheckpoint: currentCheckpoint + 1 });
      }
    }
  },

  updateLapTime: (delta) => {
    const s = get();
    if (s.raceActive && (s.raceCountdown === 0 || s.raceCountdown === null)) {
      s.lapTime += delta;
    }
  }
}));

if (typeof window !== 'undefined') {
  window.useGameStore = useGameStore;
}
