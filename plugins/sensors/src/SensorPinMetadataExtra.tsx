import { canWriteFarmData } from '../../../shared/auth/farmModules';
import { isPackActive } from '../../../shared/farm/cropPacks';
import { isSensorInfraType } from '../../../shared/farm/infraTypes';
import { defaultBinding } from '../../../shared/farm/sensorBindings';
import { SENSORS_PACK_ID } from '../../../shared/farm/sensorsPackage';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useMapStore } from '../../../src/lib/mapStore';
import type { PackPinProps } from '../../../src/packs/types';
import { SensorBindingFields } from './SensorBindingFields';
import { SensorCoverageFields } from './SensorCoverageFields';
import { useSensorSettings } from './useSensorSettings';

/** Pin editor extra — source and paddock. Core must not import this file. */
export function SensorPinMetadataExtra({ pin }: PackPinProps) {
  const { farmCropPacks, userData } = useAuth();
  const farmId = userData?.farmId;
  const { blocks } = useMapStore();
  const canEdit = canWriteFarmData(userData?.role);
  const { settings, upsertBinding } = useSensorSettings(farmId, canEdit);

  if (!isPackActive(farmCropPacks, SENSORS_PACK_ID)) return null;
  if (!isSensorInfraType(pin.type)) return null;

  const binding = settings.bindings[pin.id] ?? defaultBinding();

  return (
    <div className="space-y-1.5 pt-1 border-t border-slate-100">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
        Sensor source
      </p>
      <SensorCoverageFields
        pinId={pin.id}
        pin={pin}
        binding={binding}
        blocks={blocks}
        disabled={!canEdit}
        onChange={(next) => void upsertBinding(pin.id, next)}
      />
      <SensorBindingFields
        binding={binding}
        disabled={!canEdit}
        onChange={(next) => void upsertBinding(pin.id, next)}
      />
    </div>
  );
}
