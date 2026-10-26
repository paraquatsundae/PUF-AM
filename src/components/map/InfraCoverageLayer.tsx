import { Circle } from 'react-leaflet';
import { effectiveSensorRadiusM } from '../../../shared/farm/sensorCoverage';
import { useSensorCoverageRadii } from '../../hooks/useSensorCoverageRadii';
import type { InfrastructurePin } from '../../lib/mapStore';

const COVERAGE_COLOR: Record<string, string> = {
  weather: '#2563eb',
  soil: '#d97706',
  irrigation: '#0891b2',
};

export function InfraCoverageLayer({
  pins,
  farmId,
}: {
  pins: InfrastructurePin[];
  farmId?: string;
}) {
  const radii = useSensorCoverageRadii(farmId);
  return (
    <>
      {pins.map((pin) => {
        if (pin.status === 'offline') return null;
        const color = COVERAGE_COLOR[pin.type];
        if (!color) return null;
        const radius = effectiveSensorRadiusM(pin.type, radii[pin.id]);

        return (
          <Circle
            key={`coverage-${pin.id}-${radius}`}
            center={[pin.lat, pin.lng]}
            radius={radius}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.1,
              weight: 1,
              dashArray: '4 4',
            }}
          />
        );
      })}
    </>
  );
}
