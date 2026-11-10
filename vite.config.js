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

// Known curated presets dictionary
const CURATED_CARS = {
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

// Vite plugin to dynamically scan & watch public/cars-models
function carAutoScannerPlugin() {
  const carsDir = path.resolve(process.cwd(), 'public/cars-models');
  const manifestPath = path.resolve(process.cwd(), 'public/cars-manifest.json');

  function scanCars() {
    if (!fs.existsSync(carsDir)) {
      fs.mkdirSync(carsDir, { recursive: true });
    }

    const files = fs.readdirSync(carsDir).filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return (ext === '.glb' || ext === '.gltf') && !file.startsWith('.');
    });

    const carList = files.map((file) => {
      const curated = CURATED_CARS[file];
      const name = curated ? curated.name : cleanFileName(file);
      const brand = curated ? curated.brand : 'Custom Garage';
      const category = curated ? curated.category : 'Imported Racer';
      const specs = curated ? curated.specs : {
        topSpeed: '350 KM/H',
        acceleration: '2.8 SEC',
        power: '720 BHP',
        handling: 'CUSTOM AWD'
      };

      return {
        id: file.replace(/\.(glb|gltf)$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-'),
        fileName: file,
        name: name,
        modelPath: `/cars-models/${file}`,
        brand: brand,
        category: category,
        specs: specs,
        tuning: {
          maxSpeed: 66,
          accelRate: 22,
          gripFactor: 0.9,
          turnMultiplier: 1.1
        }
      };
    });

    try {
      fs.writeFileSync(manifestPath, JSON.stringify(carList, null, 2));
    } catch (e) {
      console.warn('Could not write cars-manifest.json:', e);
    }

    return carList;
  }

  return {
    name: 'car-auto-scanner',
    buildStart() {
      scanCars();
    },
    configureServer(server) {
      scanCars();

      server.watcher.add(carsDir);
      server.watcher.on('all', (event, filePath) => {
        if (filePath.startsWith(carsDir)) {
          console.log(`[AutoScanner] Detected file change (${event}):`, path.basename(filePath));
          const updatedCars = scanCars();
          server.ws.send({
            type: 'custom',
            event: 'cars-updated',
            data: updatedCars
          });
        }
      });

      server.middlewares.use('/api/cars', (req, res) => {
        const carList = scanCars();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(JSON.stringify(carList));
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), carAutoScannerPlugin()],
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
