import React, { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { X, Car, Check, Gauge, Zap, Flame, Compass, FolderSync, Sparkles } from 'lucide-react';

export function CarCustomizerModal({ isOpen, onClose }) {
  const cars = useGameStore((s) => s.cars);
  const currentCarId = useGameStore((s) => s.currentCarId);
  const selectCar = useGameStore((s) => s.selectCar);
  const fetchCars = useGameStore((s) => s.fetchCars);

  // Fetch cars if catalog is empty when modal is opened
  useEffect(() => {
    if (isOpen && cars.length === 0) {
      fetchCars();
    }
  }, [isOpen, fetchCars, cars.length]);

  if (!isOpen) return null;

  const handleSelect = (carId) => {
    selectCar(carId);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card garage-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-row">
            <Car className="text-cyan" size={26} />
            <div>
              <h2>VEHICLE SELECTOR & GARAGE</h2>
              <span className="modal-subtitle">
                {cars.length} vehicles detected in <code>public/cars-models/</code>
              </span>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">

          {/* CARS SHOWCASE GRID */}
          <div className="car-selection-grid">
            {cars.map((car) => {
              const isSelected = car.id === currentCarId;

              return (
                <div
                  key={car.id}
                  className={`car-card ${isSelected ? 'car-card-active' : ''}`}
                  onClick={() => handleSelect(car.id)}
                >
                  {/* Top Header */}
                  <div className="car-card-header">
                    <span className="car-brand-badge">{car.brand || 'HYPERCAR'}</span>
                    <span className="car-category-tag">{car.category}</span>
                  </div>

                  {/* Car Name */}
                  <h3 className="car-card-title">{car.name}</h3>
                  <div className="car-filename-tag">{car.fileName || car.modelPath.split('/').pop()}</div>

                  {/* Specs Matrix */}
                  <div className="car-specs-row">
                    <div className="car-spec-item">
                      <span className="car-spec-title">
                        <Gauge size={12} /> TOP SPEED
                      </span>
                      <span className="car-spec-value">{car.specs?.topSpeed || '360 KM/H'}</span>
                    </div>
                    <div className="car-spec-item">
                      <span className="car-spec-title">
                        <Zap size={12} /> 0-100
                      </span>
                      <span className="car-spec-value">{car.specs?.acceleration || '2.8 SEC'}</span>
                    </div>
                    <div className="car-spec-item">
                      <span className="car-spec-title">
                        <Flame size={12} /> POWER
                      </span>
                      <span className="car-spec-value">{car.specs?.power || '750 BHP'}</span>
                    </div>
                    <div className="car-spec-item">
                      <span className="car-spec-title">
                        <Compass size={12} /> DRIVE
                      </span>
                      <span className="car-spec-value">{car.specs?.handling || 'AWD'}</span>
                    </div>
                  </div>

                  {/* Select Button */}
                  <div className="car-card-action">
                    {isSelected ? (
                      <span className="active-car-pill">
                        <Check size={16} /> CURRENTLY DRIVING
                      </span>
                    ) : (
                      <button className="select-car-btn">
                        SELECT & DRIVE
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
          <button className="refresh-cars-btn" onClick={() => fetchCars()}>
            <FolderSync size={16} /> Rescan Folder
          </button>
          <button className="primary-btn" onClick={onClose}>
            RESUME DRIVING
          </button>
        </div>
      </div>
    </div>
  );
}
