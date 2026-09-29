/**
 * Map document shapes. Split out of mapStore so the store file stays under
 * the 600-line hard limit (Plans/CODEBASE_HEALTH.md).
 */
import type { FarmEnterpriseId, GeometryKindId, TreeSpeciesId } from '../../shared/farm/farmTypes';
import type { InfraTypeId } from '../../shared/farm/infraTypes';

export interface OrchardBlock {
  id: string;
  name: string;
  /** Cultivar / variety / crop label (kept for walnut chill + legacy UI). */
  cultivar: string;
  /** Tree/vine species when cropKind is orchard/fruit/vineyard (e.g. walnut). */
  species?: TreeSpeciesId | string;
  /** Which enterprise this paddock belongs to on a mixed farm. */
  cropKind?: FarmEnterpriseId;
  /** Map interpretation — boundary vs water zone vs dam (skeleton). */
  geometryKind?: GeometryKindId;
  /** Broadacre / hort season label skeleton (e.g. "2026 winter cereal"). */
  seasonLabel?: string;
  density: string;
  rowSpacing?: number;
  treeSpacing?: number;
  treeHeight?: number;
  canopyWidth?: number;
  canopyClosure?: number;
  irrigation: string;
  areaHa?: number;
  geojson: any;
  /**
   * Varieties drawn inside this paddock. The outer polygon stays `geojson`.
   * Firestore stores the array as a JSON string (nested coordinates).
   */
  cultivarParts?: {
    id: string;
    cultivar: string;
    geojson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
    areaHa: number;
  }[];
  updatedAt?: string;
}

export interface InfrastructurePin {
  id: string;
  name: string;
  /** Sensor + farm assets (dam, internal zones, pipe, vehicle, fuel, hazard, …). */
  type: InfraTypeId;
  status: 'active' | 'warning' | 'offline';
  /** Label / centroid — always set (even for polygon/line assets). */
  lat: number;
  lng: number;
  /** Polygon (dam / internal) or LineString (pipeline) GeoJSON Feature/geometry. */
  geojson?: unknown;
  /** Optional Meshy / third-party tracker id (vehicles) — reserved. */
  trackerId?: string;
  notes?: string;
}

export interface FarmTrack {
  id: string;
  name: string;
  category: 'primary' | 'secondary' | 'service';
  geojson: any;
  createdAt: string;
}

export interface MapViewport {
  lat: number;
  lng: number;
  zoom: number;
}
