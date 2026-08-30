import { Circle } from 'react-leaflet';
import type { InfrastructurePin } from '../../lib/mapStore';

export function InfraCoverageLayer({ pins }: { pins: InfrastructurePin[] }) {
  return (
    <>
      {pins.map((pin) => {
        if (pin.status === 'offline') return null;

        let radius = 0;
        let color = '';

        if (pin.type === 'weather') { radius = 500; color = '#2563eb'; }
        else if (pin.type === 'soil') { radius = 50; color = '#d97706'; }
        else if (pin.type === 'irrigation') { radius = 150; color = '#0891b2'; }
        else return null; // dams, pipes, vehicles, fuel, hazards — no coverage circle

        return (
          <Circle
            key={`coverage-${pin.id}`}
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
