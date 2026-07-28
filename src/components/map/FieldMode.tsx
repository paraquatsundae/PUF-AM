import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMap, useMapEvents, Marker } from 'react-leaflet';
import { MapPin, Camera, Mic, Navigation, Layers, Play, Square, Save, X, Check, Loader2, ClipboardList, AlertTriangle, CheckCircle2, Clock, Lock, Unlock, Trash2 } from 'lucide-react';
import * as turf from '@turf/turf';
import { useFieldStore, FieldIssue, PathTrace, Bounds } from '../../lib/fieldStore';
import { useMapStore } from '../../lib/mapStore';
import { useTaskStore, Task } from '../../lib/taskStore';
import { useAuth } from '../../contexts/AuthContext';
import { storageApi } from '../../services/storage';
import { blobToPreviewDataUrl, enqueuePhoto } from '../../lib/photoOutbox';
import { motion, AnimatePresence } from 'motion/react';
import L from '../../lib/leaflet-setup';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '../../lib/utils';
import debounce from 'lodash/debounce';
import { trackPathStyle } from '../../lib/trackMapStyles';

export function FieldMode({ farmId, mapLayer, setMapLayer }: { farmId: string, mapLayer: 'vector' | 'satellite', setMapLayer: (layer: 'vector' | 'satellite') => void }) {
  const map = useMap();
  const { userData } = useAuth();
  const { blocks, pins, tracks, setBounds: setMapBounds, setViewport, isLocked, setLocked } = useMapStore();
  const { issues, pathTraces, loadData, addIssue, addPathTrace, updateIssue, archiveIssue, setBounds: setFieldBounds } = useFieldStore();
  const { tasks, activeLocations, loadTasks, updateUserLocation, updateTaskStatus } = useTaskStore();
  
  // Viewport-based loading logic
  const updateBounds = useCallback(
    debounce((m: L.Map) => {
      const bounds = m.getBounds();
      const center = m.getCenter();
      const zoom = m.getZoom();

      const newBounds: Bounds = {
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
        minLng: bounds.getWest(),
        maxLng: bounds.getEast()
      };
      setFieldBounds(newBounds);
      setMapBounds(newBounds);
      setViewport({ lat: center.lat, lng: center.lng, zoom });
    }, 500),
    [setFieldBounds, setMapBounds, setViewport]
  );

  useMapEvents({
    moveend: (e) => {
      updateBounds(e.target);
    }
  });

  // Initial bounds set
  useEffect(() => {
    updateBounds(map);
  }, [map, updateBounds]);

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const [placementMode, setPlacementMode] = useState(false);
  const [pendingPinLocation, setPendingPinLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isRecordingPath, setIsRecordingPath] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ lat: number; lng: number; timestamp: number }[]>([]);
  const [pathStartTime, setPathStartTime] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showIssueDetails, setShowIssueDetails] = useState<FieldIssue | null>(null);

  const isReportingRef = useRef(isReporting);
  const placementModeRef = useRef(placementMode);
  const instructionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    isReportingRef.current = isReporting;
  }, [isReporting]);

  useEffect(() => {
    placementModeRef.current = placementMode;
  }, [placementMode]);

  useEffect(() => {
    if (instructionsRef.current) {
      L.DomEvent.disableClickPropagation(instructionsRef.current);
    }
  }, [placementMode]);

  const pathPolylineRef = useRef<L.Polyline | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const issueMarkersRef = useRef<L.LayerGroup | null>(null);
  const blocksLayerRef = useRef<L.LayerGroup | null>(null);
  const pinsLayerRef = useRef<L.LayerGroup | null>(null);
  const tracksLayerRef = useRef<L.LayerGroup | null>(null);
  const glowLayerRef = useRef<L.LayerGroup | null>(null);
  const otherUsersLayerRef = useRef<L.LayerGroup | null>(null);
  const leadInLayerRef = useRef<L.LayerGroup | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<{ lat: number; lng: number; timestamp: number; taskId: string | null } | null>(null);
  const issueMarkersMapRef = useRef<Map<string, L.Marker>>(new Map());
  const otherUsersMarkersMapRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const blocksMarkersMapRef = useRef<Map<string, L.Layer>>(new Map());
  const pinsMarkersMapRef = useRef<Map<string, L.Marker>>(new Map());
  const tracksMarkersMapRef = useRef<Map<string, L.Layer>>(new Map());
  const glowMarkersMapRef = useRef<Map<string, L.LayerGroup>>(new Map());

  // Map Lifecycle Management - Handle creation and cleanup of all manual Leaflet layers
  useEffect(() => {
    // Create layer groups
    // Phase 3.2: Use MarkerClusterGroup for issues and pins to optimize rendering
    const issueGroup = (L as any).markerClusterGroup({
      maxClusterRadius: 50,
      disableClusteringAtZoom: 18,
      spiderfyOnMaxZoom: true
    }).addTo(map);
    
    const blocksGroup = L.layerGroup().addTo(map);
    
    const pinsGroup = (L as any).markerClusterGroup({
      maxClusterRadius: 40,
      disableClusteringAtZoom: 18
    }).addTo(map);
    
    const tracksGroup = L.layerGroup().addTo(map);
    const glowGroup = L.layerGroup().addTo(map);
    const otherUsersGroup = L.layerGroup().addTo(map);
    const leadInGroup = L.layerGroup().addTo(map);

    issueMarkersRef.current = issueGroup;
    blocksLayerRef.current = blocksGroup;
    pinsLayerRef.current = pinsGroup;
    tracksLayerRef.current = tracksGroup;
    glowLayerRef.current = glowGroup;
    otherUsersLayerRef.current = otherUsersGroup;
    leadInLayerRef.current = leadInGroup;

    return () => {
      // Cleanup all layer groups from the map
      issueGroup.clearLayers();
      issueGroup.remove();
      blocksGroup.clearLayers();
      blocksGroup.remove();
      pinsGroup.clearLayers();
      pinsGroup.remove();
      tracksGroup.clearLayers();
      tracksGroup.remove();
      glowGroup.clearLayers();
      glowGroup.remove();
      otherUsersGroup.clearLayers();
      otherUsersGroup.remove();
      leadInGroup.clearLayers();
      leadInGroup.remove();

      // Clear all tracking maps
      issueMarkersMapRef.current.clear();
      blocksMarkersMapRef.current.clear();
      pinsMarkersMapRef.current.clear();
      tracksMarkersMapRef.current.clear();
      glowMarkersMapRef.current.clear();
      otherUsersMarkersMapRef.current.clear();

      // Clear individual refs
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      if (pathPolylineRef.current) {
        pathPolylineRef.current.remove();
        pathPolylineRef.current = null;
      }

      issueMarkersRef.current = null;
      blocksLayerRef.current = null;
      pinsLayerRef.current = null;
      tracksLayerRef.current = null;
      glowLayerRef.current = null;
      otherUsersLayerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    loadData(farmId);
    loadTasks(farmId);
  }, [farmId, loadData, loadTasks]);

  // Find active task for current user
  useEffect(() => {
    if (userData?.uid && tasks.length > 0) {
      const myTask = tasks.find(t => t.assignedTo === userData.uid && t.status !== 'completed');
      setActiveTask(myTask || null);
    } else {
      setActiveTask(null);
    }
  }, [tasks, userData?.uid]);

  // Update real-time location in Firestore with STRICT throttling for scalability (Phase 3.1)
  useEffect(() => {
    if (!userLocation || !userData?.uid || !farmId) return;

    const now = Date.now();
    const lastUpdate = lastUpdateRef.current;
    const currentTaskId = activeTask?.id || null;

    let shouldUpdate = false;

    if (!lastUpdate) {
      shouldUpdate = true;
    } else {
      const timeElapsed = now - lastUpdate.timestamp;
      const taskIdChanged = currentTaskId !== lastUpdate.taskId;
      
      // Calculate distance using turf
      const from = turf.point([lastUpdate.lng, lastUpdate.lat]);
      const to = turf.point([userLocation.lng, userLocation.lat]);
      const distance = turf.distance(from, to, { units: 'meters' });

      // Phase 3.1: Strict Throttling
      // Only update if:
      // 1. Task changed
      // 2. Moved > 20 meters AND at least 30 seconds have passed
      // 3. Heartbeat every 2 minutes (120,000 ms) regardless of movement
      if (taskIdChanged || (distance >= 20 && timeElapsed >= 30000) || timeElapsed >= 120000) {
        shouldUpdate = true;
      }
    }

    if (shouldUpdate) {
      updateUserLocation(farmId, userData.uid, {
        lat: userLocation.lat,
        lng: userLocation.lng,
        activeTaskId: currentTaskId
      });
      lastUpdateRef.current = {
        lat: userLocation.lat,
        lng: userLocation.lng,
        timestamp: now,
        taskId: currentTaskId
      };
    }
  }, [userLocation, userData?.uid, farmId, activeTask?.id, updateUserLocation]);

  // Geolocation tracking
  useEffect(() => {
    if (!navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });

        if (isRecordingPath) {
          setCurrentPath(prev => [...prev, { lat: latitude, lng: longitude, timestamp: Date.now() }]);
        }
      },
      (error) => console.error("Geolocation error:", error),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isRecordingPath]);

  // Draw user location
  useEffect(() => {
    if (!userLocation || !map) return;
    
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 8,
        fillColor: '#3b82f6',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    }
  }, [userLocation, map]);

  // Draw current path
  useEffect(() => {
    if (currentPath.length < 2 || !map) return;

    if (!pathPolylineRef.current) {
      pathPolylineRef.current = L.polyline(currentPath.map(p => [p.lat, p.lng]), {
        color: '#ef4444',
        weight: 4,
        dashArray: '10, 10'
      }).addTo(map);
    } else {
      pathPolylineRef.current.setLatLngs(currentPath.map(p => [p.lat, p.lng]));
    }
  }, [currentPath, map]);

  // Handle map clicks for manual pin placement
  useEffect(() => {
    if (!placementMode || isReporting) return;

    const onMapClick = (e: L.LeafletMouseEvent) => {
      // Use Ref to check current state instantly, avoiding closure issues
      if (isReportingRef.current || !placementModeRef.current) return;
      
      // Stop propagation if we clicked something else handled by Leaflet
      if (e.originalEvent.defaultPrevented) return;
      setPendingPinLocation({ lat: e.latlng.lat, lng: e.latlng.lng });
    };

    map.on('click', onMapClick);
    return () => {
      map.off('click', onMapClick);
    };
  }, [placementMode, isReporting, map]);

  // Draw issues
  useEffect(() => {
    if (!issueMarkersRef.current) return;
    
    const activeIssues = issues.filter(i => i.status !== 'archived');
    const activeIssueIds = new Set(activeIssues.map(i => i.id));

    // Remove markers for issues that are no longer active or were deleted
    issueMarkersMapRef.current.forEach((marker, id) => {
      if (!activeIssueIds.has(id)) {
        issueMarkersRef.current?.removeLayer(marker);
        issueMarkersMapRef.current.delete(id);
      }
    });

    // Add or update markers
    activeIssues.forEach(issue => {
      let color = '#3b82f6'; // low
      if (issue.priority === 'medium') color = '#f97316';
      if (issue.priority === 'high') color = '#ef4444';
      if (issue.status === 'resolved') color = '#22c55e';

      const existingMarker = issueMarkersMapRef.current.get(issue.id);

      const createIssueIcon = (color: string, status: string) => {
        return L.divIcon({
          className: 'custom-issue-icon bg-transparent border-0',
          html: `<div class="w-5 h-5 rounded-full border-2 border-white shadow-md" style="background-color: ${color}; opacity: ${status === 'resolved' ? 0.5 : 0.9}"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
      };

      if (existingMarker) {
        // Update position and style if needed
        existingMarker.setLatLng([issue.lat, issue.lng]);
        existingMarker.setIcon(createIssueIcon(color, issue.status));
        // Update click handler
        existingMarker.off('click');
        existingMarker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setShowIssueDetails(issue);
        });
      } else {
        // Create new marker
        const marker = L.marker([issue.lat, issue.lng], {
          icon: createIssueIcon(color, issue.status)
        });

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setShowIssueDetails(issue);
        });
        marker.addTo(issueMarkersRef.current!);
        issueMarkersMapRef.current.set(issue.id, marker);
      }
    });
  }, [issues, map]);

  // Draw blocks
  useEffect(() => {
    if (!blocksLayerRef.current) return;
    
    const activeBlockIds = new Set(blocks.map(b => b.id));

    // Remove old blocks
    blocksMarkersMapRef.current.forEach((layer, id) => {
      if (!activeBlockIds.has(id)) {
        blocksLayerRef.current?.removeLayer(layer);
        blocksMarkersMapRef.current.delete(id);
      }
    });

    // Add new blocks
    blocks.forEach(block => {
      if (block.geojson && !blocksMarkersMapRef.current.has(block.id)) {
        const layer = L.geoJSON(block.geojson, {
          style: {
            color: '#6366f1',
            weight: 2,
            fillOpacity: 0.1,
            dashArray: '5, 5'
          }
        });
        layer.addTo(blocksLayerRef.current!);
        blocksMarkersMapRef.current.set(block.id, layer);
      }
    });
  }, [blocks, map]);

  // Draw pins
  useEffect(() => {
    if (!pinsLayerRef.current) return;
    
    const activePinIds = new Set(pins.map(p => p.id));

    // Remove old pins
    pinsMarkersMapRef.current.forEach((marker, id) => {
      if (!activePinIds.has(id)) {
        pinsLayerRef.current?.removeLayer(marker);
        pinsMarkersMapRef.current.delete(id);
      }
    });

    // Add new pins
    pins.forEach(pin => {
      if (!pinsMarkersMapRef.current.has(pin.id)) {
        const marker = L.circleMarker([pin.lat, pin.lng], {
          radius: 6,
          fillColor: '#8b5cf6',
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8
        });
        marker.addTo(pinsLayerRef.current!);
        pinsMarkersMapRef.current.set(pin.id, marker);
      }
    });
  }, [pins, map]);

  // Draw farm tracks from Orchard Map (rebuild so edits to geometry/style show up)
  useEffect(() => {
    if (!tracksLayerRef.current) return;

    tracksLayerRef.current.clearLayers();
    tracksMarkersMapRef.current.clear();

    tracks.forEach((track) => {
      if (!track.geojson) return;
      const style = trackPathStyle(track.category);
      try {
        const layer = L.geoJSON(track.geojson, {
          style: {
            color: style.color,
            weight: style.weight,
            opacity: style.opacity,
            dashArray: style.dashArray,
            className: style.className,
          },
        });
        layer.addTo(tracksLayerRef.current!);
        tracksMarkersMapRef.current.set(track.id, layer);
      } catch (err) {
        console.warn('[FieldMode] Failed to render track', track.id, err);
      }
    });
  }, [tracks, map]);

  // Draw saved paths
  useEffect(() => {
    const savedPathsGroup = L.layerGroup().addTo(map);
    
    pathTraces.forEach(trace => {
      L.polyline(trace.coordinates.map(p => [p.lat, p.lng]), {
        color: '#8b5cf6',
        weight: 3,
        opacity: 0.6
      }).addTo(savedPathsGroup);
    });

    return () => {
      savedPathsGroup.remove();
    };
  }, [pathTraces, map]);

  // Draw assigned tracks with glow effect
  useEffect(() => {
    if (!glowLayerRef.current) return;

    // Show glow for all active tasks (especially useful for farmers/admins)
    const activeTasks = tasks.filter(t => t.status === 'in-progress' || t.status === 'pending' || t.status === 'accepted');
    const activeTaskIds = new Set(activeTasks.map(t => t.id));

    // Remove old glows
    glowMarkersMapRef.current.forEach((group, id) => {
      if (!activeTaskIds.has(id)) {
        glowLayerRef.current?.removeLayer(group);
        glowMarkersMapRef.current.delete(id);
      }
    });

    activeTasks.forEach(task => {
      if (task.assignedTrackId) {
        const track = tracks.find(t => t.id === task.assignedTrackId);
        if (track && track.geojson) {
          const isMyTask = task.assignedTo === userData?.uid;
          const trackSig = `${track.id}:${track.category}:${typeof track.geojson === 'string' ? track.geojson : JSON.stringify(track.geojson)}:${isMyTask ? 'me' : 'other'}`;
          const existingGroup = glowMarkersMapRef.current.get(task.id) as
            | (L.LayerGroup & { _trackSig?: string })
            | undefined;

          // Keep existing glow unless the assigned track geometry/style identity changed
          if (existingGroup && existingGroup._trackSig === trackSig) {
            return;
          }
          if (existingGroup) {
            glowLayerRef.current?.removeLayer(existingGroup);
            glowMarkersMapRef.current.delete(task.id);
          }

          {
            const group = L.layerGroup() as L.LayerGroup & { _trackSig?: string };
            group._trackSig = trackSig;
            
            if (isMyTask) {
              // Fluoro Green Pulse Effect for current user
              // Foundation (Deeper glow)
              L.geoJSON(track.geojson, {
                style: {
                  color: '#22c55e',
                  weight: 16,
                  opacity: 0.15,
                  lineCap: 'round',
                  className: 'fluoro-glow-effect'
                }
              }).addTo(group);

              // Secondary glow
              L.geoJSON(track.geojson, {
                style: {
                  color: '#4ade80',
                  weight: 10,
                  opacity: 0.3,
                  lineCap: 'round'
                }
              }).addTo(group);

              // Animated "Marching" Pulse
              L.geoJSON(track.geojson, {
                style: {
                  color: '#86efac', // Light neon green
                  weight: 3,
                  opacity: 0.9,
                  lineCap: 'round',
                  className: 'fluoro-path-glow'
                }
              }).addTo(group);
            } else {
              // Standard style for other tasks
              L.geoJSON(track.geojson, {
                style: {
                  color: '#f59e0b',
                  weight: 12,
                  opacity: 0.2,
                  lineCap: 'round'
                }
              }).addTo(group);

              L.geoJSON(track.geojson, {
                style: {
                  color: '#fbbf24',
                  weight: 8,
                  opacity: 0.4,
                  lineCap: 'round'
                }
              }).addTo(group);

              L.geoJSON(track.geojson, {
                style: {
                  color: '#ffffff',
                  weight: 2,
                  opacity: 0.8,
                  lineCap: 'round',
                  dashArray: '5, 10'
                }
              }).addTo(group);
            }

            group.addTo(glowLayerRef.current!);
            glowMarkersMapRef.current.set(task.id, group);
          }
        }
      }
    });
  }, [tasks, tracks, map, userData?.uid]);

  // Draw other farmhands
  useEffect(() => {
    if (!otherUsersLayerRef.current) return;

    const activeUids = new Set(Object.keys(activeLocations));

    // Remove markers for users who are no longer active
    otherUsersMarkersMapRef.current.forEach((marker, uid) => {
      if (!activeUids.has(uid) || uid === userData?.uid) {
        otherUsersLayerRef.current?.removeLayer(marker);
        otherUsersMarkersMapRef.current.delete(uid);
      }
    });

    Object.entries(activeLocations).forEach(([uid, loc]) => {
      if (uid === userData?.uid) return; // Skip self

      const task = tasks.find(t => t.id === loc.activeTaskId);
      const displayName = `Farmhand ${uid.substring(0, 4)}`;
      const tooltipContent = task ? `${displayName} - ${task.title}` : displayName;
      const color = task ? '#6366f1' : '#f59e0b';

      const existingMarker = otherUsersMarkersMapRef.current.get(uid);

      if (existingMarker) {
        existingMarker.setLatLng([loc.lat, loc.lng]);
        existingMarker.setStyle({ fillColor: color });
        existingMarker.setTooltipContent(tooltipContent);
      } else {
        const marker = L.circleMarker([loc.lat, loc.lng], {
          radius: 6,
          fillColor: color,
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8
        });

        marker.bindTooltip(tooltipContent, { permanent: false, direction: 'top' });
        marker.addTo(otherUsersLayerRef.current!);
        otherUsersMarkersMapRef.current.set(uid, marker);
      }
    });
  }, [activeLocations, userData?.uid, map, tasks]);

  // Lead-in approach navigation
  useEffect(() => {
    if (!leadInLayerRef.current || !map) return;
    
    leadInLayerRef.current.clearLayers();

    if (!userLocation || !activeTask || !activeTask.assignedTrackId) return;

    const track = tracks.find(t => t.id === activeTask.assignedTrackId);
    if (!track || !track.geojson) return;

    // Get the first point of the track
    let trackStart: [number, number] | null = null;
    try {
      if (track.geojson.type === 'Feature' && track.geojson.geometry.type === 'LineString') {
        const coords = track.geojson.geometry.coordinates;
        if (coords.length > 0) {
          trackStart = [coords[0][1], coords[0][0]];
        }
      } else if (track.geojson.type === 'LineString') {
        const coords = (track.geojson as any).coordinates;
        if (coords.length > 0) {
          trackStart = [coords[0][1], coords[0][0]];
        }
      }
    } catch (e) {
      console.error("Error finding track start:", e);
    }

    if (trackStart) {
      // Calculate distance to start
      const from = turf.point([userLocation.lng, userLocation.lat]);
      const to = turf.point([trackStart[1], trackStart[0]]);
      const distance = turf.distance(from, to, { units: 'meters' });

      // Only show lead-in if further than 5 meters but closer than 2km (sanity check)
      if (distance > 5 && distance < 2000) {
        L.polyline([[userLocation.lat, userLocation.lng], trackStart], {
          color: '#4ade80',
          weight: 4,
          opacity: 0.6,
          dashArray: '10, 10',
          className: 'approach-path'
        }).addTo(leadInLayerRef.current);

        // Add a "Start Here" pulsing icon
        const startIcon = L.divIcon({
          className: '',
          html: `<div class="w-6 h-6 bg-emerald-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center animate-pulse">
                  <div class="w-2 h-2 bg-white rounded-full"></div>
                </div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        L.marker(trackStart, { icon: startIcon, zIndexOffset: 500 })
          .addTo(leadInLayerRef.current)
          .bindTooltip("Track Start", { permanent: true, direction: 'top', className: 'bg-emerald-600 text-white border-none rounded px-2 py-1 text-[10px] font-bold shadow-lg' });
      }
    }
  }, [userLocation, activeTask, tracks, map]);

  // Handle map locking and bounds
  useEffect(() => {
    if (!isLocked || blocks.length === 0) {
      map.setMaxBounds(null);
      map.setMinZoom(0);
      return;
    }

    try {
      // Collect all block features
      const features = blocks
        .filter(b => b.geojson)
        .map(b => b.geojson as turf.AllGeoJSON);

      if (features.length === 0) return;

      const collection = turf.featureCollection(features.map(f => {
        if (f.type === 'Feature') return f as any;
        return turf.feature(f as any);
      }));

      // Get bounding box
      const bbox = turf.bbox(collection);
      const bboxPoly = turf.bboxPolygon(bbox);
      
      // Add 2km buffer
      const buffered = turf.buffer(bboxPoly, 2, { units: 'kilometers' });
      const bufferedBbox = turf.bbox(buffered);

      const southWest = L.latLng(bufferedBbox[1], bufferedBbox[0]);
      const northEast = L.latLng(bufferedBbox[3], bufferedBbox[2]);
      const bounds = L.latLngBounds(southWest, northEast);

      map.setMaxBounds(bounds);
      map.setMinZoom(map.getBoundsZoom(bounds, true) - 1);
    } catch (err) {
      console.error("Error setting map bounds:", err);
    }
  }, [isLocked, blocks, map]);

  const handleToggleSatellite = () => {
    setMapLayer(mapLayer === 'satellite' ? 'vector' : 'satellite');
  };

  const handleToggleRecording = async () => {
    if (isRecordingPath) {
      // Stop and save
      setIsRecordingPath(false);
      if (currentPath.length > 1 && pathStartTime && userData?.uid) {
        const newTrace: PathTrace = {
          id: uuidv4(),
          recordedBy: userData.uid,
          startTime: pathStartTime,
          endTime: new Date().toISOString(),
          coordinates: currentPath
        };
        await addPathTrace(farmId, newTrace);
      }
      setCurrentPath([]);
      setPathStartTime(null);
      if (pathPolylineRef.current) {
        pathPolylineRef.current.remove();
        pathPolylineRef.current = null;
      }
    } else {
      // Start
      setIsRecordingPath(true);
      setPathStartTime(new Date().toISOString());
      if (userLocation) {
        setCurrentPath([{ ...userLocation, timestamp: Date.now() }]);
      } else {
        setCurrentPath([]);
      }
    }
  };

  const handleCenterUser = () => {
    if (userLocation) {
      map.setView([userLocation.lat, userLocation.lng], 18);
    }
  };

  return (
    <>
      {/* Field Mode Controls Overlay */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
        <button
          onClick={() => setLocked(!isLocked)}
          className={cn(
            "p-3 rounded-full shadow-lg transition-all flex items-center justify-center",
            isLocked ? "bg-indigo-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
          )}
          title={isLocked ? "Unlock Map" : "Lock Map to Farm"}
        >
          {isLocked ? <Lock className="w-6 h-6" /> : <Unlock className="w-6 h-6" />}
        </button>

        <button
          onClick={handleToggleSatellite}
          className={cn(
            "p-3 rounded-full shadow-lg transition-all flex items-center justify-center",
            mapLayer === 'satellite' ? "bg-indigo-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
          )}
          title="Toggle Satellite View"
        >
          <Layers className="w-6 h-6" />
        </button>

        <button
          onClick={handleCenterUser}
          className="p-3 bg-white text-slate-700 rounded-full shadow-lg hover:bg-slate-50 transition-colors"
          title="Center on my location"
        >
          <Navigation className="w-6 h-6" />
        </button>
      </div>

      <div className="absolute bottom-24 lg:bottom-8 right-4 z-[1000] flex flex-col items-end gap-4">
        {/* Active Task Panel */}
        <AnimatePresence>
          {activeTask && (
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="bg-white rounded-2xl shadow-xl border border-indigo-100 overflow-hidden w-72 sm:w-80"
            >
              <div className="bg-indigo-600 p-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Active Task</span>
                </div>
                <div className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                  activeTask.priority === 'high' ? "bg-red-500/20 text-red-100" :
                  activeTask.priority === 'medium' ? "bg-amber-500/20 text-amber-100" :
                  "bg-emerald-500/20 text-emerald-100"
                )}>
                  {activeTask.priority}
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm leading-tight">{activeTask.title}</h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{activeTask.description}</p>
                </div>
                
                <div className="flex items-center gap-4 py-2 border-y border-slate-100">
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{activeTask.status}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Follow Glow</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  {activeTask.status === 'pending' ? (
                    <button
                      onClick={() => updateTaskStatus(farmId, activeTask.id, 'in-progress')}
                      className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors"
                    >
                      Start Task
                    </button>
                  ) : (
                    <button
                      onClick={() => updateTaskStatus(farmId, activeTask.id, 'completed')}
                      className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Complete
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={handleToggleRecording}
          className={`flex items-center gap-2 px-5 py-3 rounded-full shadow-lg font-semibold transition-colors ${
            isRecordingPath 
              ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
              : 'bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {isRecordingPath ? (
            <>
              <Square className="w-5 h-5 fill-current" />
              Stop Recording
            </>
          ) : (
            <>
              <Play className="w-5 h-5 fill-current" />
              Trace Path
            </>
          )}
        </button>

        <button
          onClick={() => {
            setPlacementMode(true);
            setPendingPinLocation(null);
          }}
          className="flex items-center gap-2 px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-xl font-bold text-lg transition-transform hover:scale-105"
        >
          <MapPin className="w-6 h-6" />
          Report Issue
        </button>
      </div>

      {/* Placement Mode Instructions */}
      <AnimatePresence>
        {placementMode && (
          <motion.div
            ref={instructionsRef}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-sm px-6 py-3 rounded-2xl shadow-xl border border-indigo-100 flex items-center gap-4"
          >
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-900">Placement Mode</span>
              <span className="text-xs text-slate-600">Click on map or use button below</span>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="flex gap-2" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (userLocation) {
                    setPendingPinLocation(userLocation);
                    map.setView([userLocation.lat, userLocation.lng], 18);
                  }
                }}
                className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-200 transition-colors flex items-center gap-1.5"
              >
                <Navigation className="w-3.5 h-3.5" />
                Drop on My Location
              </button>
              {pendingPinLocation && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Lock the location immediately
                    setPlacementMode(false);
                    setIsReporting(true);
                    
                    // Correcting pan direction: pan DOWN so markers move UP relative to viewport
                    // This ensures the pin is not covered by the reporting modal
                    setTimeout(() => {
                      map.panBy([0, 200], { animate: true, duration: 0.5 });
                    }, 50);
                  }}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Confirm Location
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPlacementMode(false);
                  setPendingPinLocation(null);
                }}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report Issue Modal */}
      <AnimatePresence>
        {isReporting && (
          <ReportIssueModal
            onClose={() => {
              setIsReporting(false);
              setPlacementMode(false);
              setPendingPinLocation(null);
            }}
            onRemovePin={async (isMistake) => {
              if (isMistake && pendingPinLocation && userData?.uid) {
                // Record as a mistake in the archive
                const issueId = uuidv4();
                const mistakeIssue: FieldIssue = {
                  id: issueId,
                  lat: pendingPinLocation.lat,
                  lng: pendingPinLocation.lng,
                  status: 'archived',
                  isMistake: true,
                  reportedBy: userData.uid,
                  reportedAt: new Date().toISOString(),
                  category: 'other',
                  priority: 'low',
                  note: 'Mistaken pin drop recorded during placement.',
                  archivedAt: new Date().toISOString(),
                  archivedBy: userData.uid
                };
                await addIssue(farmId, mistakeIssue);
              }
              setIsReporting(false);
              setPlacementMode(false);
              setPendingPinLocation(null);
            }}
            onSave={async (issueData) => {
              if (!pendingPinLocation || !userData?.uid) return;
              const issueId = uuidv4();
              let photoUrl = '';
              let photoData: string | undefined;

              if (issueData.photo) {
                const online =
                  typeof navigator === 'undefined' ? true : navigator.onLine;
                if (online) {
                  try {
                    photoUrl = await storageApi.uploadFieldIssuePhoto(
                      farmId,
                      issueId,
                      issueData.photo
                    );
                  } catch (error) {
                    console.warn('[FieldMode] photo upload failed — queuing', error);
                  }
                }
                if (!photoUrl) {
                  try {
                    await enqueuePhoto(farmId, issueId, issueData.photo);
                    photoData = (await blobToPreviewDataUrl(issueData.photo)) || undefined;
                  } catch (queueErr) {
                    console.error('[FieldMode] photo outbox failed', queueErr);
                  }
                }
              }

              const newIssue: FieldIssue = {
                id: issueId,
                lat: pendingPinLocation.lat,
                lng: pendingPinLocation.lng,
                status: 'open',
                reportedBy: userData.uid,
                reportedAt: new Date().toISOString(),
                category: issueData.category,
                priority: issueData.priority,
                note: issueData.note,
                photoUrl: photoUrl || undefined,
                photoData,
              };
              await addIssue(farmId, newIssue);
              setIsReporting(false);
              setPlacementMode(false);
              setPendingPinLocation(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Issue Details Modal */}
      <AnimatePresence>
        {showIssueDetails && (
          <IssueDetailsModal
            issue={showIssueDetails}
            onClose={() => setShowIssueDetails(null)}
            onResolve={async () => {
              await updateIssue(farmId, showIssueDetails.id, { 
                status: 'resolved', 
                resolvedAt: new Date().toISOString() 
              });
              setShowIssueDetails(null);
            }}
            onArchive={async () => {
              if (userData?.uid) {
                await archiveIssue(farmId, showIssueDetails.id, userData.uid);
                setShowIssueDetails(null);
              }
            }}
            isAdmin={userData?.role === 'admin' || userData?.role === 'farmer'}
          />
        )}
      </AnimatePresence>

      {/* Pending Pin Marker */}
      {pendingPinLocation && (placementMode || isReporting) && (
        <Marker 
          position={[pendingPinLocation.lat, pendingPinLocation.lng]} 
          zIndexOffset={2000}
          icon={L.divIcon({
            className: '', // Remove default Leaflet styles
            html: `<div class="w-8 h-8 bg-indigo-600 rounded-full border-4 border-white shadow-lg flex items-center justify-center animate-bounce shadow-indigo-500/50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                  </div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          })}
        />
      )}
    </>
  );
}

function ReportIssueModal({ onClose, onRemovePin, onSave }: { onClose: () => void, onRemovePin: (isMistake: boolean) => Promise<void>, onSave: (data: any) => Promise<void> }) {
  const [category, setCategory] = useState<FieldIssue['category']>('other');
  const [priority, setPriority] = useState<FieldIssue['priority']>('medium');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isMistake, setIsMistake] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ category, priority, note, photo });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className="fixed inset-x-4 bottom-24 lg:bottom-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-[6000] bg-white rounded-2xl shadow-2xl overflow-hidden md:w-full md:max-w-md flex flex-col"
    >
      <div className="p-4 bg-indigo-600 text-white flex items-center justify-between shrink-0">
        <h3 className="text-lg font-bold">Report Field Issue</h3>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowRemoveConfirm(true)} 
            className="p-1 hover:bg-red-500 rounded-full transition-colors"
            title="Remove Pin"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full"><X className="w-5 h-5" /></button>
        </div>
      </div>
      
      <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
        {showRemoveConfirm ? (
          <div className="space-y-4 py-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-amber-900 text-sm">Remove Pin?</h4>
                <p className="text-xs text-amber-700 mt-1">Are you sure you want to remove this pin? You can record it as a mistake for the archive.</p>
              </div>
            </div>
            
            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={isMistake}
                onChange={(e) => setIsMistake(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-slate-700">Mistaken pin drop</span>
            </label>

            <div className="flex gap-2 pt-4">
              <button
                onClick={() => setShowRemoveConfirm(false)}
                className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50"
              >
                Back
              </button>
              <button
                onClick={async () => {
                  setIsRemoving(true);
                  await onRemovePin(isMistake);
                  setIsRemoving(false);
                }}
                disabled={isRemoving}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 disabled:opacity-50"
              >
                {isRemoving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Confirm Remove'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
          <div className="grid grid-cols-3 gap-2">
            {(['irrigation', 'pest', 'disease', 'damage', 'other'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`py-2 px-3 rounded-lg text-sm font-medium capitalize border ${category === cat ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Priority</label>
          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as const).map(pri => (
              <button
                key={pri}
                onClick={() => setPriority(pri)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize border ${
                  priority === pri 
                    ? pri === 'high' ? 'bg-red-50 border-red-200 text-red-700' 
                      : pri === 'medium' ? 'bg-orange-50 border-orange-200 text-orange-700'
                      : 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {pri}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3 text-sm"
            rows={3}
            placeholder="Describe the issue..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Photo</label>
          <div className="flex flex-col gap-3">
            {photoPreview ? (
              <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-200">
                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                <button 
                  onClick={() => {
                    setPhoto(null);
                    setPhotoPreview(null);
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-full shadow-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full aspect-video border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-indigo-300 hover:text-indigo-400 transition-all"
              >
                <Camera className="w-8 h-8" />
                <span className="text-sm font-medium">Add Photo</span>
              </button>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handlePhotoChange} 
              accept="image/*" 
              className="hidden" 
            />
          </div>
        </div>
      </>
    )}
  </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          Submit Report
        </button>
      </div>
    </motion.div>
  );
}

function IssueDetailsModal({ issue, onClose, onResolve, onArchive, isAdmin }: { issue: FieldIssue, onClose: () => void, onResolve: () => Promise<void>, onArchive: () => Promise<void>, isAdmin: boolean }) {
  const [isResolving, setIsResolving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const handleResolve = async () => {
    setIsResolving(true);
    try {
      await onResolve();
    } finally {
      setIsResolving(false);
    }
  };

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      await onArchive();
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-x-4 bottom-24 lg:bottom-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-[6000] bg-white rounded-2xl shadow-2xl overflow-hidden md:w-full md:max-w-sm flex flex-col"
    >
      <div className={`p-4 text-white flex items-center justify-between shrink-0 ${
        issue.status === 'resolved' ? 'bg-emerald-500' :
        issue.priority === 'high' ? 'bg-red-500' :
        issue.priority === 'medium' ? 'bg-orange-500' : 'bg-blue-500'
      }`}>
        <h3 className="text-lg font-bold capitalize">{issue.category} Issue</h3>
        <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full"><X className="w-5 h-5" /></button>
      </div>
      
      <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-500">Status:</span>
          <span className={`font-semibold capitalize ${
            issue.status === 'resolved' ? 'text-emerald-600' : 'text-slate-700'
          }`}>{issue.status}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-500">Priority:</span>
          <span className="font-semibold capitalize text-slate-700">{issue.priority}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-500">Reported:</span>
          <span className="font-semibold text-slate-700">{new Date(issue.reportedAt).toLocaleString()}</span>
        </div>
        
        {issue.note && (
          <div className="pt-4 border-t border-slate-100">
            <p className="text-sm text-slate-700">{issue.note}</p>
          </div>
        )}

        {(issue.photoUrl || issue.photoData) && (
          <div className="pt-4 border-t border-slate-100">
            <div className="rounded-xl overflow-hidden border border-slate-200">
              <img 
                src={issue.photoUrl || issue.photoData} 
                alt="Issue" 
                className="w-full h-auto object-cover" 
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        )}
      </div>

      {issue.status !== 'resolved' && issue.status !== 'archived' && (
        <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <button
            onClick={handleResolve}
            disabled={isResolving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl font-bold transition-colors disabled:opacity-50"
          >
            {isResolving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            Mark as Resolved
          </button>
        </div>
      )}

      {issue.status === 'resolved' && isAdmin && (
        <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <button
            onClick={handleArchive}
            disabled={isArchiving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-xl font-bold transition-colors disabled:opacity-50"
          >
            {isArchiving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Archive Issue
          </button>
        </div>
      )}
    </motion.div>
  );
}
