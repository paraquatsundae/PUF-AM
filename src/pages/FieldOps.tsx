import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, ZoomControl } from 'react-leaflet';
import { MapPin, List, Map as MapIcon, Plus, Navigation, ClipboardList, CheckCircle2, Clock, AlertCircle, User, Route, X, Target, Settings2, Loader2, Archive, ShieldCheck, AlertTriangle } from 'lucide-react';
import * as turf from '@turf/turf';
import { useAuth } from '../contexts/AuthContext';
import { useFieldStore } from '../lib/fieldStore';
import { useMapStore } from '../lib/mapStore';
import { useTaskStore, Task } from '../lib/taskStore';
import { FieldMode } from '../components/map/FieldMode';
import { GoogleMapsLayer } from '../components/map/GoogleMapsLayer';
import {
  preferEsriSatelliteBasemap,
  resolveGoogleMapsApiKey,
} from '../lib/googleMapsKey';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { safetyApi, notificationApi } from '../services/api';
import 'leaflet/dist/leaflet.css';

export function FieldOps() {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const { issues, archivedIssues, loadData: loadFieldData, loadArchive, archiveIssue } = useFieldStore();
  const { viewport, isLoaded, tracks, blocks, loadData: loadMapData, isLocked, setLocked } = useMapStore();
  const { tasks, loadTasks, addTask } = useTaskStore();
  
  const [view, setView] = useState<'map' | 'issues' | 'tasks' | 'archive'>('map');
  const [mapLayer, setMapLayer] = useState<'vector' | 'satellite'>('satellite');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [assigningTrackId, setAssigningTrackId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [safetyChecklist, setSafetyChecklist] = useState<any[]>([]);
  const [acceptedSafetyItems, setAcceptedSafetyItems] = useState<string[]>([]);
  const [isAcceptingTask, setIsAcceptingTask] = useState(false);
  const [farmUsers, setFarmUsers] = useState<{ uid: string; email: string; displayName?: string }[]>([]);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assignedTo: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    targetBlockId: '',
    manualPathSelection: false,
    assignedTrackId: '',
    tools: [] as string[],
    notes: '',
    newTool: ''
  });

  const googleMapsApiKey = resolveGoogleMapsApiKey();
  const [useGoogleMaps, setUseGoogleMaps] = useState(
    () => Boolean(resolveGoogleMapsApiKey()) && !preferEsriSatelliteBasemap()
  );

  useEffect(() => {
    if (farmId) {
      loadFieldData(farmId);
      loadTasks(farmId);
      loadArchive(farmId);
      loadMapData(farmId);
      
      // Load farm users for assignment
      const loadUsers = async () => {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('farmId', '==', farmId));
        const snapshot = await getDocs(q);
        const users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as any));
        setFarmUsers(users);
      };
      loadUsers();

      // Load safety checklist
      const loadSafety = async () => {
        try {
          const checklist = await safetyApi.getChecklist(farmId);
          if (checklist) {
            setSafetyChecklist(checklist.items);
          }
        } catch (err) {
          console.error("Error loading safety:", err);
        }
      };
      loadSafety();
    }
  }, [farmId, loadFieldData, loadTasks]);

  // Track user location for list sorting
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (error) => console.error("Geolocation error:", error),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Calculate distance helper
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const d = R * c; // Distance in km
    return d;
  };

  const notifyAdmins = async (title: string, message: string, taskId: string) => {
    if (!farmId) return;
    const admins = farmUsers.filter(u => (u as any).role === 'admin' || (u as any).role === 'farmer');
    for (const admin of admins) {
      await notificationApi.createNotification(admin.uid, {
        userId: admin.uid,
        title,
        message,
        type: 'task_update',
        link: `/field-ops?task=${taskId}`
      });
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: Task['status'], additionalData: Partial<Task> = {}) => {
    if (!farmId) return;
    const { updateTask, updateTaskStatus } = useTaskStore.getState();
    try {
      if (Object.keys(additionalData).length > 0) {
        await updateTask(farmId, taskId, { ...additionalData, status: newStatus });
      } else {
        await updateTaskStatus(farmId, taskId, newStatus);
      }
      
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      if (newStatus === 'accepted') {
        await notifyAdmins(
          'Task Accepted',
          `Task "${task.title}" has been accepted by ${userData?.displayName || 'a farmhand'}.`,
          taskId
        );
      } else if (newStatus === 'completed') {
        await notifyAdmins(
          'Task Completed',
          `Task "${task.title}" has been marked as completed by ${userData?.displayName || 'a farmhand'}.`,
          taskId
        );
      }
      
      // Update local state if modal is open
      if (selectedTask?.id === taskId) {
        setSelectedTask(prev => prev ? { ...prev, ...additionalData, status: newStatus } : null);
      }
    } catch (error) {
      console.error("Failed to update task status:", error);
    }
  };
  // archivedIssues is now directly from store

  const activeIssues = issues;
  const sortedIssues = [...activeIssues].sort((a, b) => {
    if (a.status === 'resolved' && b.status !== 'resolved') return 1;
    if (a.status !== 'resolved' && b.status === 'resolved') return -1;
    
    if (userLocation) {
      const distA = getDistance(userLocation.lat, userLocation.lng, a.lat, a.lng);
      const distB = getDistance(userLocation.lat, userLocation.lng, b.lat, b.lng);
      return distA - distB;
    }
    return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
  });

  const sortedArchivedIssues = [...archivedIssues].sort((a, b) => {
    const timeA = a.archivedAt ? new Date(a.archivedAt).getTime() : 0;
    const timeB = b.archivedAt ? new Date(b.archivedAt).getTime() : 0;
    return timeB - timeA;
  });

  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'in-progress' | 'completed'>('all');

  const filteredTasks = tasks.filter(task => {
    if (taskFilter === 'all') return true;
    return task.status === taskFilter;
  });

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const { deleteTask } = useTaskStore();
  const { deleteIssue } = useFieldStore();

  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [deletingIssueId, setDeletingIssueId] = useState<string | null>(null);
  const isAdmin = userData?.role === 'admin' || userData?.role === 'farmer';

  const findClosestTrack = (blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block || !block.geojson || tracks.length === 0) return null;

    try {
      const blockCentroid = turf.centroid(block.geojson);
      let minDistance = Infinity;
      let closestTrackId = null;

      tracks.forEach(track => {
        if (!track.geojson) return;
        // Calculate distance from block centroid to track (polyline)
        const distance = turf.pointToLineDistance(blockCentroid, track.geojson);
        if (distance < minDistance) {
          minDistance = distance;
          closestTrackId = track.id;
        }
      });

      return closestTrackId;
    } catch (err) {
      console.error("Error calculating closest track:", err);
      return null;
    }
  };

  const getBlocksForIssues = (issueIds: string[]) => {
    const selectedIssues = issues.filter(i => issueIds.includes(i.id));
    const foundBlocks = new Set<string>();
    
    selectedIssues.forEach(issue => {
      if (issue.lat && issue.lng) {
        const point = turf.point([issue.lng, issue.lat]);
        for (const block of blocks) {
          if (!block.geojson) continue;
          try {
            const polygon = typeof block.geojson === 'string' ? JSON.parse(block.geojson) : block.geojson;
            if (turf.booleanPointInPolygon(point, polygon)) {
              foundBlocks.add(block.id);
              break; // Found the block for this issue
            }
          } catch (e) {
            console.error("Error checking point in polygon", e);
          }
        }
      }
    });
    
    return Array.from(foundBlocks);
  };

  useEffect(() => {
    if (taskForm.targetBlockId && taskForm.targetBlockId !== 'multiple' && !taskForm.manualPathSelection) {
      const closestId = findClosestTrack(taskForm.targetBlockId);
      if (closestId) {
        setTaskForm(prev => ({ ...prev, assignedTrackId: closestId }));
      }
    }
  }, [taskForm.targetBlockId, taskForm.manualPathSelection]);

  useEffect(() => {
    if (isLoaded && blocks.length === 0) {
      setLocked(false);
    }
  }, [isLoaded, blocks.length, setLocked]);

  if (!farmId) {
    return (
      <div className="h-[calc(100vh-4rem)] lg:h-[calc(100vh-2rem)] flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-700">No Farm Selected</h2>
          <p className="text-slate-500 mt-2">Please select or create a farm to use Field Ops.</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-[calc(100vh-4rem)] lg:h-[calc(100vh-2rem)] flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] lg:h-[calc(100vh-2rem)] flex flex-col bg-slate-50 relative overflow-hidden">
      {/* Top Navigation Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Field Ops</h1>
            <p className="text-xs text-slate-500 font-medium">Scouting & Issue Tracking</p>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
          <button
            onClick={() => setView('map')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              view === 'map' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapIcon className="w-4 h-4" />
            <span>Map</span>
          </button>
          <button
            onClick={() => setView('issues')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              view === 'issues' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            <span>Issues</span>
          </button>
          <button
            onClick={() => setView('tasks')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              view === 'tasks' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Tasks</span>
          </button>
          {isAdmin && (
            <button
              onClick={() => setView('archive')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                view === 'archive' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Archive</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative">
        {view === 'map' ? (
          <div className="absolute inset-0 z-0">
            {!isLoaded ? (
              <div className="flex items-center justify-center h-full bg-slate-50">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                  <p className="text-sm text-slate-500">Loading map data...</p>
                </div>
              </div>
            ) : (
              <MapContainer 
                center={[viewport.lat, viewport.lng]} 
                zoom={viewport.zoom} 
                maxZoom={20}
                zoomControl={false} 
                className="w-full h-full"
              >
              {useGoogleMaps && googleMapsApiKey ? (
                <GoogleMapsLayer 
                  type={mapLayer === 'satellite' ? 'hybrid' : 'roadmap'} 
                  apiKey={googleMapsApiKey}
                  onFail={() => setUseGoogleMaps(false)}
                />
              ) : (
                <>
                  {mapLayer === 'satellite' ? (
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
                    />
                  ) : (
                    <TileLayer
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                      attribution="&copy; <a href='https://carto.com/'>CARTO</a>"
                    />
                  )}
                  {mapLayer === 'satellite' && (
                    <TileLayer
                      url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
                      attribution="&copy; <a href='https://carto.com/'>CARTO</a>"
                      zIndex={10}
                    />
                  )}
                </>
              )}
              <ZoomControl position="bottomleft" />
              
              <FieldMode farmId={farmId} mapLayer={mapLayer} setMapLayer={setMapLayer} />
            </MapContainer>
          )}
        </div>
      ) : view === 'issues' ? (
          <div className="absolute inset-0 overflow-y-auto p-4 sm:p-6 bg-slate-50">
            <div className="max-w-3xl mx-auto space-y-4 pb-24">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900">Field Issues</h2>
                {selectedIssueIds.length > 0 && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => {
                      const selectedIssues = issues.filter(i => selectedIssueIds.includes(i.id));
                      const categories = Array.from(new Set(selectedIssues.map(i => i.category)));
                      const foundBlocks = getBlocksForIssues(selectedIssueIds);
                      let targetBlockId = '';
                      if (foundBlocks.length === 1) {
                        targetBlockId = foundBlocks[0];
                      } else if (foundBlocks.length > 1) {
                        targetBlockId = 'multiple';
                      }

                      setTaskForm({
                        title: `${categories.join(' & ')} Maintenance`,
                        description: `Addressing ${selectedIssueIds.length} reported issues.`,
                        assignedTo: '',
                        priority: 'medium',
                        targetBlockId,
                        manualPathSelection: false,
                        assignedTrackId: '',
                        tools: [],
                        notes: '',
                        newTool: ''
                      });
                      setIsCreatingTask(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Assign {selectedIssueIds.length} to Task</span>
                  </motion.button>
                )}
              </div>

              {sortedIssues.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                  <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-slate-900">No Active Issues</h3>
                  <p className="text-slate-500">The field is looking good!</p>
                </div>
              ) : (
                sortedIssues.map(issue => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={issue.id} 
                    onClick={() => {
                      if (issue.status === 'resolved') return;
                      setSelectedIssueIds(prev => 
                        prev.includes(issue.id) 
                          ? prev.filter(id => id !== issue.id) 
                          : [...prev, issue.id]
                      );
                    }}
                    className={cn(
                      "bg-white p-4 rounded-2xl border shadow-sm flex items-start gap-4 transition-all cursor-pointer",
                      issue.status === 'resolved' ? 'border-emerald-200 bg-emerald-50/30 opacity-60' : 
                      selectedIssueIds.includes(issue.id) ? 'border-indigo-500 ring-2 ring-indigo-500/10' : 'border-slate-200 hover:border-indigo-200'
                    )}
                  >
                    <div className={`p-3 rounded-full shrink-0 ${
                      issue.status === 'resolved' ? 'bg-emerald-100 text-emerald-600' :
                      issue.priority === 'high' ? 'bg-red-100 text-red-600' :
                      issue.priority === 'medium' ? 'bg-orange-100 text-orange-600' :
                      'bg-blue-100 text-blue-600'
                    }`}>
                      <MapPin className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h3 className="font-bold text-slate-900 capitalize text-lg truncate">{issue.category} Issue</h3>
                        <div className="flex items-center gap-2">
                          {selectedIssueIds.includes(issue.id) && (
                            <div className="bg-indigo-600 text-white p-1 rounded-full">
                              <CheckCircle2 className="w-3 h-3" />
                            </div>
                          )}
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                            issue.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                            issue.priority === 'high' ? 'bg-red-100 text-red-700' :
                            issue.priority === 'medium' ? 'bg-orange-100 text-orange-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {issue.status === 'resolved' ? 'Resolved' : issue.priority}
                          </span>
                          {isAdmin && farmId && userData?.uid && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                archiveIssue(farmId, issue.id, userData.uid);
                              }}
                              className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                              title="Archive Issue"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      {issue.note && <p className="text-slate-600 mb-3">{issue.note}</p>}
                      <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                        <span>{new Date(issue.reportedAt).toLocaleDateString()}</span>
                        {userLocation && (
                          <span className="flex items-center gap-1">
                            <Navigation className="w-3 h-3" />
                            {getDistance(userLocation.lat, userLocation.lng, issue.lat, issue.lng).toFixed(1)} km away
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        ) : view === 'archive' ? (
          <div className="absolute inset-0 overflow-y-auto p-4 sm:p-6 bg-slate-50">
            <div className="max-w-3xl mx-auto space-y-4 pb-24">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Issue Archive</h2>
                  <p className="text-xs text-slate-500 font-medium">Permanent record of all field issues</p>
                </div>
              </div>

              {sortedArchivedIssues.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                  <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-slate-900">Archive Empty</h3>
                  <p className="text-slate-500">No archived issues yet.</p>
                </div>
              ) : (
                sortedArchivedIssues.map(issue => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={issue.id} 
                    className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4 group"
                  >
                    <div className={`p-3 rounded-full shrink-0 ${
                      issue.isMistake ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-400'
                    }`}>
                      {issue.isMistake ? <X className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 capitalize text-lg truncate">
                            {issue.isMistake ? 'Mistaken Drop' : `${issue.category} Issue`}
                          </h3>
                          {issue.isMistake && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded uppercase tracking-wider">
                              Mistake
                            </span>
                          )}
                        </div>
                        
                        {isAdmin && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {deletingIssueId === issue.id ? (
                              <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-100">
                                <button 
                                  onClick={async () => {
                                    await deleteIssue(farmId, issue.id);
                                    setDeletingIssueId(null);
                                  }}
                                  className="px-2 py-1 bg-red-600 text-white text-[10px] font-bold rounded hover:bg-red-700 transition-colors"
                                >
                                  Delete
                                </button>
                                <button 
                                  onClick={() => setDeletingIssueId(null)}
                                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => setDeletingIssueId(issue.id)}
                                className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                                title="Permanently delete from archive"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {issue.note && <p className="text-slate-600 mb-3 text-sm">{issue.note}</p>}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-medium text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Reported: {new Date(issue.reportedAt).toLocaleDateString()}
                        </span>
                        {issue.archivedAt && (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Archived: {new Date(issue.archivedAt).toLocaleDateString()}
                          </span>
                        )}
                        {issue.archivedBy && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            By: {farmUsers.find(u => u.uid === issue.archivedBy)?.displayName || 'Manager'}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 overflow-y-auto p-4 sm:p-6 bg-slate-50">
            <div className="max-w-5xl mx-auto space-y-8 pb-24">
              {/* Tasks Header & Filter */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                    <ClipboardList className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Farm Tasks</h2>
                    <p className="text-xs text-slate-500 font-medium">Manage operational workflows</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const foundBlocks = getBlocksForIssues(selectedIssueIds);
                      let targetBlockId = '';
                      if (foundBlocks.length === 1) {
                        targetBlockId = foundBlocks[0];
                      } else if (foundBlocks.length > 1) {
                        targetBlockId = 'multiple';
                      }

                      setTaskForm({
                        title: '',
                        description: '',
                        assignedTo: '',
                        priority: 'medium',
                        targetBlockId,
                        manualPathSelection: false,
                        assignedTrackId: '',
                        tools: [],
                        notes: '',
                        newTool: ''
                      });
                      setIsCreatingTask(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Task</span>
                  </button>

                  <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm overflow-x-auto no-scrollbar">
                    {(['all', 'pending', 'accepted', 'in-progress', 'completed'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setTaskFilter(filter as any)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all whitespace-nowrap",
                          taskFilter === filter 
                            ? "bg-indigo-600 text-white shadow-md" 
                            : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                        )}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Active Tasks Section */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sortedTasks.length === 0 ? (
                    <div className="col-span-full text-center py-12 bg-white rounded-2xl border border-slate-200">
                      <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                      <h3 className="text-lg font-bold text-slate-900">No Tasks Found</h3>
                      <p className="text-slate-500">Try changing the filter or create a task above.</p>
                    </div>
                  ) : (
                    sortedTasks.map(task => (
                      <motion.div 
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3 group hover:border-indigo-200 transition-all relative overflow-hidden cursor-pointer"
                      >
                        {/* Traffic Light Status Indicator */}
                        <div className={cn(
                          "absolute top-0 left-0 w-1.5 h-full",
                          task.status === 'completed' ? 'bg-emerald-500' :
                          task.status === 'in-progress' ? 'bg-amber-500' :
                          task.status === 'accepted' ? 'bg-blue-500' :
                          'bg-slate-300'
                        )} />

                        <div className="flex justify-between items-start pl-2">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "p-2 rounded-xl",
                              task.status === 'completed' ? 'bg-emerald-100 text-emerald-600' :
                              task.priority === 'high' ? 'bg-red-100 text-red-600' :
                              task.priority === 'medium' ? 'bg-orange-100 text-orange-600' :
                              'bg-blue-100 text-blue-600'
                            )}>
                              {task.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : <ClipboardList className="w-5 h-5" />}
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-900 text-sm leading-tight">{task.title}</h3>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={cn(
                                  "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                                  task.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                  task.status === 'in-progress' ? 'bg-amber-100 text-amber-700' : 
                                  task.status === 'accepted' ? 'bg-blue-100 text-blue-700' :
                                  'bg-slate-100 text-slate-600'
                                )}>
                                  {task.status}
                                </span>
                                <span className="text-[10px] text-slate-400">•</span>
                                <span className="text-[10px] text-slate-500 font-medium">
                                  {task.assignedToName || farmUsers.find(u => u.uid === task.assignedTo)?.displayName || 'Unknown User'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {deletingTaskId === task.id ? (
                              <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-100">
                                <button 
                                  onClick={async () => {
                                    await deleteTask(farmId, task.id);
                                    setDeletingTaskId(null);
                                  }}
                                  className="px-2 py-1 bg-red-600 text-white text-[10px] font-bold rounded hover:bg-red-700 transition-colors"
                                >
                                  Confirm
                                </button>
                                <button 
                                  onClick={() => setDeletingTaskId(null)}
                                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => setDeletingTaskId(task.id)}
                                className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {task.description && (
                          <p className="text-xs text-slate-600 line-clamp-2">{task.description}</p>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(task.createdAt).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-indigo-600 font-bold">
                            <Route className="w-3 h-3" />
                            <span>{tracks.find(t => t.id === task.assignedTrackId)?.name || 'Pathway'}</span>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Task Details & Acceptance Modal */}
      <AnimatePresence>
        {selectedTask && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={() => {
                if (!isAcceptingTask) setSelectedTask(null);
              }}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className={cn(
                "p-6 border-b border-slate-100 flex items-center justify-between text-white",
                selectedTask.status === 'completed' ? 'bg-emerald-600' :
                selectedTask.status === 'in-progress' ? 'bg-amber-600' :
                selectedTask.status === 'accepted' ? 'bg-blue-600' :
                'bg-indigo-600'
              )}>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <ClipboardList className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{selectedTask.title}</h2>
                    <p className="text-white/80 text-xs">Status: {selectedTask.status.toUpperCase()}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedTask(null)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto">
                {/* Task Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Assigned To</p>
                    <p className="text-sm font-bold text-slate-900">{selectedTask.assignedToName || 'Unassigned'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Priority</p>
                    <p className={cn(
                      "text-sm font-bold capitalize",
                      selectedTask.priority === 'high' ? 'text-red-600' :
                      selectedTask.priority === 'medium' ? 'text-orange-600' :
                      'text-blue-600'
                    )}>{selectedTask.priority}</p>
                  </div>
                </div>

                {selectedTask.description && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Description</h4>
                    <p className="text-sm text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-100 leading-relaxed">
                      {selectedTask.description}
                    </p>
                  </div>
                )}

                {selectedTask.tools && selectedTask.tools.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Required Tools</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedTask.tools.map((tool, i) => (
                        <span key={i} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-xl border border-indigo-100">
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Safety Checklist Section */}
                {selectedTask.status === 'pending' && !isAcceptingTask && (
                  <div className="pt-4 border-t border-slate-100">
                    <button
                      onClick={() => setIsAcceptingTask(true)}
                      className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Accept Task & Start Safety Check</span>
                    </button>
                  </div>
                )}

                {isAcceptingTask && (
                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-amber-600">
                      <ShieldCheck className="w-5 h-5" />
                      <h4 className="text-sm font-bold">Safety Checklist Verification</h4>
                    </div>
                    <p className="text-xs text-slate-500">Please verify and accept all safety items before proceeding.</p>
                    
                    <div className="space-y-2">
                      {safetyChecklist.map((item) => (
                        <label 
                          key={item.id}
                          className={cn(
                            "flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer",
                            acceptedSafetyItems.includes(item.id) 
                              ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
                              : "bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-200"
                          )}
                        >
                          <input 
                            type="checkbox"
                            checked={acceptedSafetyItems.includes(item.id)}
                            onChange={() => {
                              setAcceptedSafetyItems(prev => 
                                prev.includes(item.id) 
                                  ? prev.filter(id => id !== item.id) 
                                  : [...prev, item.id]
                              );
                            }}
                            className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-bold">{item.text}</p>
                            {item.required && <span className="text-[10px] text-red-500 font-bold uppercase">Required</span>}
                          </div>
                        </label>
                      ))}
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={() => {
                          setIsAcceptingTask(false);
                          setAcceptedSafetyItems([]);
                        }}
                        className="flex-1 py-3 bg-white text-slate-600 font-bold rounded-2xl border border-slate-200 hover:bg-slate-50 transition-all"
                      >
                        Back
                      </button>
                      <button
                        disabled={safetyChecklist.filter(i => i.required).some(i => !acceptedSafetyItems.includes(i.id))}
                        onClick={async () => {
                          await handleUpdateTaskStatus(selectedTask.id, 'accepted', {
                            safetyChecklistAccepted: true,
                            acceptedAt: new Date().toISOString()
                          });
                          setIsAcceptingTask(false);
                          setSelectedTask(null);
                          setAcceptedSafetyItems([]);
                        }}
                        className="flex-[2] py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Confirm Acceptance
                      </button>
                    </div>
                  </div>
                )}

                {selectedTask.status === 'accepted' && (
                  <div className="pt-4 border-t border-slate-100">
                    <button
                      onClick={async () => {
                        await handleUpdateTaskStatus(selectedTask.id, 'in-progress');
                        setSelectedTask(null);
                      }}
                      className="w-full py-4 bg-amber-600 text-white font-bold rounded-2xl hover:bg-amber-700 transition-all shadow-lg shadow-amber-100 flex items-center justify-center gap-2"
                    >
                      <Clock className="w-5 h-5" />
                      <span>Start Working</span>
                    </button>
                  </div>
                )}

                {selectedTask.status === 'in-progress' && (
                  <div className="pt-4 border-t border-slate-100">
                    <button
                      onClick={async () => {
                        await handleUpdateTaskStatus(selectedTask.id, 'completed');
                        setSelectedTask(null);
                      }}
                      className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Mark as Completed</span>
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Task Assignment Modal */}
      <AnimatePresence>
        {(assigningTrackId || isCreatingTask) && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={() => {
                setAssigningTrackId(null);
                setIsCreatingTask(false);
              }}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <ClipboardList className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{isCreatingTask ? 'Create Task' : 'Assign Task'}</h2>
                    <p className="text-indigo-100 text-xs">Link a pathway to a farmhand task</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setAssigningTrackId(null);
                    setIsCreatingTask(false);
                  }}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Task Title</label>
                  <input 
                    type="text"
                    value={taskForm.title}
                    onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                    placeholder="e.g., Spray Block A via North Track"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Description / Notes</label>
                  <textarea 
                    value={taskForm.description}
                    onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                    placeholder="Provide details for the farmhand..."
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Required Tools</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={taskForm.newTool}
                      onChange={(e) => setTaskForm({ ...taskForm, newTool: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && taskForm.newTool.trim()) {
                          e.preventDefault();
                          setTaskForm(prev => ({
                            ...prev,
                            tools: [...prev.tools, prev.newTool.trim()],
                            newTool: ''
                          }));
                        }
                      }}
                      placeholder="Add tool (e.g., Shovel)"
                      className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      onClick={() => {
                        if (taskForm.newTool.trim()) {
                          setTaskForm(prev => ({
                            ...prev,
                            tools: [...prev.tools, prev.newTool.trim()],
                            newTool: ''
                          }));
                        }
                      }}
                      className="px-3 py-2 bg-indigo-100 text-indigo-600 rounded-xl hover:bg-indigo-200 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {taskForm.tools.map((tool, index) => (
                      <span key={index} className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg border border-slate-200">
                        {tool}
                        <button 
                          onClick={() => setTaskForm(prev => ({ ...prev, tools: prev.tools.filter((_, i) => i !== index) }))}
                          className="hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assign To</label>
                    <select 
                      value={taskForm.assignedTo}
                      onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                    >
                      <option value="">Select Farmhand</option>
                      {farmUsers.map(user => (
                        <option key={user.uid} value={user.uid}>{user.displayName || user.email}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Priority</label>
                    <select 
                      value={taskForm.priority}
                      onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as any })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Target Block</label>
                  {taskForm.targetBlockId === 'multiple' ? (
                    <div className="w-full px-4 py-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-sm font-medium flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Issues span across multiple blocks</p>
                        <p className="text-[10px] mt-0.5 opacity-80">
                          {getBlocksForIssues(selectedIssueIds)
                            .map(id => blocks.find(b => b.id === id)?.name || 'Unknown Block')
                            .join(', ')}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <select 
                      value={taskForm.targetBlockId}
                      onChange={(e) => setTaskForm({ ...taskForm, targetBlockId: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                    >
                      <option value="">Select Target Block</option>
                      {blocks.map(block => (
                        <option key={block.id} value={block.id}>{block.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pathway Selection</label>
                    <button
                      onClick={() => setTaskForm(prev => ({ ...prev, manualPathSelection: !prev.manualPathSelection }))}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold transition-all",
                        taskForm.manualPathSelection 
                          ? "bg-amber-100 text-amber-700 border border-amber-200" 
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      )}
                    >
                      <Settings2 className="w-3 h-3" />
                      {taskForm.manualPathSelection ? 'Manual Mode' : 'Auto Mode'}
                    </button>
                  </div>

                  {taskForm.manualPathSelection ? (
                    <select 
                      value={taskForm.assignedTrackId}
                      onChange={(e) => setTaskForm({ ...taskForm, assignedTrackId: e.target.value })}
                      className="w-full px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all text-sm"
                    >
                      <option value="">Select Pathway Manually</option>
                      {tracks.map(track => (
                        <option key={track.id} value={track.id}>{track.name || 'Unnamed Track'}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 flex items-start gap-3">
                      <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                        <Route className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-indigo-900">Auto-assigned Pathway</p>
                        <p className="text-[10px] text-indigo-600">
                          {taskForm.assignedTrackId 
                            ? tracks.find(t => t.id === taskForm.assignedTrackId)?.name || 'Closest Track'
                            : 'Select a target block to auto-assign'}
                        </p>
                      </div>
                      {taskForm.assignedTrackId && (
                        <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                          Optimal
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => {
                    setAssigningTrackId(null);
                    setIsCreatingTask(false);
                    setSelectedIssueIds([]);
                  }}
                  className="flex-1 py-3 bg-white text-slate-600 font-bold rounded-2xl border border-slate-200 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    if (!farmId || !taskForm.title || !taskForm.assignedTo || !taskForm.assignedTrackId) return;
                    try {
                      const taskId = crypto.randomUUID();
                      const assignedUser = farmUsers.find(u => u.uid === taskForm.assignedTo);

                      await addTask(farmId, {
                        id: taskId,
                        title: taskForm.title,
                        description: taskForm.description,
                        assignedTo: taskForm.assignedTo,
                        assignedToName: assignedUser?.displayName || assignedUser?.email || 'Unknown',
                        priority: taskForm.priority,
                        targetBlockId: taskForm.targetBlockId,
                        assignedTrackId: taskForm.assignedTrackId,
                        issueIds: selectedIssueIds,
                        tools: taskForm.tools,
                        notes: taskForm.notes,
                        status: 'pending',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                      });

                      // Notify assigned user
                      await notificationApi.createNotification(taskForm.assignedTo, {
                        userId: taskForm.assignedTo,
                        title: 'New Task Assigned',
                        message: `You have been assigned a new task: "${taskForm.title}"`,
                        type: 'task_assigned',
                        link: `/field-ops?task=${taskId}`
                      });
                      setAssigningTrackId(null);
                      setIsCreatingTask(false);
                      setSelectedIssueIds([]);
                      setTaskForm({ 
                        title: '', 
                        description: '', 
                        assignedTo: '', 
                        priority: 'medium',
                        targetBlockId: '',
                        manualPathSelection: false,
                        assignedTrackId: '',
                        tools: [],
                        notes: '',
                        newTool: ''
                      });
                    } catch (err) {
                      console.error("Failed to add task", err);
                    }
                  }}
                  disabled={!taskForm.title || !taskForm.assignedTo || !taskForm.assignedTrackId}
                  className="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Task
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
