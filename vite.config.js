import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Clean filename to human-readable title
function cleanFileName(fileName) {
  return fileName
    .replace(/\.(glb|gltf)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/__www\..*$/i, '')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// Known curated car presets
const CURATED_CARS = {
  'mclaren_ultimate_vision_gt.glb': {
    name: 'McLaren Ultimate Vision GT',
    brand: 'McLaren',
    category: 'Vision GT Hypercar',
    specs: { topSpeed: '390 KM/H', acceleration: '2.2 SEC', power: '1150 BHP', handling: 'AWD AERO' },
    tuning: { maxSpeed: 72, accelRate: 24, gripFactor: 0.95, turnMultiplier: 1.15 }
  },
  '1993_toyota_supra_turbo_mk_iv_versus_2f2f.glb': {
    name: '1993 Toyota Supra Mk IV Turbo (2F2F)',
    brand: 'Toyota',
    category: 'JDM Legend',
    specs: { topSpeed: '340 KM/H', acceleration: '3.4 SEC', power: '700 BHP', handling: 'RWD DRIFT' }
  },
  'bugatti_veyron_16.4_super_sport_scpd_enforcement.glb': {
    name: 'Bugatti Veyron 16.4 Super Sport (SCPD)',
    brand: 'Bugatti',
    category: 'W16 Interceptor',
    specs: { topSpeed: '431 KM/H', acceleration: '2.4 SEC', power: '1200 BHP', handling: 'AWD TITAN' }
  },
  '2026_lamborghini_fenomeno.glb': {
    name: '2026 Lamborghini Fenomeno',
    brand: 'Lamborghini',
    category: 'Vision Hypercar',
    specs: { topSpeed: '395 KM/H', acceleration: '2.3 SEC', power: '950 BHP', handling: 'AWD VECTOR' }
  },
  '2017_lamborghini_terzo_millennio.glb': {
    name: '2017 Lamborghini Terzo Millennio',
    brand: 'Lamborghini',
    category: 'Hyper-EV Concept',
    specs: { topSpeed: '380 KM/H', acceleration: '2.1 SEC', power: '1000 BHP', handling: 'AWD TORQUE' }
  },
  'ferrari_488_pista_widebody.glb': {
    name: 'Ferrari 488 Pista Widebody',
    brand: 'Ferrari',
    category: 'Scuderia Widebody',
    specs: { topSpeed: '345 KM/H', acceleration: '2.8 SEC', power: '720 BHP', handling: 'RWD PRECISION' }
  },
  '2020_dodge_challenger_srt_super_stock.glb': {
    name: '2020 Dodge Challenger SRT Super Stock',
    brand: 'Dodge',
    category: 'American Muscle',
    specs: { topSpeed: '326 KM/H', acceleration: '3.2 SEC', power: '807 BHP', handling: 'RWD MUSCLE' }
  },
  'bmw_m4_f82_razor_2014__www.vecarz.com.glb': {
    name: 'BMW M4 F82 Razor Edition',
    brand: 'BMW M Power',
    category: 'Track Spec Coupe',
    specs: { topSpeed: '330 KM/H', acceleration: '3.6 SEC', power: '550 BHP', handling: 'RWD AGILITY' }
  },
  '2027_tushek_aeon_e.glb': {
    name: '2027 Tushek Aeon E',
    brand: 'Tushek',
    category: 'Hyper Hybrid Titan',
    specs: { topSpeed: '410 KM/H', acceleration: '2.0 SEC', power: '1930 BHP', handling: 'AWD TITAN' }
  },
  'mclaren_spider.glb': {
    name: 'McLaren Spider GT',
    brand: 'McLaren',
    category: 'Open-Top Hypercar',
    specs: { topSpeed: '341 KM/H', acceleration: '2.9 SEC', power: '720 BHP', handling: 'RWD MONOCELL' }
  },
  'dominus_-_rocket_league_car.glb': {
    name: 'Dominus (Rocket League Edition)',
    brand: 'Psyonix',
    category: 'Rocket Battle-Car',
    specs: { topSpeed: '350 KM/H', acceleration: '2.2 SEC', power: 'SUPERSONIC', handling: 'ROCKET DRIFT' }
  },
  'super_muscle_burnout_dominator.glb': {
    name: 'Super Muscle Burnout Dominator',
    brand: 'Burnout Legends',
    category: 'Pro Drag & Drift',
    specs: { topSpeed: '315 KM/H', acceleration: '3.5 SEC', power: '680 BHP', handling: 'RWD BURNOUT' }
  }
};

// Known curated boat & ship presets
const CURATED_BOATS = {
  'boat.glb': {
    name: 'Paris Horizon Yacht Cruiser',
    brand: 'Riva Marine',
    category: 'Luxury Speedboat',
    targetLength: 10.5,
    waterlineOffset: 0.16,
    camScale: 2.3,
    specs: { topSpeed: '115 KM/H', acceleration: '3.6 SEC', power: '1400 BHP', handling: 'HYDRO JET' },
    tuning: { maxSpeed: 34, accelRate: 14, gripFactor: 0.85, turnMultiplier: 1.05 }
  },
  'tow_boat.glb': {
    name: 'Seine Harbor Tugboat',
    brand: 'Paris Port',
    category: 'Heavy Tug Vessel',
    targetLength: 11.2,
    waterlineOffset: 0.18,
    camScale: 2.4,
    specs: { topSpeed: '82 KM/H', acceleration: '4.9 SEC', power: '2600 BHP', handling: 'TWIN PROP' },
    tuning: { maxSpeed: 24, accelRate: 10, gripFactor: 0.9, turnMultiplier: 0.85 }
  },
  'aquitaine_-_french_ship.glb': {
    name: 'FS Aquitaine (D650) Frigate',
    brand: 'Marine Nationale',
    category: 'French Naval Warship',
    targetLength: 24.0,
    waterlineOffset: 0.22,
    camScale: 4.3,
    specs: { topSpeed: '105 KM/H', acceleration: '4.4 SEC', power: '32 MW', handling: 'TURBINE SHIP' },
    tuning: { maxSpeed: 30, accelRate: 11, gripFactor: 0.82, turnMultiplier: 0.72 }
  }
};

// Known curated helicopter presets
const CURATED_HELICOPTERS = {
  'helicopter.glb': {
    name: 'Paris Eurocopter EC135',
    brand: 'Airbus Heli',
    category: 'Twin-Turbine Rotorcraft',
    targetLength: 10.6,
    waterlineOffset: 0,
    camScale: 2.3,
    specs: { topSpeed: '255 KM/H', acceleration: '1.9 SEC', power: '1340 SHP', handling: 'TWIN TURBINE' },
    tuning: { maxSpeed: 62, accelRate: 22, climbRate: 16, turnMultiplier: 1.25 }
  },
  'sh-60b_seahawk_helicopter.glb': {
    name: 'Sikorsky SH-60B Seahawk',
    brand: 'Sikorsky Aero',
    category: 'Naval Twin-Rotor Hawk',
    targetLength: 14.8,
    waterlineOffset: 0,
    camScale: 3.1,
    specs: { topSpeed: '275 KM/H', acceleration: '2.2 SEC', power: '3800 SHP', handling: 'NAVAL HAWK' },
    tuning: { maxSpeed: 68, accelRate: 20, climbRate: 15, turnMultiplier: 1.05 }
  },
  'axis_fighter_plane.glb': {
    name: 'Axis Twin-Engine Interceptor',
    brand: 'Axis Aero',
    category: 'Twin-Prop Fighter Plane',
    flightMode: 'plane',
    targetLength: 9.0,
    waterlineOffset: 0,
    camScale: 2.7,
    specs: { topSpeed: '360 KM/H', acceleration: '2.4 SEC', power: '2400 HP', handling: 'AERO BANK' },
    tuning: { maxSpeed: 100, accelRate: 25, climbRate: 22, turnMultiplier: 1.18, flightMode: 'plane' }
  },
  'stylized_war_plane.glb': {
    name: 'Corsair Stylized Warplane',
    brand: 'SkyForge',
    category: 'Radial Prop Warbird',
    flightMode: 'plane',
    targetLength: 11.4,
    waterlineOffset: 0,
    camScale: 2.5,
    specs: { topSpeed: '330 KM/H', acceleration: '2.6 SEC', power: '2100 HP', handling: 'STOL WING' },
    tuning: { maxSpeed: 92, accelRate: 23, climbRate: 20, turnMultiplier: 1.22, flightMode: 'plane' }
  }
};

function scanModelFolder({ dirPath, manifestPath, urlPrefix, curatedMap, vehicleType, defaultBrand, defaultCategory, defaultSpecs, defaultTuning }) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const files = fs.readdirSync(dirPath).filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return (ext === '.glb' || ext === '.gltf') && !file.startsWith('.');
  });

  const list = files.map((file) => {
    const curated = curatedMap[file];
    return {
      id: file.replace(/\.(glb|gltf)$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-'),
      fileName: file,
      vehicleType,
      flightMode: curated?.flightMode || (/plane|jet|fighter/i.test(file) ? 'plane' : vehicleType),
      name: curated ? curated.name : cleanFileName(file),
      modelPath: `${urlPrefix}/${file}`,
      brand: curated ? curated.brand : defaultBrand,
      category: curated ? curated.category : defaultCategory,
      targetLength: curated?.targetLength || (vehicleType === 'boat' ? 11.0 : vehicleType === 'helicopter' ? 11.5 : 3.9),
      waterlineOffset: curated?.waterlineOffset ?? (vehicleType === 'boat' ? 0.18 : 0),
      camScale: curated?.camScale || (vehicleType === 'boat' ? 2.3 : vehicleType === 'helicopter' ? 2.5 : 1.0),
      specs: curated ? curated.specs : defaultSpecs,
      tuning: curated?.tuning || (/plane|jet|fighter/i.test(file) ? { ...defaultTuning, flightMode: 'plane' } : defaultTuning)
    };
  });

  try {
    fs.writeFileSync(manifestPath, JSON.stringify(list, null, 2));
  } catch (e) {
    console.warn(`Could not write ${path.basename(manifestPath)}:`, e);
  }
  return list;
}

