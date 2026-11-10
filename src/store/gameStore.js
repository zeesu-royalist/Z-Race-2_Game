import { create } from 'zustand';
import { useGLTF } from '@react-three/drei';
import { CAR_CATALOG, DEFAULT_CAR_ID } from '../config/cars';
import { soundManager } from '../utils/AudioSystem';

let countdownTimers = [];
const clearCountdownTimers = () => {
  countdownTimers.forEach(clearTimeout);
  countdownTimers = [];
};

const defaultCar = CAR_CATALOG.find((c) => c.id === DEFAULT_CAR_ID) || CAR_CATALOG[0];

export const useGameStore = create((set, get) => ({
  // Active Car Selection
  cars: [...CAR_CATALOG],
  currentCarId: defaultCar.id,
  carModelPath: defaultCar.modelPath,
  carName: defaultCar.name,
  carBrand: defaultCar.brand || 'Toyota',
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
  carPosition: [-3.0, 0.3, 10.0],
  carRotation: 0,

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

  selectCar: (carId, resetToSpawn = false) => {
    const { cars, currentCarId, carModelPath } = get();
    if (carId === currentCarId) return;
    const car = cars.find((c) => c.id === carId);
    if (!car) return;

    const oldModelPath = carModelPath;
    set({
      currentCarId: car.id,
      carModelPath: car.modelPath,
      carName: car.name,
      carBrand: car.brand || 'HYPERCAR',
      carTuning: car.tuning || defaultCar.tuning,
      speed: 0,
      rpm: 900
    });

    if (oldModelPath && oldModelPath !== car.modelPath) {
      try { useGLTF.clear(oldModelPath); } catch {}
    }
    if (resetToSpawn) get().triggerReset();
  },

  syncCarsList: (newCarList) => {
    if (!Array.isArray(newCarList) || newCarList.length === 0) return;
    const { currentCarId } = get();
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

  fetchCars: async () => {
    try {
      const url = import.meta.env.DEV ? '/api/cars' : '/cars-manifest.json';
      let res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok && import.meta.env.DEV) {
        res = await fetch('/cars-manifest.json', { cache: 'no-cache' });
      }
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) get().syncCarsList(list);
      }
    } catch {}
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
