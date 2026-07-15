import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface ManageInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (item: any) => Promise<void>;
  initialType?: string;
  initialCategory?: string;
}

const INPUT_TYPES = ["Herbicide", "Fertiliser", "Adjuvant/Surfactant", "Fungicide", "Bactercide", "Insecticide", "Biostimulant", "Biocontrol"];
const CATEGORIES = ["Organic", "Conventional"];

export function ManageInventoryModal({ isOpen, onClose, onUpdate, initialType, initialCategory }: ManageInventoryModalProps) {
  const [name, setName] = useState('');
  const [activeIngredient, setActiveIngredient] = useState('');
  const [selectedType, setSelectedType] = useState(initialType || INPUT_TYPES[0]);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory || CATEGORIES[0]);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('L');
  const [unitCost, setUnitCost] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setActiveIngredient('');
      setSelectedType(initialType || INPUT_TYPES[0]);
      setSelectedCategory(initialCategory || CATEGORIES[0]);
      setQuantity('');
      setUnit('L');
      setUnitCost('');
    }
  }, [isOpen, initialType, initialCategory]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onUpdate({
        name,
        activeIngredient,
        type: selectedType,
        category: selectedCategory,
        quantity: Number(quantity),
        unit: unit,
        unitCost: Number(unitCost),
        updatedAt: new Date().toISOString()
      });
      onClose();
    } catch (error) {
      console.error("Error adding inventory item:", error);
      alert("Failed to add inventory item.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-900">Add Inventory Item</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
              placeholder="e.g. Roundup Ultra"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Active Ingredient (Optional)</label>
            <input
              type="text"
              value={activeIngredient}
              onChange={e => setActiveIngredient(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
              placeholder="e.g. Glyphosate"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Input Type</label>
              <select
                value={selectedType}
                onChange={e => setSelectedType(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
              >
                {INPUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantity On Hand</label>
              <input
                type="number"
                required
                min="0"
                step="0.1"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                placeholder="0.0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
              >
                <option value="L">Litres (L)</option>
                <option value="kg">Kilograms (kg)</option>
                <option value="units">Units</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Unit Cost ($)</label>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={unitCost}
              onChange={e => setUnitCost(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
              placeholder="0.00"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 text-white bg-slate-900 hover:bg-slate-800 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