// Unified Vite plugin to dynamically scan & watch public/cars-models and public/boats
function vehicleAutoScannerPlugin() {
  const sources = [
    {
      dirPath: path.resolve(process.cwd(), 'public/cars-models'),
      manifestPath: path.resolve(process.cwd(), 'public/cars-manifest.json'),
      urlPrefix: '/cars-models',
      apiRoute: '/api/cars',
      hmrEvent: 'cars-updated',
      curatedMap: CURATED_CARS,
      vehicleType: 'car',
      defaultBrand: 'Custom Garage',
      defaultCategory: 'Imported Racer',
      defaultSpecs: { topSpeed: '350 KM/H', acceleration: '2.8 SEC', power: '720 BHP', handling: 'CUSTOM AWD' },
      defaultTuning: { maxSpeed: 66, accelRate: 22, gripFactor: 0.9, turnMultiplier: 1.1 }
    },
    {
      dirPath: path.resolve(process.cwd(), 'public/boats'),
      manifestPath: path.resolve(process.cwd(), 'public/boats-manifest.json'),
      urlPrefix: '/boats',
      apiRoute: '/api/boats',
      hmrEvent: 'boats-updated',
      curatedMap: CURATED_BOATS,
      vehicleType: 'boat',
      defaultBrand: 'Seine Marine',
      defaultCategory: 'Watercraft',
      defaultSpecs: { topSpeed: '95 KM/H', acceleration: '4.0 SEC', power: '1500 BHP', handling: 'MARINE JET' },
      defaultTuning: { maxSpeed: 28, accelRate: 12, gripFactor: 0.85, turnMultiplier: 0.95 }
    },
    {
      dirPath: path.resolve(process.cwd(), 'public/Helicopters'),
      manifestPath: path.resolve(process.cwd(), 'public/helicopters-manifest.json'),
      urlPrefix: '/Helicopters',
      apiRoute: '/api/helicopters',
      hmrEvent: 'helicopters-updated',
      curatedMap: CURATED_HELICOPTERS,
      vehicleType: 'helicopter',
      defaultBrand: 'Paris Air',
      defaultCategory: 'Rotorcraft',
      defaultSpecs: { topSpeed: '250 KM/H', acceleration: '2.0 SEC', power: '1500 SHP', handling: 'VTOL FLIGHT' },
      defaultTuning: { maxSpeed: 62, accelRate: 21, climbRate: 15, turnMultiplier: 1.15 }
    }
  ];

  const scanAll = () => sources.forEach((src) => scanModelFolder(src));

  return {
    name: 'vehicle-auto-scanner',
    buildStart() {
      scanAll();
    },
    configureServer(server) {
      scanAll();

      sources.forEach((src) => {
        server.watcher.add(src.dirPath);
        server.middlewares.use(src.apiRoute, (req, res) => {
          const list = scanModelFolder(src);
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(JSON.stringify(list));
        });
      });

      server.watcher.on('all', (event, filePath) => {
        const matched = sources.find((src) => filePath.startsWith(src.dirPath));
        if (matched) {
          console.log(`[AutoScanner] Detected change (${event}):`, path.basename(filePath));
          const updated = scanModelFolder(matched);
          server.ws.send({ type: 'custom', event: matched.hmrEvent, data: updated });
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), vehicleAutoScannerPlugin()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('node_modules/@react-three') || id.includes('three-mesh-bvh')) {
            return 'three-vendor';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/zustand')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/lucide-react') || id.includes('node_modules/canvas-confetti')) {
            return 'ui-vendor';
          }
        }
      }
    }
  },
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.hdr']
});
