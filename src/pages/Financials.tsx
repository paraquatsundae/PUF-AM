import React, { useState, useEffect } from 'react';
import { useAuth, handleFirestoreError, OperationType } from '../contexts/AuthContext';
import { collection, query, orderBy, getDocs, limit, startAfter, doc, setDoc, deleteDoc, writeBatch, increment, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { AddTransactionModal } from '../components/AddTransactionModal';
import { ManageInventoryModal } from '../components/ManageInventoryModal';
import { MachineryManager } from '../components/MachineryManager';
import { LabourManager } from '../components/LabourManager';
import { EnergyManager } from '../components/EnergyManager';
import { RDManager } from '../components/RDManager';
import { MarketingManager } from '../components/MarketingManager';
import { BudgetManager } from '../components/BudgetManager';
import { ProductionManager } from '../components/ProductionManager';
import { useMapStore } from '../lib/mapStore';
import { useTaskStore } from '../lib/taskStore';
import { useFarmDiary } from '../lib/farmDiary';
import { v4 as uuidv4 } from 'uuid';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  Tractor,
  Users,
  Zap,
  Package,
  Megaphone,
  FlaskConical,
  MoreHorizontal,
  Droplets,
  ArrowLeft,
  Trash2
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';

// Mock Data for Phase 2
const kpiData = {
  netProfitMargin: 24.5,
  costPerHectare: 4250,
  breakEvenPrice: 3.85,
  burnRate: 12500,
};

const expenseDistribution = [
  { name: 'Labour', value: 45000, color: '#3b82f6' },
  { name: 'Inputs', value: 32000, color: '#10b981' },
  { name: 'Machinery', value: 28000, color: '#f59e0b' },
  { name: 'Energy', value: 15000, color: '#ef4444' },
  { name: 'Other', value: 8000, color: '#8b5cf6' },
];

const budgetVsActual = [
  { name: 'Jan', budget: 10000, actual: 9500 },
  { name: 'Feb', budget: 12000, actual: 12500 },
  { name: 'Mar', budget: 15000, actual: 14200 },
  { name: 'Apr', budget: 18000, actual: 19000 },
  { name: 'May', budget: 20000, actual: 18500 },
  { name: 'Jun', budget: 22000, actual: 23000 },
];

const subMenus = [
  { id: 'inputs', name: 'Paddock Inputs', icon: Droplets, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  { id: 'machinery', name: 'Machinery', icon: Tractor, color: 'text-amber-600', bg: 'bg-amber-100' },
  { id: 'labour', name: 'Labour', icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
  { id: 'energy', name: 'Energy', icon: Zap, color: 'text-rose-600', bg: 'bg-rose-100' },
  { id: 'production', name: 'Production', icon: Package, color: 'text-indigo-600', bg: 'bg-indigo-100' },
  { id: 'marketing', name: 'Marketing', icon: Megaphone, color: 'text-pink-600', bg: 'bg-pink-100' },
  { id: 'rnd', name: 'R&D', icon: FlaskConical, color: 'text-purple-600', bg: 'bg-purple-100' },
  { id: 'other', name: 'Other', icon: MoreHorizontal, color: 'text-slate-600', bg: 'bg-slate-100' },
];

export function Financials() {
  const { user, userData } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedInventoryType, setSelectedInventoryType] = useState<{type: string, category: string} | null>(null);
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [isManagingInventory, setIsManagingInventory] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [energyLogs, setEnergyLogs] = useState<any[]>([]);
  const [rdExpenses, setRdExpenses] = useState<any[]>([]);
  const [marketingExpenses, setMarketingExpenses] = useState<any[]>([]);
  const [packingLogs, setPackingLogs] = useState<any[]>([]);
  const [harvests, setHarvests] = useState<any[]>([]);
  const [lastVisibleTx, setLastVisibleTx] = useState<any>(null);
  const [hasMoreTxs, setHasMoreTxs] = useState(true);
  const [isLoadingTxs, setIsLoadingTxs] = useState(false);
  const [aggregates, setAggregates] = useState<any>(null);

  const { blocks, totalAreaHa } = useMapStore();
  const { tasks, loadTasks } = useTaskStore();
  const { events: diaryEvents } = useFarmDiary();

  useEffect(() => {
    if (!userData?.farmId) return;
    loadTasks(userData.farmId);
  }, [userData?.farmId, loadTasks]);

  useEffect(() => {
    if (!userData?.farmId) return;
    const aggRef = doc(db, `farms/${userData.farmId}/aggregates/financials`);
    const unsubscribe = onSnapshot(aggRef, (docSnap) => {
      if (docSnap.exists()) {
        setAggregates(docSnap.data());
      }
    }, (error) => {
      console.error("Error listening to aggregates:", error);
      handleFirestoreError(error, OperationType.GET, `farms/${userData.farmId}/aggregates/financials`);
    });
    return () => unsubscribe();
  }, [userData?.farmId]);

  const loadTransactions = async (isLoadMore = false) => {
    if (!userData?.farmId) return;
    setIsLoadingTxs(true);
    try {
      let q = query(
        collection(db, `farms/${userData.farmId}/financial_transactions`),
        orderBy('date', 'desc'),
        limit(20)
      );

      if (isLoadMore && lastVisibleTx) {
        q = query(
          collection(db, `farms/${userData.farmId}/financial_transactions`),
          orderBy('date', 'desc'),
          startAfter(lastVisibleTx),
          limit(20)
        );
      }

      const snapshot = await getDocs(q);
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (snapshot.docs.length > 0) {
        setLastVisibleTx(snapshot.docs[snapshot.docs.length - 1]);
      }
      
      if (snapshot.docs.length < 20) {
        setHasMoreTxs(false);
      }

      if (isLoadMore) {
        setTransactions(prev => [...prev, ...txs]);
      } else {
        setTransactions(txs);
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setIsLoadingTxs(false);
    }
  };

  useEffect(() => {
    if (!userData?.farmId) return;
    loadTransactions();
  }, [userData?.farmId]);

  useEffect(() => {
    if (!userData?.farmId) return;

    const fetchOtherData = async () => {
      try {
        const qInv = query(collection(db, `farms/${userData.farmId}/inventory`));
        const invSnap = await getDocs(qInv);
        setInventory(invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const qEnergy = query(collection(db, `farms/${userData.farmId}/energy_logs`));
        const energySnap = await getDocs(qEnergy);
        setEnergyLogs(energySnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const qRD = query(collection(db, `farms/${userData.farmId}/rd_expenses`));
        const rdSnap = await getDocs(qRD);
        setRdExpenses(rdSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const qMarketing = query(collection(db, `farms/${userData.farmId}/marketing_expenses`));
        const marketingSnap = await getDocs(qMarketing);
        setMarketingExpenses(marketingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const qPacking = query(collection(db, `farms/${userData.farmId}/packing_logs`));
        const packingSnap = await getDocs(qPacking);
        setPackingLogs(packingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const qHarvests = query(collection(db, `farms/${userData.farmId}/harvests`));
        const harvestsSnap = await getDocs(qHarvests);
        setHarvests(harvestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error fetching other data:", error);
      }
    };

    fetchOtherData();
  }, [userData?.farmId]);

  // Compute Dashboard Stats
  const totalIncome = aggregates?.totalIncome || 0;
  const totalExpense = aggregates?.totalExpense || 0;
  
  // Detailed Expense Breakdown
  const energyTotal = energyLogs.reduce((sum, l) => sum + (l.volume * l.unitCost), 0);
  const rdTotal = rdExpenses.reduce((sum, e) => sum + e.amount, 0);
  const marketingTotal = marketingExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  // Category Totals from Aggregates
  const labourTotal = aggregates?.category_Labour || 0;
  const inputsTotal = aggregates?.['category_Paddock Inputs'] || 0;
  const machineryTotal = aggregates?.category_Machinery || 0;
  const otherTotal = (aggregates?.category_Other || 0) + (aggregates?.category_Production || 0);

  const realExpenseDistribution = [
    { name: 'Labour', value: labourTotal, color: '#3b82f6' },
    { name: 'Inputs', value: inputsTotal, color: '#10b981' },
    { name: 'Machinery', value: machineryTotal, color: '#f59e0b' },
    { name: 'Energy', value: energyTotal, color: '#ef4444' },
    { name: 'R&D', value: rdTotal, color: '#8b5cf6' },
    { name: 'Marketing', value: marketingTotal, color: '#ec4899' },
    { name: 'Other', value: otherTotal, color: '#64748b' },
  ].filter(d => d.value > 0);

  // If no data yet, use some mock values for visual placeholder
  const displayDistribution = realExpenseDistribution.length > 0 ? realExpenseDistribution : expenseDistribution;

  const netProfit = totalIncome - totalExpense;
  const netProfitMargin = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : "0.0";
  
  // Calculate Cost of Production per Kilo (YTD)
  const currentYear = new Date().getFullYear().toString();
  const ytdExpenseTransactions = totalExpense; // Approximation using total expense
  const ytdEnergy = energyLogs.filter(l => l.month.startsWith(currentYear)).reduce((sum, l) => sum + (l.volume * l.unitCost), 0);
  const ytdRd = rdExpenses.filter(e => e.date.startsWith(currentYear)).reduce((sum, e) => sum + e.amount, 0);
  const ytdMarketing = marketingExpenses.filter(e => e.date.startsWith(currentYear)).reduce((sum, e) => sum + e.amount, 0);
  
  const ytdTotalExpense = ytdExpenseTransactions + ytdEnergy + ytdRd + ytdMarketing;
  const ytdPacked = packingLogs.filter(l => l.date.startsWith(currentYear)).reduce((acc, curr) => acc + curr.totalKilos, 0);
  
  const costPerKilo = ytdPacked > 0 ? (ytdTotalExpense / ytdPacked).toFixed(2) : "0.00";

  // Calculate Cost per Hectare
  const costPerHectare = totalAreaHa > 0 ? (ytdTotalExpense / totalAreaHa).toFixed(2) : "0.00";

  // Block Profitability Calculations
  const blockProfitability = blocks.map(block => {
    const blockHarvests = harvests.filter(h => h.blockId === block.id);
    const blockYield = blockHarvests.reduce((sum, h) => sum + (h.totalWeight || 0), 0);
    
    const blockTasks = tasks.filter(t => t.targetBlockId === block.id).length;
    const blockSprays = diaryEvents.filter(e => e.type === 'spray' && e.blockId === block.id).length;
    const blockIrrigation = diaryEvents.filter(e => e.type === 'irrigation' && e.blockId === block.id).reduce((sum, e) => sum + (e.irrigationAmount || 0), 0);
    
    return {
      ...block,
      yield: blockYield,
      tasks: blockTasks,
      sprays: blockSprays,
      irrigation: blockIrrigation
    };
  });

  const totalFarmYield = blockProfitability.reduce((sum, b) => sum + b.yield, 0);
  const totalFarmTasks = blockProfitability.reduce((sum, b) => sum + b.tasks, 0);
  const totalFarmSprays = blockProfitability.reduce((sum, b) => sum + b.sprays, 0);
  const totalFarmIrrigation = blockProfitability.reduce((sum, b) => sum + b.irrigation, 0);

  const blockMetrics = blockProfitability.map(block => {
    // Distribute Income
    const income = totalFarmYield > 0 
      ? (block.yield / totalFarmYield) * totalIncome 
      : (totalAreaHa > 0 ? ((block.areaHa || 0) / totalAreaHa) * totalIncome : 0);

    // Distribute Costs
    const inputsCost = totalFarmSprays > 0 
      ? (block.sprays / totalFarmSprays) * inputsTotal 
      : (totalAreaHa > 0 ? ((block.areaHa || 0) / totalAreaHa) * inputsTotal : 0);
      
    const labourCost = totalFarmTasks > 0 
      ? (block.tasks / totalFarmTasks) * labourTotal 
      : (totalAreaHa > 0 ? ((block.areaHa || 0) / totalAreaHa) * labourTotal : 0);
      
    const energyCost = totalFarmIrrigation > 0 
      ? (block.irrigation / totalFarmIrrigation) * energyTotal 
      : (totalAreaHa > 0 ? ((block.areaHa || 0) / totalAreaHa) * energyTotal : 0);
      
    const machineryCost = totalAreaHa > 0 ? ((block.areaHa || 0) / totalAreaHa) * machineryTotal : 0;
    
    const directCosts = inputsCost + labourCost + energyCost + machineryCost;
    
    // Distribute Overheads (Marketing, R&D, Other)
    const overheadsTotal = marketingTotal + rdTotal + otherTotal;
    const allocatedOverheads = totalAreaHa > 0 ? ((block.areaHa || 0) / totalAreaHa) * overheadsTotal : 0;
    
    const totalBlockCosts = directCosts + allocatedOverheads;
    const grossMargin = income - totalBlockCosts;
    const marginPerHa = block.areaHa && block.areaHa > 0 ? grossMargin / block.areaHa : 0;

    return {
      id: block.id,
      name: block.name,
      areaHa: block.areaHa || 0,
      yield: block.yield,
      income,
      directCosts,
      allocatedOverheads,
      totalBlockCosts,
      grossMargin,
      marginPerHa
    };
  }).sort((a, b) => b.marginPerHa - a.marginPerHa);

  // Monthly breakdown for BarChart
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const monthStr = d.toLocaleString('default', { month: 'short' });
    const monthKey = d.toISOString().slice(0, 7); // YYYY-MM
    
    const monthIncome = aggregates?.[`monthly_${monthKey}_income`] || 0;
    const monthExpense = aggregates?.[`monthly_${monthKey}_expense`] || 0;
    
    return { name: monthStr, income: monthIncome, expense: monthExpense };
  });

  const displayMonthlyData = monthlyData.some(d => d.income > 0 || d.expense > 0) ? monthlyData : budgetVsActual.map(d => ({ name: d.name, income: d.budget, expense: d.actual }));

  const handleAddTransaction = async (data: any) => {
    if (!userData?.farmId || !user) return;
    
    const batch = writeBatch(db);
    const txRef = doc(collection(db, `farms/${userData.farmId}/financial_transactions`));
    
    batch.set(txRef, {
      id: txRef.id,
      ...data,
      createdAt: new Date().toISOString(),
      createdBy: user.uid
    });

    // Dev-only client aggregate writes; production uses Cloud Function (Step 12)
    if (import.meta.env.DEV) {
      const aggRef = doc(db, `farms/${userData.farmId}/aggregates/financials`);
      const amount = Number(data.amount) || 0;
      const isIncome = data.type === 'income';
      const monthKey = data.date.slice(0, 7);

      const updates: Record<string, ReturnType<typeof increment>> = {
        totalIncome: isIncome ? increment(amount) : increment(0),
        totalExpense: !isIncome ? increment(amount) : increment(0),
        [`monthly_${monthKey}_income`]: isIncome ? increment(amount) : increment(0),
        [`monthly_${monthKey}_expense`]: !isIncome ? increment(amount) : increment(0),
      };

      if (!isIncome && data.category) {
        updates[`category_${data.category}`] = increment(amount);
      }

      batch.set(aggRef, updates, { merge: true });
    }

    await batch.commit();
    
    // Refresh local list
    loadTransactions();
  };

  const handleDeleteTransaction = async (tx: any) => {
    if (!userData?.farmId) return;
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      const batch = writeBatch(db);
      const txRef = doc(db, `farms/${userData.farmId}/financial_transactions`, tx.id);
      batch.delete(txRef);

      // Dev-only client aggregate writes; production uses Cloud Function (Step 12)
      if (import.meta.env.DEV) {
        const aggRef = doc(db, `farms/${userData.farmId}/aggregates/financials`);
        const amount = Number(tx.amount) || 0;
        const isIncome = tx.type === 'income';
        const monthKey = tx.date.slice(0, 7);

        const updates: Record<string, ReturnType<typeof increment>> = {
          totalIncome: isIncome ? increment(-amount) : increment(0),
          totalExpense: !isIncome ? increment(-amount) : increment(0),
          [`monthly_${monthKey}_income`]: isIncome ? increment(-amount) : increment(0),
          [`monthly_${monthKey}_expense`]: !isIncome ? increment(-amount) : increment(0),
        };

        if (!isIncome && tx.category) {
          updates[`category_${tx.category}`] = increment(-amount);
        }

        batch.set(aggRef, updates, { merge: true });
      }

      await batch.commit();
      
      // Refresh local list
      loadTransactions();
    }
  };

  const handleUpdateInventory = async (item: any) => {
    if (!userData?.farmId) return;
    
    try {
      const itemId = item.id || uuidv4();
      const itemRef = doc(db, `farms/${userData.farmId}/inventory`, itemId);
      await setDoc(itemRef, { ...item, id: itemId });
    } catch (error) {
      console.error("Error updating inventory:", error);
      throw error;
    }
  };

  const handleRecalculateAggregates = async () => {
    if (!userData?.farmId) return;
    if (!window.confirm('This will recalculate all financial totals from your entire history. Continue?')) return;
    
    try {
      // Fetch ALL transactions (no limit)
      const q = query(collection(db, `farms/${userData.farmId}/financial_transactions`));
      const snapshot = await getDocs(q);
      const allTxs = snapshot.docs.map(doc => doc.data());
      
      let totalIncome = 0;
      let totalExpense = 0;
      const categories: Record<string, number> = {};
      const monthly: Record<string, number> = {};
      
      allTxs.forEach(tx => {
        const amount = Number(tx.amount) || 0;
        const monthKey = tx.date?.slice(0, 7);
        if (tx.type === 'income') {
          totalIncome += amount;
          if (monthKey) monthly[`monthly_${monthKey}_income`] = (monthly[`monthly_${monthKey}_income`] || 0) + amount;
        } else {
          totalExpense += amount;
          if (monthKey) monthly[`monthly_${monthKey}_expense`] = (monthly[`monthly_${monthKey}_expense`] || 0) + amount;
          if (tx.category) {
            categories[`category_${tx.category}`] = (categories[`category_${tx.category}`] || 0) + amount;
          }
        }
      });
      
      const aggRef = doc(db, `farms/${userData.farmId}/aggregates/financials`);
      await setDoc(aggRef, {
        totalIncome,
        totalExpense,
        ...categories,
        ...monthly,
        lastRecalculated: new Date().toISOString()
      });
      
      alert('Totals recalculated successfully!');
    } catch (error) {
      console.error("Error recalculating:", error);
      alert('Failed to recalculate totals.');
    }
  };

  const getInventoryValue = (type: string, category: string) => {
    const items = inventory.filter(i => i.type === type && i.category === category);
    return items.reduce((sum, item) => sum + (item.quantity * (item.unitCost || item.price || 0)), 0);
  };

  const filteredTransactions = selectedCategory 
    ? transactions.filter(t => t.category === selectedCategory)
    : transactions;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Financials</h1>
          <p className="text-slate-500 mt-1">Command center for farm economics and unit costs.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleRecalculateAggregates}
              className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
              title="Recalculate all totals from history"
            >
              Recalculate Totals
            </button>
            <div className="flex bg-white rounded-lg shadow-sm border border-slate-200 p-1">
              <button 
                onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('ledger')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'ledger' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Inputs
            </button>
            <button 
              onClick={() => setActiveTab('budgeting')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'budgeting' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Budgeting
            </button>
          </div>
          </div>
          {activeTab === 'ledger' && selectedCategory && !selectedInventoryType && (
            <button
              onClick={() => setSelectedCategory(null)}
              className="flex items-center px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Inputs
            </button>
          )}
          {activeTab === 'ledger' && selectedInventoryType && (
            <button
              onClick={() => setSelectedInventoryType(null)}
              className="flex items-center px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Snapshot
            </button>
          )}
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-500">Net Profit Margin</h3>
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900">{netProfitMargin}%</div>
              <p className="text-sm text-emerald-600 flex items-center mt-2">
                <TrendingUp className="w-4 h-4 mr-1" /> Real-time margin
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-500">Cost of Production</h3>
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-blue-600" />
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900">${costPerKilo}<span className="text-lg text-slate-500 font-medium">/kg</span></div>
              <p className="text-sm text-slate-500 mt-2">Based on {ytdPacked.toLocaleString()} kg packed YTD</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-500">Cost per Hectare</h3>
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-indigo-600" />
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900">${costPerHectare}</div>
              <p className="text-sm text-slate-500 mt-2">Based on {totalAreaHa.toFixed(1)}ha farm area</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-500">Total Income</h3>
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-amber-600" />
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900">${totalIncome.toLocaleString()}</div>
              <p className="text-sm text-slate-500 mt-2">YTD gross income</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-500">Total Expenses</h3>
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-rose-600" />
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900">${totalExpense.toLocaleString()}</div>
              <p className="text-sm text-rose-600 flex items-center mt-2">
                <TrendingDown className="w-4 h-4 mr-1" /> All categories
              </p>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Expense Distribution */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-900">Expense Distribution</h3>
                <PieChartIcon className="w-5 h-5 text-slate-400" />
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={displayDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {displayDistribution.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => `$${value.toLocaleString()}`}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Income vs Expenses */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-900">Income vs. Expenses</h3>
                <BarChartIcon className="w-5 h-5 text-slate-400" />
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={displayMonthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} tickFormatter={(value) => `$${value / 1000}k`} />
                    <Tooltip 
                      formatter={(value: number) => `$${value.toLocaleString()}`}
                      cursor={{ fill: '#f1f5f9' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend />
                    <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" name="Expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Block Profitability Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Block Profitability Analysis</h3>
                <p className="text-sm text-slate-500 mt-1">Income and costs distributed by block activity and area.</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 font-medium">
                  <tr>
                    <th className="px-6 py-4">Block Name</th>
                    <th className="px-6 py-4 text-right">Area (ha)</th>
                    <th className="px-6 py-4 text-right">Yield (kg)</th>
                    <th className="px-6 py-4 text-right">Est. Income</th>
                    <th className="px-6 py-4 text-right">Direct Costs</th>
                    <th className="px-6 py-4 text-right">Overheads</th>
                    <th className="px-6 py-4 text-right">Gross Margin</th>
                    <th className="px-6 py-4 text-right">Margin / ha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {blockMetrics.map((block) => (
                    <tr key={block.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">{block.name}</td>
                      <td className="px-6 py-4 text-right text-slate-600">{block.areaHa.toFixed(2)}</td>
                      <td className="px-6 py-4 text-right text-slate-600">{block.yield.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right text-emerald-600">${block.income.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="px-6 py-4 text-right text-rose-600">${block.directCosts.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="px-6 py-4 text-right text-orange-600">${block.allocatedOverheads.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className={`px-6 py-4 text-right font-medium ${block.grossMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        ${block.grossMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className={`px-6 py-4 text-right font-bold ${block.marginPerHa >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        ${block.marginPerHa.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                  {blockMetrics.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                        No blocks defined in the Orchard Map yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'ledger' && (
        <div className="space-y-6">
          {!selectedCategory ? (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-4">Categories</h2>
                <p className="text-slate-600 mb-6">Select a category to view detailed transactions and specific metrics.</p>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {subMenus.map((menu) => (
                    <button
                      key={menu.id}
                      onClick={() => setSelectedCategory(menu.name)}
                      className="flex flex-col items-center justify-center p-6 rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all bg-white group"
                    >
                      <div className={`w-14 h-14 rounded-full ${menu.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                        <menu.icon className={`w-7 h-7 ${menu.color}`} />
                      </div>
                      <span className="font-semibold text-slate-900">{menu.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-slate-900">Recent Transactions</h2>
                  <button 
                    onClick={() => setIsAddingTransaction(true)}
                    className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    + Add Transaction
                  </button>
                </div>
                
                {transactions.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <DollarSign className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900 mb-2">No transactions yet</h3>
                    <p className="text-slate-500 max-w-sm mx-auto mb-6">
                      When you log operations like spraying or harvesting, the financial impacts will appear here.
                    </p>
                    <button 
                      onClick={() => setIsAddingTransaction(true)}
                      className="bg-slate-900 text-white px-6 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors"
                    >
                      Add Manual Transaction
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-sm text-slate-500">
                          <th className="pb-3 font-medium">Date</th>
                          <th className="pb-3 font-medium">Description</th>
                          <th className="pb-3 font-medium">Category</th>
                          <th className="pb-3 font-medium text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.slice(0, 5).map((tx) => (
                          <tr key={tx.id} className="border-b border-slate-100 last:border-0">
                            <td className="py-4 text-sm text-slate-600">{new Date(tx.date).toLocaleDateString()}</td>
                            <td className="py-4 text-sm font-medium text-slate-900">{tx.description}</td>
                            <td className="py-4">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                {tx.category}
                              </span>
                            </td>
                            <td className={`py-4 text-sm font-bold text-right ${tx.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                              {tx.type === 'income' ? '+' : '-'}${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-6">
              {selectedCategory === 'Paddock Inputs' && !selectedInventoryType && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold text-slate-900">Inventory Snapshot</h2>
                      <button 
                        onClick={() => {
                          setIsManagingInventory(true);
                        }}
                        className="text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-full transition-colors"
                      >
                        Add Inventory Item
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <span className="flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Organic</span>
                      <span className="flex items-center text-xs font-medium text-slate-600 bg-slate-50 px-2 py-1 rounded">Conventional</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Organic Section */}
                    <div>
                      <h3 className="text-sm font-bold text-emerald-700 uppercase tracking-wider mb-4 flex items-center">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></div>
                        Organic Inputs
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {["Herbicide", "Fertiliser", "Adjuvant/Surfactant", "Fungicide", "Bactercide", "Insecticide", "Biostimulant", "Biocontrol"].map(type => {
                          const value = getInventoryValue(type, 'Organic');
                          return (
                            <div 
                              key={`org-${type}`} 
                              onClick={() => setSelectedInventoryType({ type, category: 'Organic' })}
                              className="bg-emerald-50/30 border border-emerald-100 rounded-lg p-3 cursor-pointer hover:bg-emerald-50 transition-colors"
                            >
                              <div className="text-[10px] font-bold text-emerald-600 uppercase truncate mb-1" title={type}>{type}</div>
                              <div className="text-lg font-bold text-slate-900">
                                ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Conventional Section */}
                    <div>
                      <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center">
                        <div className="w-2 h-2 bg-slate-400 rounded-full mr-2"></div>
                        Conventional Inputs
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {["Herbicide", "Fertiliser", "Adjuvant/Surfactant", "Fungicide", "Bactercide", "Insecticide", "Biostimulant", "Biocontrol"].map(type => {
                          const value = getInventoryValue(type, 'Conventional');
                          return (
                            <div 
                              key={`conv-${type}`} 
                              onClick={() => setSelectedInventoryType({ type, category: 'Conventional' })}
                              className="bg-slate-50 border border-slate-100 rounded-lg p-3 cursor-pointer hover:bg-slate-100 transition-colors"
                            >
                              <div className="text-[10px] font-bold text-slate-500 uppercase truncate mb-1" title={type}>{type}</div>
                              <div className="text-lg font-bold text-slate-900">
                                ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedInventoryType && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold text-slate-900">
                        {selectedInventoryType.category} {selectedInventoryType.type} Inventory
                      </h2>
                    </div>
                    <button 
                      onClick={() => setIsManagingInventory(true)}
                      className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors"
                    >
                      + Add Item
                    </button>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-sm text-slate-500">
                          <th className="pb-3 font-medium">Name</th>
                          <th className="pb-3 font-medium">Active Ingredient</th>
                          <th className="pb-3 font-medium text-right">Volume on Hand</th>
                          <th className="pb-3 font-medium text-right">Unit Cost</th>
                          <th className="pb-3 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventory.filter(i => i.type === selectedInventoryType.type && i.category === selectedInventoryType.category).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-500">
                              No items found in this category.
                            </td>
                          </tr>
                        ) : (
                          inventory.filter(i => i.type === selectedInventoryType.type && i.category === selectedInventoryType.category).map(item => (
                            <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                              <td className="py-4 text-sm font-medium text-slate-900">{item.name}</td>
                              <td className="py-4 text-sm text-slate-600">{item.activeIngredient || '-'}</td>
                              <td className="py-4 text-sm text-slate-900 text-right">{item.quantity} {item.unit}</td>
                              <td className="py-4 text-sm font-bold text-slate-900 text-right">
                                ${(item.unitCost || item.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {item.unit}
                              </td>
                              <td className="py-4 text-right">
                                <button 
                                  onClick={async () => {
                                    try {
                                      await deleteDoc(doc(db, `farms/${userData.farmId}/inventory`, item.id));
                                    } catch (error) {
                                      console.error("Error deleting inventory item:", error);
                                    }
                                  }}
                                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="Delete Item"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedCategory === 'Machinery' && (
                <MachineryManager />
              )}

              {selectedCategory === 'Labour' && (
                <LabourManager />
              )}

              {selectedCategory === 'Energy' && (
                <EnergyManager />
              )}

              {selectedCategory === 'R&D' && (
                <RDManager />
              )}

              {selectedCategory === 'Marketing' && (
                <MarketingManager />
              )}

              {selectedCategory === 'Production' && (
                <ProductionManager />
              )}

              {!selectedInventoryType && selectedCategory !== 'Production' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <h2 className="text-2xl font-bold text-slate-900">{selectedCategory} Ledger</h2>
                    </div>
                  <button 
                    onClick={() => setIsAddingTransaction(true)}
                    className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors"
                  >
                    + Add Transaction
                  </button>
                </div>

              {filteredTransactions.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                  <p className="text-slate-500">No transactions found for {selectedCategory}.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-sm text-slate-500">
                        <th className="pb-3 font-medium">Date</th>
                        <th className="pb-3 font-medium">Description</th>
                        <th className="pb-3 font-medium text-right">Amount</th>
                        <th className="pb-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map((tx) => (
                        <tr key={tx.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                          <td className="py-4 text-sm text-slate-600">{new Date(tx.date).toLocaleDateString()}</td>
                          <td className="py-4 text-sm font-medium text-slate-900">{tx.description}</td>
                          <td className={`py-4 text-sm font-bold text-right ${tx.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                            {tx.type === 'income' ? '+' : '-'}${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-4 text-right">
                            <button 
                              onClick={() => handleDeleteTransaction(tx)}
                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Delete Transaction"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              {hasMoreTxs && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={() => loadTransactions(true)}
                    disabled={isLoadingTxs}
                    className="px-6 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
                  >
                    {isLoadingTxs ? 'Loading...' : 'Load More Transactions'}
                  </button>
                </div>
              )}
              </div>
            )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'budgeting' && (
        <BudgetManager 
          energyLogs={energyLogs}
          rdExpenses={rdExpenses}
          marketingExpenses={marketingExpenses}
        />
      )}

      <AddTransactionModal 
        isOpen={isAddingTransaction} 
        onClose={() => setIsAddingTransaction(false)} 
        initialCategory={selectedCategory}
        onAdd={handleAddTransaction}
      />

      <ManageInventoryModal
        isOpen={isManagingInventory}
        onClose={() => setIsManagingInventory(false)}
        onUpdate={handleUpdateInventory}
        initialType={selectedInventoryType?.type}
        initialCategory={selectedInventoryType?.category}
      />
    </div>
  );
}
