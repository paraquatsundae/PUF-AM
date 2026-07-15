import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Tractor, Plus, Trash2, Settings, Wrench, Fuel, Clock, ChevronRight, ArrowLeft } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface MachineryItem {
  id: string;
  name: string;
  type: string;
  hours: number;
  fuelUsed: number;
  maintenanceNotes: string;
  updatedAt: string;
}

export function MachineryManager() {
  const { userData } = useAuth();
  const [machinery, setMachinery] = useState<MachineryItem[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<MachineryItem | null>(null);
  const [isAddingMachine, setIsAddingMachine] = useState(false);
  const [isUpdatingMachine, setIsUpdatingMachine] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [type, setType] = useState('Tractor');
  
  // Update form states
  const [addHours, setAddHours] = useState('');
  const [addFuel, setAddFuel] = useState('');
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    if (!userData?.farmId) return;

    const q = query(collection(db, `farms/${userData.farmId}/machinery`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MachineryItem));
      setMachinery(items);
      
      if (selectedMachine) {
        const updated = items.find(i => i.id === selectedMachine.id);
        if (updated) setSelectedMachine(updated);
      }
    });

    return () => unsubscribe();
  }, [userData?.farmId, selectedMachine?.id]);

  const handleAddMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.farmId) return;

    const newMachine: MachineryItem = {
      id: uuidv4(),
      name,
      type,
      hours: 0,
      fuelUsed: 0,
      maintenanceNotes: '',
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, `farms/${userData.farmId}/machinery`, newMachine.id), newMachine);
    setIsAddingMachine(false);
    setName('');
    setType('Tractor');
  };

  const handleDeleteMachine = async (id: string) => {
    if (!userData?.farmId) return;
    if (window.confirm('Are you sure you want to delete this machine?')) {
      await deleteDoc(doc(db, `farms/${userData.farmId}/machinery`, id));
      if (selectedMachine?.id === id) setSelectedMachine(null);
    }
  };

  const handleUpdateMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.farmId || !selectedMachine) return;

    const hoursToAdd = parseFloat(addHours) || 0;
    const fuelToAdd = parseFloat(addFuel) || 0;
    
    let updatedNotes = selectedMachine.maintenanceNotes;
    if (newNote.trim()) {
      const dateStr = new Date().toLocaleDateString();
      updatedNotes = updatedNotes ? `${dateStr}: ${newNote}\n${updatedNotes}` : `${dateStr}: ${newNote}`;
    }

    const updatedMachine = {
      ...selectedMachine,
      hours: selectedMachine.hours + hoursToAdd,
      fuelUsed: selectedMachine.fuelUsed + fuelToAdd,
      maintenanceNotes: updatedNotes,
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, `farms/${userData.farmId}/machinery`, selectedMachine.id), updatedMachine);
    
    setIsUpdatingMachine(false);
    setAddHours('');
    setAddFuel('');
    setNewNote('');
  };

  if (selectedMachine) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedMachine(null)}
              className="flex items-center px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-all"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Fleet
            </button>
            <h2 className="text-2xl font-bold text-slate-900">{selectedMachine.name}</h2>
            <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium">
              {selectedMachine.type}
            </span>
          </div>
          <button 
            onClick={() => setIsUpdatingMachine(true)}
            className="bg-amber-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-700 transition-colors flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Log Usage / Maintenance
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Hours</p>
              <p className="text-2xl font-bold text-slate-900">{selectedMachine.hours.toLocaleString()} hrs</p>
            </div>
          </div>
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
              <Fuel className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Fuel Used</p>
              <p className="text-2xl font-bold text-slate-900">{selectedMachine.fuelUsed.toLocaleString()} L</p>
            </div>
          </div>
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center">
              <Wrench className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Status</p>
              <p className="text-xl font-bold text-slate-900">Active</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-slate-500" />
            Maintenance Notes
          </h3>
          {selectedMachine.maintenanceNotes ? (
            <div className="whitespace-pre-wrap text-slate-700 text-sm font-mono bg-white p-4 rounded-lg border border-slate-200">
              {selectedMachine.maintenanceNotes}
            </div>
          ) : (
            <p className="text-slate-500 text-sm italic">No maintenance notes recorded yet.</p>
          )}
        </div>

        {isUpdatingMachine && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-slate-900 mb-4">Log Usage & Maintenance</h3>
              <form onSubmit={handleUpdateMachine} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Add Hours</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={addHours}
                    onChange={(e) => setAddHours(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    placeholder="e.g., 8.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Add Fuel Used (L)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={addFuel}
                    onChange={(e) => setAddFuel(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    placeholder="e.g., 120"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Maintenance Note</label>
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    rows={3}
                    placeholder="e.g., Replaced oil filter, greased bearings"
                  />
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsUpdatingMachine(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700"
                  >
                    Save Log
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Tractor className="w-6 h-6 text-amber-600" />
          Machinery Fleet
        </h2>
        <button 
          onClick={() => setIsAddingMachine(true)}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Machine
        </button>
      </div>

      {machinery.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
          <Tractor className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No machinery added yet.</p>
          <p className="text-slate-400 text-sm mt-1">Add your tractors, harvesters, and vehicles to track usage.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {machinery.map(machine => (
            <div 
              key={machine.id} 
              onClick={() => setSelectedMachine(machine)}
              className="border border-slate-200 rounded-xl p-5 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group relative"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{machine.name}</h3>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{machine.type}</span>
                </div>
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform">
                  <Tractor className="w-5 h-5" />
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-sm text-slate-600 mb-4">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>{machine.hours}h</span>
                </div>
                <div className="flex items-center gap-1">
                  <Fuel className="w-4 h-4 text-slate-400" />
                  <span>{machine.fuelUsed}L</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <span className="text-amber-600 text-sm font-medium flex items-center gap-1">
                  View Details <ChevronRight className="w-4 h-4" />
                </span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteMachine(machine.id);
                  }}
                  className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isAddingMachine && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Add New Machine</h3>
            <form onSubmit={handleAddMachine} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Machine Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  placeholder="e.g., John Deere 8R"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                >
                  <option value="Tractor">Tractor</option>
                  <option value="Harvester">Harvester</option>
                  <option value="Sprayer">Sprayer</option>
                  <option value="Vehicle">Vehicle</option>
                  <option value="Implement">Implement</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsAddingMachine(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700"
                >
                  Add Machine
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
