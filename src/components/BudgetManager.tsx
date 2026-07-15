import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth, handleFirestoreError, OperationType } from '../contexts/AuthContext';
import { Target, Plus, Trash2, Edit2, DollarSign, PieChart as PieChartIcon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface Budget {
  id: string;
  year: string;
  category: string;
  amount: number;
  updatedAt: string;
}

interface BudgetManagerProps {
  energyLogs: any[];
  rdExpenses: any[];
  marketingExpenses: any[];
}

const CATEGORIES = [
  "Paddock Inputs", 
  "Machinery", 
  "Labour", 
  "Energy", 
  "Production", 
  "Marketing", 
  "R&D", 
  "Other", 
  "Income"
];

export function BudgetManager({ energyLogs, rdExpenses, marketingExpenses }: BudgetManagerProps) {
  const { userData } = useAuth();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [isAddingBudget, setIsAddingBudget] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  // Form states
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (!userData?.farmId) return;

    const q = query(collection(db, `farms/${userData.farmId}/budgets`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Budget));
      setBudgets(items);
    }, (error) => {
      console.error("Error listening to budgets:", error);
      handleFirestoreError(error, OperationType.GET, `farms/${userData.farmId}/budgets`);
    });

    return () => unsubscribe();
  }, [userData?.farmId]);

  useEffect(() => {
    if (!userData?.farmId) return;
    
    const fetchYearTransactions = async () => {
      try {
        const startOfYear = `${selectedYear}-01-01`;
        const endOfYear = `${selectedYear}-12-31`;
        
        const q = query(
          collection(db, `farms/${userData.farmId}/financial_transactions`),
          where('date', '>=', startOfYear),
          where('date', '<=', endOfYear)
        );
        
        const snapshot = await getDocs(q);
        setTransactions(snapshot.docs.map(doc => doc.data()));
      } catch (error) {
        console.error("Error fetching year transactions:", error);
      }
    };
    
    fetchYearTransactions();
  }, [userData?.farmId, selectedYear]);

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.farmId) return;

    const budgetId = editingBudget ? editingBudget.id : uuidv4();
    const budgetData: Budget = {
      id: budgetId,
      year: selectedYear,
      category,
      amount: parseFloat(amount) || 0,
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, `farms/${userData.farmId}/budgets`, budgetId), budgetData);
    
    setIsAddingBudget(false);
    setEditingBudget(null);
    setAmount('');
    setCategory(CATEGORIES[0]);
  };

  const handleDeleteBudget = async (id: string) => {
    if (!userData?.farmId) return;
    if (window.confirm('Are you sure you want to delete this budget?')) {
      await deleteDoc(doc(db, `farms/${userData.farmId}/budgets`, id));
    }
  };

  const startEditing = (budget: Budget) => {
    setEditingBudget(budget);
    setCategory(budget.category);
    setAmount(budget.amount.toString());
    setIsAddingBudget(true);
  };

  // Calculate actuals for the selected year
  const getActualForCategory = (cat: string) => {
    let total = 0;
    
    // Base transactions
    total += transactions
      .filter(t => t.category === cat && t.date.startsWith(selectedYear))
      .reduce((sum, t) => sum + t.amount, 0);

    // Special categories
    if (cat === 'Energy') {
      total += energyLogs
        .filter(l => l.month.startsWith(selectedYear))
        .reduce((sum, l) => sum + (l.volume * l.unitCost), 0);
    } else if (cat === 'R&D') {
      total += rdExpenses
        .filter(e => e.date.startsWith(selectedYear))
        .reduce((sum, e) => sum + e.amount, 0);
    } else if (cat === 'Marketing') {
      total += marketingExpenses
        .filter(e => e.date.startsWith(selectedYear))
        .reduce((sum, e) => sum + e.amount, 0);
    } else if (cat === 'Income') {
      total = transactions
        .filter(t => t.type === 'income' && t.date.startsWith(selectedYear))
        .reduce((sum, t) => sum + t.amount, 0);
    }

    return total;
  };

  const currentYearBudgets = budgets.filter(b => b.year === selectedYear);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-slate-900">Farm Budget Planning</h2>
            <select 
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700"
            >
              {[0, 1, 2].map(offset => {
                const year = (new Date().getFullYear() + offset - 1).toString();
                return <option key={year} value={year}>{year}</option>;
              })}
            </select>
          </div>
          <button 
            onClick={() => {
              setEditingBudget(null);
              setAmount('');
              setCategory(CATEGORIES[0]);
              setIsAddingBudget(true);
            }}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Budget Line
          </button>
        </div>

        {isAddingBudget && (
          <form onSubmit={handleSaveBudget} className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-8">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              {editingBudget ? 'Edit Budget Line' : 'New Budget Line'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Budget Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsAddingBudget(false);
                  setEditingBudget(null);
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
              >
                Save Budget
              </button>
            </div>
          </form>
        )}

        {currentYearBudgets.length === 0 && !isAddingBudget ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Target className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">No active budgets for {selectedYear}</h3>
            <p className="text-slate-500 max-w-sm mx-auto mb-6">
              Set up your annual budget to track planned vs. actual expenses across all categories.
            </p>
            <button 
              onClick={() => setIsAddingBudget(true)}
              className="bg-slate-900 text-white px-6 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors"
            >
              Create First Budget
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {currentYearBudgets.map(budget => {
              const actual = getActualForCategory(budget.category);
              const percentage = budget.amount > 0 ? (actual / budget.amount) * 100 : 0;
              const isOverBudget = actual > budget.amount && budget.category !== 'Income';
              const isUnderIncome = actual < budget.amount && budget.category === 'Income';
              
              let statusColor = 'bg-emerald-500';
              if (budget.category === 'Income') {
                statusColor = isUnderIncome ? 'bg-amber-500' : 'bg-emerald-500';
              } else {
                if (percentage > 100) statusColor = 'bg-rose-500';
                else if (percentage > 85) statusColor = 'bg-amber-500';
              }

              return (
                <div key={budget.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${budget.category === 'Income' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                        {budget.category === 'Income' ? <DollarSign className="w-5 h-5" /> : <PieChartIcon className="w-5 h-5" />}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">{budget.category}</h3>
                        <p className="text-sm text-slate-500">
                          {percentage.toFixed(1)}% of budget {budget.category === 'Income' ? 'achieved' : 'used'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-bold text-slate-900">${actual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p className="text-sm text-slate-500">of ${budget.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div className="flex items-center gap-1 border-l border-slate-200 pl-4">
                        <button 
                          onClick={() => startEditing(budget)}
                          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteBudget(budget.id)}
                          className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className={`h-2.5 rounded-full ${statusColor} transition-all duration-500`} 
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    ></div>
                  </div>
                  
                  {(isOverBudget || isUnderIncome) && (
                    <p className={`text-xs mt-2 font-medium ${budget.category === 'Income' ? 'text-amber-600' : 'text-rose-600'}`}>
                      {budget.category === 'Income' 
                        ? `Tracking $${(budget.amount - actual).toLocaleString()} under income target.`
                        : `Over budget by $${(actual - budget.amount).toLocaleString()}`
                      }
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
