import { useEffect, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import * as turf from '@turf/turf';
import L from '../../lib/leaflet-setup';
import type { OrchardBlock } from '../../lib/mapStore';
import type { FieldIssue } from '../../lib/fieldStore';
import { isOpenIssue } from '../../lib/blockIssueCounts';

type Props = {
  blocks: OrchardBlock[];
  issues: FieldIssue[];
  openIssuesByBlock: Record<string, number>;
  showFlags: boolean;
  onSelectBlock: (blockId: string) => void;
  onSelectIssue: (issue: FieldIssue) => void;
};

function priorityColor(priority: FieldIssue['priority']): string {
  if (priority === 'high') return '#dc2626';
  if (priority === 'medium') return '#ea580c';
  return '#ca8a04';
}

function badgeIcon(count: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="
      min-width:22px;height:22px;padding:0 6px;border-radius:999px;
      background:#b45309;color:#fff;font:700 11px/22px system-ui,sans-serif;
      text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.35);
      border:2px solid #fff;
    ">${count > 99 ? '99+' : count}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function flagIcon(issue: FieldIssue): L.DivIcon {
  const color = priorityColor(issue.priority);
  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);
      background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);
      display:flex;align-items:center;justify-content:center;
    "><span style="transform:rotate(45deg);color:#fff;font-size:12px;font-weight:700;">!</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

/**
 * Operate-map overlays: always show per-block open-issue badges;
 * optionally show individual issue flags when the Issues layer is on.
 */
export function OperateIssuesLayer({
  blocks,
  issues,
  openIssuesByBlock,
  showFlags,
  onSelectBlock,
  onSelectIssue,
}: Props) {
  const map = useMap();

  const openIssues = useMemo(() => issues.filter(isOpenIssue), [issues]);

  const blockCenters = useMemo(() => {
    const centers: Record<string, [number, number]> = {};
    for (const block of blocks) {
      if (!block.geojson) continue;
      try {
        const c = turf.centerOfMass(block.geojson);
        centers[block.id] = [c.geometry.coordinates[1], c.geometry.coordinates[0]];
      } catch {
        /* skip */
      }
    }
    return centers;
  }, [blocks]);

  useEffect(() => {
    const group = L.layerGroup().addTo(map);

    for (const block of blocks) {
      const count = openIssuesByBlock[block.id] || 0;
      if (count <= 0) continue;
      const center = blockCenters[block.id];
      if (!center) continue;
      const marker = L.marker(center, {
        icon: badgeIcon(count),
        interactive: true,
        zIndexOffset: 200,
      });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectBlock(block.id);
      });
      marker.addTo(group);
    }

    if (showFlags) {
      for (const issue of openIssues) {
        const marker = L.marker([issue.lat, issue.lng], {
          icon: flagIcon(issue),
          interactive: true,
          zIndexOffset: 400,
        });
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectIssue(issue);
        });
        marker.addTo(group);
      }
    }

    return () => {
      map.removeLayer(group);
    };
  }, [
    map,
    blocks,
    blockCenters,
    openIssuesByBlock,
    openIssues,
    showFlags,
    onSelectBlock,
    onSelectIssue,
  ]);

  return null;
}
