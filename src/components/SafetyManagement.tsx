import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Plus, 
  Trash2, 
  Save, 
  Loader2, 
  AlertCircle,
  CheckCircle2,
  GripVertical
} from 'lucide-react';
import { safetyApi } from '../services/api';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';

interface SafetyItem {
  id: string;
  text: string;
  required: boolean;
}

interface SafetyManagementProps {
  farmId: string;
}

export function SafetyManagement({ farmId }: SafetyManagementProps) {
  const [items, setItems] = useState<SafetyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    const loadChecklist = async () => {
      setIsLoading(true);
      try {
        const data = await safetyApi.getChecklist(farmId);
        if (data && data.items) {
          setItems(data.items);
        } else {
          // Default items
          setItems([
            { id: '1', text: 'Wear appropriate PPE (Gloves, Eye Protection)', required: true },
            { id: '2', text: 'Check equipment for damage before use', required: true },
            { id: '3', text: 'Ensure you have a working communication device', required: true }
          ]);
        }
      } catch (error) {
        console.error("Failed to load safety checklist:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadChecklist();
  }, [farmId]);

  const handleAddItem = () => {
    const newItem: SafetyItem = {
      id: Math.random().toString(36).substr(2, 9),
      text: '',
      required: true
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleUpdateItem = (id: string, text: string) => {
    setItems(items.map(item => item.id === id ? { ...item, text } : item));
  };

  const handleToggleRequired = (id: string) => {
    setItems(items.map(item => item.id === id ? { ...item, required: !item.required } : item));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatus(null);
    try {
      await safetyApi.saveChecklist(farmId, {
        id: 'safety',
        items: items.filter(item => item.text.trim() !== '')
      });
      setStatus({ type: 'success', message: 'Safety checklist saved successfully.' });
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      setStatus({ type: 'error', message: 'Failed to save safety checklist.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[40px] shadow-sm border border-slate-200 p-10">
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          <div className="w-2 h-2 rounded-full bg-rose-500" />
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Safety Checklist Management</h2>
            <p className="text-sm text-slate-400 font-medium">Define the safety checks workers must complete before starting a task.</p>
          </div>
        </div>
        <button 
          onClick={handleAddItem}
          className="flex items-center gap-2 px-6 py-3 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-[20px] text-xs font-black uppercase tracking-widest transition-all border border-slate-200"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </button>
      </div>

      <div className="space-y-4 mb-10">
        <AnimatePresence initial={false}>
          {items.map((item, index) => (
            <motion.div 
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex items-center gap-4 p-6 bg-slate-50/50 rounded-[28px] border border-slate-100 group hover:border-amber-500/30 transition-all"
            >
              <div className="text-slate-300">
                <GripVertical className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <input 
                  type="text" 
                  value={item.text}
                  onChange={(e) => handleUpdateItem(item.id, e.target.value)}
                  placeholder="Enter safety check description..."
                  className="w-full bg-transparent border-none outline-none text-slate-700 font-medium placeholder:text-slate-300"
                />
              </div>
              <div className="flex items-center gap-6">
                <button 
                  onClick={() => handleToggleRequired(item.id)}
                  className={clsx(
                    "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all",
                    item.required 
                      ? "bg-rose-50 text-rose-600 border-rose-100" 
                      : "bg-slate-100 text-slate-400 border-slate-200"
                  )}
                >
                  {item.required ? 'Required' : 'Optional'}
                </button>
                <button 
                  onClick={() => handleRemoveItem(item.id)}
                  className="p-2 text-slate-300 hover:text-rose-600 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {items.length === 0 && (
          <div className="text-center py-20 bg-slate-50/30 rounded-[40px] border border-dashed border-slate-200">
            <ShieldCheck className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-400 font-medium">No safety items defined yet.</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-8 border-t border-slate-100">
        <div className="flex items-center gap-3">
          {status && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold",
                status.type === 'success' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              )}
            >
              {status.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {status.message}
            </motion.div>
          )}
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-3 bg-slate-900 text-white px-10 py-5 rounded-[24px] text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Save Checklist
        </button>
      </div>
    </div>
  );
}
