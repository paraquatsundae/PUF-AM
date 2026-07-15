import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Megaphone, Plus, Trash2, ChevronRight, DollarSign, ArrowLeft } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface MarketingCampaign {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
}

interface MarketingExpense {
  id: string;
  campaignId: string;
  date: string;
  description: string;
  amount: number;
  updatedAt: string;
}

export function MarketingManager() {
  const { userData } = useAuth();
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [expenses, setExpenses] = useState<MarketingExpense[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<MarketingCampaign | null>(null);
  
  const [isAddingCampaign, setIsAddingCampaign] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [campaignDesc, setCampaignDesc] = useState('');

  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');

  useEffect(() => {
    if (!userData?.farmId) return;
    
    const qCamp = query(collection(db, `farms/${userData.farmId}/marketing_campaigns`));
    const unsubCamp = onSnapshot(qCamp, (snapshot) => {
      setCampaigns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketingCampaign)));
    });

    const qExp = query(collection(db, `farms/${userData.farmId}/marketing_expenses`));
    const unsubExp = onSnapshot(qExp, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketingExpense)));
    });

    return () => { unsubCamp(); unsubExp(); };
  }, [userData?.farmId]);

  const handleAddCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.farmId) return;
    const newCamp: MarketingCampaign = {
      id: uuidv4(),
      name: campaignName,
      description: campaignDesc,
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, `farms/${userData.farmId}/marketing_campaigns`, newCamp.id), newCamp);
    setIsAddingCampaign(false);
    setCampaignName('');
    setCampaignDesc('');
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.farmId || !selectedCampaign) return;
    const newExp: MarketingExpense = {
      id: uuidv4(),
      campaignId: selectedCampaign.id,
      date: expDate,
      description: expDesc,
      amount: parseFloat(expAmount),
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, `farms/${userData.farmId}/marketing_expenses`, newExp.id), newExp);
    setIsAddingExpense(false);
    setExpDesc('');
    setExpAmount('');
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!userData?.farmId) return;
    if (window.confirm('Are you sure you want to delete this campaign and all its expenses?')) {
      await deleteDoc(doc(db, `farms/${userData.farmId}/marketing_campaigns`, id));
      const campaignExpenses = expenses.filter(e => e.campaignId === id);
      for (const exp of campaignExpenses) {
        await deleteDoc(doc(db, `farms/${userData.farmId}/marketing_expenses`, exp.id));
      }
      if (selectedCampaign?.id === id) setSelectedCampaign(null);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!userData?.farmId) return;
    if (window.confirm('Are you sure you want to delete this expense?')) {
      await deleteDoc(doc(db, `farms/${userData.farmId}/marketing_expenses`, id));
    }
  };

  if (selectedCampaign) {
    const campaignExpenses = expenses.filter(e => e.campaignId === selectedCampaign.id).sort((a, b) => b.date.localeCompare(a.date));
    const totalSpent = campaignExpenses.reduce((sum, e) => sum + e.amount, 0);

    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedCampaign(null)}
              className="flex items-center px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-all"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Campaigns
            </button>
            <h2 className="text-2xl font-bold text-slate-900">{selectedCampaign.name}</h2>
          </div>
          <button 
            onClick={() => setIsAddingExpense(true)}
            className="bg-pink-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-pink-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Expense
          </button>
        </div>

        <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 mb-8">
          <p className="text-sm text-slate-500 font-medium mb-1">Total Campaign Spend</p>
          <p className="text-3xl font-bold text-slate-900">${totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          {selectedCampaign.description && (
            <p className="mt-4 text-slate-700 text-sm">{selectedCampaign.description}</p>
          )}
        </div>

        <h3 className="text-lg font-bold text-slate-900 mb-4">Campaign Expenses</h3>
        {campaignExpenses.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
            <p className="text-slate-500">No expenses recorded for this campaign.</p>
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
                {campaignExpenses.map(exp => (
                  <tr key={exp.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="py-4 text-sm text-slate-600">{new Date(exp.date).toLocaleDateString()}</td>
                    <td className="py-4 text-sm font-medium text-slate-900">{exp.description}</td>
                    <td className="py-4 text-sm font-medium text-slate-900 text-right">${exp.amount.toFixed(2)}</td>
                    <td className="py-4 text-right">
                      <button 
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
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

        {isAddingExpense && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-slate-900 mb-4">Add Campaign Expense</h3>
              <form onSubmit={handleAddExpense} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <input
                    type="text"
                    required
                    value={expDesc}
                    onChange={(e) => setExpDesc(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    placeholder="e.g., Facebook Ads"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    placeholder="e.g., 500.00"
                  />
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsAddingExpense(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-pink-600 text-white rounded-lg font-medium hover:bg-pink-700"
                  >
                    Add Expense
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
          <Megaphone className="w-6 h-6 text-pink-500" />
          Marketing Campaigns
        </h2>
        <button 
          onClick={() => setIsAddingCampaign(true)}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
          <Megaphone className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No marketing campaigns added yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map(camp => {
            const campaignExpenses = expenses.filter(e => e.campaignId === camp.id);
            const totalSpent = campaignExpenses.reduce((sum, e) => sum + e.amount, 0);

            return (
              <div 
                key={camp.id} 
                onClick={() => setSelectedCampaign(camp)}
                className="border border-slate-200 rounded-xl p-5 hover:border-pink-400 hover:shadow-md transition-all cursor-pointer group relative"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg">{camp.name}</h3>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-pink-50 flex items-center justify-center text-pink-500 group-hover:scale-110 transition-transform">
                    <Megaphone className="w-5 h-5" />
                  </div>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-slate-600 mb-4">
                  <div className="flex items-center gap-1">
                    <DollarSign className="w-4 h-4 text-slate-400" />
                    <span className="font-medium">${totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <span className="text-pink-600 text-sm font-medium flex items-center gap-1">
                    Manage Expenses <ChevronRight className="w-4 h-4" />
                  </span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCampaign(camp.id);
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isAddingCampaign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Create Campaign</h3>
            <form onSubmit={handleAddCampaign} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Name</label>
                <input
                  type="text"
                  required
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  placeholder="e.g., Spring Harvest Promotion"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description (Optional)</label>
                <textarea
                  value={campaignDesc}
                  onChange={(e) => setCampaignDesc(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsAddingCampaign(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-pink-600 text-white rounded-lg font-medium hover:bg-pink-700"
                >
                  Create Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
