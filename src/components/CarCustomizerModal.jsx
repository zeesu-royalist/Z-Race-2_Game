import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { X, Car, Ship, Fan, Check, Gauge, Zap, Flame, Compass, FolderSync } from 'lucide-react';

export function CarCustomizerModal({ isOpen, onClose }) {
  const cars = useGameStore((s) => s.cars);
  const boats = useGameStore((s) => s.boats);
  const helicopters = useGameStore((s) => s.helicopters);
  const vehicleType = useGameStore((s) => s.vehicleType);
  const currentCarId = useGameStore((s) => s.currentCarId);
  const selectVehicle = useGameStore((s) => s.selectVehicle);
  const fetchCars = useGameStore((s) => s.fetchCars);
  const fetchBoats = useGameStore((s) => s.fetchBoats);
  const fetchHelicopters = useGameStore((s) => s.fetchHelicopters);

  const [activeTab, setActiveTab] = useState(vehicleType);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(vehicleType);
    if (cars.length === 0) fetchCars();
    if (boats.length === 0) fetchBoats();
    if (helicopters.length === 0) fetchHelicopters();
  }, [isOpen, vehicleType, fetchCars, fetchBoats, fetchHelicopters, cars.length, boats.length, helicopters.length]);

  if (!isOpen) return null;

  const isBoatTab = activeTab === 'boat';
  const isHeliTab = activeTab === 'helicopter';
  const items = isHeliTab ? helicopters : isBoatTab ? boats : cars;

  const handleSelect = (id) => {
    selectVehicle(id, activeTab);
    onClose();
  };

  const tabs = [
    { id: 'car', label: `CARS (${cars.length})`, Icon: Car },
    { id: 'boat', label: `BOATS & SHIPS (${boats.length})`, Icon: Ship },
    { id: 'helicopter', label: `HELICOPTERS (${helicopters.length})`, Icon: Fan }
  ];

  const folderHint = isHeliTab ? 'public/Helicopters/' : isBoatTab ? 'public/boats/' : 'public/cars-models/';
  const noun = isHeliTab ? 'helicopters' : isBoatTab ? 'vessels' : 'vehicles';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card garage-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-row">
            {isHeliTab ? <Fan className="text-cyan" size={26} /> : isBoatTab ? <Ship className="text-cyan" size={26} /> : <Car className="text-cyan" size={26} />}
            <div>
              <h2>GARAGE, MARINA &amp; HELIPAD</h2>
              <span className="modal-subtitle">
                {items.length} {noun} detected in <code>{folderHint}</code>
              </span>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Category Switcher Tabs */}
        <div className="garage-tabs">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`garage-tab ${activeTab === id ? 'garage-tab-active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          <div className="car-selection-grid">
            {items.map((item) => {
              const isSelected = item.id === currentCarId;

              return (
                <div
                  key={item.id}
                  className={`car-card ${isSelected ? 'car-card-active' : ''}`}
                  onClick={() => handleSelect(item.id)}
                >
                  <div className="car-card-header">
                    <span className="car-brand-badge">
                      {item.brand || (isHeliTab ? 'AIR' : isBoatTab ? 'MARINE' : 'HYPERCAR')}
                    </span>
                    <span className="car-category-tag">{item.category}</span>
                  </div>

                  <h3 className="car-card-title">{item.name}</h3>
                  <div className="car-filename-tag">{item.fileName || item.modelPath.split('/').pop()}</div>

                  <div className="car-specs-row">
                    <div className="car-spec-item">
                      <span className="car-spec-title">
                        <Gauge size={12} /> TOP SPEED
                      </span>
                      <span className="car-spec-value">
                        {item.specs?.topSpeed || (isHeliTab ? '260 KM/H' : isBoatTab ? '95 KM/H' : '360 KM/H')}
                      </span>
                    </div>
                    <div className="car-spec-item">
                      <span className="car-spec-title">
                        <Zap size={12} /> {isHeliTab ? 'TAKEOFF' : isBoatTab ? '0-MAX' : '0-100'}
                      </span>
                      <span className="car-spec-value">
                        {item.specs?.acceleration || (isHeliTab ? '2.0 SEC' : isBoatTab ? '4.2 SEC' : '2.8 SEC')}
                      </span>
                    </div>
                    <div className="car-spec-item">
                      <span className="car-spec-title">
                        <Flame size={12} /> POWER
                      </span>
                      <span className="car-spec-value">
                        {item.specs?.power || (isHeliTab ? '1500 SHP' : isBoatTab ? '1500 BHP' : '750 BHP')}
                      </span>
                    </div>
                    <div className="car-spec-item">
                      <span className="car-spec-title">
                        <Compass size={12} /> {isHeliTab ? 'ROTOR' : isBoatTab ? 'PROPULSION' : 'DRIVE'}
                      </span>
                      <span className="car-spec-value">
                        {item.specs?.handling || (isHeliTab ? 'VTOL' : isBoatTab ? 'HYDRO JET' : 'AWD')}
                      </span>
                    </div>
                  </div>

                  <div className="car-card-action">
                    {isSelected ? (
                      <span className="active-car-pill">
                        <Check size={16} /> {isHeliTab ? 'CURRENTLY FLYING' : isBoatTab ? 'CURRENTLY SAILING' : 'CURRENTLY DRIVING'}
                      </span>
                    ) : (
                      <button className="select-car-btn">
                        {isHeliTab ? 'LAUNCH FROM HELIPAD' : isBoatTab ? 'LAUNCH ON SEINE' : 'SELECT & DRIVE'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="refresh-cars-btn"
            onClick={() => {
              fetchCars();
              fetchBoats();
              fetchHelicopters();
            }}
          >
            <FolderSync size={16} /> Rescan Folder
          </button>
          <button className="primary-btn" onClick={onClose}>
            {vehicleType === 'helicopter' ? 'RESUME FLIGHT' : vehicleType === 'boat' ? 'RESUME SAILING' : 'RESUME DRIVING'}
          </button>
        </div>
      </div>
    </div>
  );
}
