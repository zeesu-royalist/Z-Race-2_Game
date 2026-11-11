import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { X, Car, Ship, Fan, Check, Gauge, Zap, Flame, Compass, FolderSync } from 'lucide-react';

const TAB_ORDER = ['car', 'boat', 'helicopter'];

const TAB_META = {
  car: {
    tabLabel: 'CARS',
    Icon: Car,
    folder: 'public/cars-models/',
    noun: 'vehicles',
    brandFallback: 'HYPERCAR',
    speedFallback: '360 KM/H',
    accelLabel: '0-100',
    accelFallback: '2.8 SEC',
    powerFallback: '750 BHP',
    driveLabel: 'DRIVE',
    driveFallback: 'AWD',
    activeText: 'CURRENTLY DRIVING',
    resumeText: 'RESUME DRIVING',
    ctaText: () => 'SELECT & DRIVE'
  },
  boat: {
    tabLabel: 'BOATS & SHIPS',
    Icon: Ship,
    folder: 'public/boats/',
    noun: 'vessels',
    brandFallback: 'MARINE',
    speedFallback: '95 KM/H',
    accelLabel: '0-MAX',
    accelFallback: '4.2 SEC',
    powerFallback: '1500 BHP',
    driveLabel: 'PROPULSION',
    driveFallback: 'HYDRO JET',
    activeText: 'CURRENTLY SAILING',
    resumeText: 'RESUME SAILING',
    ctaText: () => 'LAUNCH ON SEINE'
  },
  helicopter: {
    tabLabel: 'AIRCRAFT',
    Icon: Fan,
    folder: 'public/Helicopters/',
    noun: 'aircraft',
    brandFallback: 'AIR',
    speedFallback: '260 KM/H',
    accelLabel: 'TAKEOFF',
    accelFallback: '2.0 SEC',
    powerFallback: '1500 SHP',
    driveLabel: 'ROTOR',
    driveFallback: 'VTOL',
    activeText: 'CURRENTLY FLYING',
    resumeText: 'RESUME FLIGHT',
    ctaText: (item) => (item.flightMode === 'plane' ? 'LAUNCH FROM RUNWAY' : 'LAUNCH FROM HELIPAD')
  }
};

function CarCustomizerContent({ onClose }) {
  const cars = useGameStore((s) => s.cars);
  const boats = useGameStore((s) => s.boats);
  const helicopters = useGameStore((s) => s.helicopters);
  const vehicleType = useGameStore((s) => s.vehicleType);
  const currentCarId = useGameStore((s) => s.currentCarId);

  const [activeTab, setActiveTab] = useState(vehicleType);
  const meta = TAB_META[activeTab] || TAB_META.car;
  const HeaderIcon = meta.Icon;
  const pools = { car: cars, boat: boats, helicopter: helicopters };
  const items = pools[activeTab] || cars;

  const handleSelect = (id) => {
    useGameStore.getState().selectVehicle(id, activeTab);
    onClose();
  };

  const handleRescan = () => {
    const st = useGameStore.getState();
    st.fetchCars();
    st.fetchBoats();
    st.fetchHelicopters();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card garage-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <HeaderIcon className="text-cyan" size={26} />
            <div>
              <h2>GARAGE, MARINA &amp; AIRFIELD</h2>
              <span className="modal-subtitle">
                {items.length} {meta.noun} detected in <code>{meta.folder}</code>
              </span>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="garage-tabs">
          {TAB_ORDER.map((id) => {
            const { tabLabel, Icon } = TAB_META[id];
            return (
              <button
                key={id}
                type="button"
                className={`garage-tab ${activeTab === id ? 'garage-tab-active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon size={15} />
                <span>{tabLabel} ({pools[id].length})</span>
              </button>
            );
          })}
        </div>

        <div className="modal-body">
          <div className="car-selection-grid">
            {items.map((item) => {
              const isSelected = item.id === currentCarId;
              const specs = item.specs;
              return (
                <div
                  key={item.id}
                  className={`car-card ${isSelected ? 'car-card-active' : ''}`}
                  onClick={() => handleSelect(item.id)}
                >
                  <div className="car-card-header">
                    <span className="car-brand-badge">{item.brand || meta.brandFallback}</span>
                    <span className="car-category-tag">{item.category}</span>
                  </div>

                  <h3 className="car-card-title">{item.name}</h3>
                  <div className="car-filename-tag">{item.fileName || item.modelPath.split('/').pop()}</div>

                  <div className="car-specs-row">
                    <div className="car-spec-item">
                      <span className="car-spec-title"><Gauge size={12} /> TOP SPEED</span>
                      <span className="car-spec-value">{specs?.topSpeed || meta.speedFallback}</span>
                    </div>
                    <div className="car-spec-item">
                      <span className="car-spec-title"><Zap size={12} /> {meta.accelLabel}</span>
                      <span className="car-spec-value">{specs?.acceleration || meta.accelFallback}</span>
                    </div>
                    <div className="car-spec-item">
                      <span className="car-spec-title"><Flame size={12} /> POWER</span>
                      <span className="car-spec-value">{specs?.power || meta.powerFallback}</span>
                    </div>
                    <div className="car-spec-item">
                      <span className="car-spec-title"><Compass size={12} /> {meta.driveLabel}</span>
                      <span className="car-spec-value">{specs?.handling || meta.driveFallback}</span>
                    </div>
                  </div>

                  <div className="car-card-action">
                    {isSelected ? (
                      <span className="active-car-pill">
                        <Check size={16} /> {meta.activeText}
                      </span>
                    ) : (
                      <button className="select-car-btn">{meta.ctaText(item)}</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-footer">
          <button className="refresh-cars-btn" onClick={handleRescan}>
            <FolderSync size={16} /> Rescan Folder
          </button>
          <button className="primary-btn" onClick={onClose}>
            {(TAB_META[vehicleType] || TAB_META.car).resumeText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CarCustomizerModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return <CarCustomizerContent onClose={onClose} />;
}
