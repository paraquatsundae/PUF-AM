import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { FlaskConical, Plus, Trash2, ChevronRight, DollarSign, ArrowLeft } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface RDProject {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
}

interface RDExpense {
  id: string;
  projectId: string;
  date: string;
  description: string;
  amount: number;
  updatedAt: string;
}

export function RDManager() {
  const { userData } = useAuth();
  const [projects, setProjects] = useState<RDProject[]>([]);
  const [expenses, setExpenses] = useState<RDExpense[]>([]);
  const [selectedProject, setSelectedProject] = useState<RDProject | null>(null);
  
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');

  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');

  useEffect(() => {
    if (!userData?.farmId) return;
    
    const qProj = query(collection(db, `farms/${userData.farmId}/rd_projects`));
    const unsubProj = onSnapshot(qProj, (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RDProject)));
    });

    const qExp = query(collection(db, `farms/${userData.farmId}/rd_expenses`));
    const unsubExp = onSnapshot(qExp, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RDExpense)));
    });

    return () => { unsubProj(); unsubExp(); };
  }, [userData?.farmId]);

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.farmId) return;
    const newProj: RDProject = {
      id: uuidv4(),
      name: projectName,
      description: projectDesc,
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, `farms/${userData.farmId}/rd_projects`, newProj.id), newProj);
    setIsAddingProject(false);
    setProjectName('');
    setProjectDesc('');
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.farmId || !selectedProject) return;
    const newExp: RDExpense = {
      id: uuidv4(),
      projectId: selectedProject.id,
      date: expDate,
      description: expDesc,
      amount: parseFloat(expAmount),
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, `farms/${userData.farmId}/rd_expenses`, newExp.id), newExp);
    setIsAddingExpense(false);
    setExpDesc('');
    setExpAmount('');
  };

  const handleDeleteProject = async (id: string) => {
    if (!userData?.farmId) return;
    if (window.confirm('Are you sure you want to delete this project and all its expenses?')) {
      await deleteDoc(doc(db, `farms/${userData.farmId}/rd_projects`, id));
      const projectExpenses = expenses.filter(e => e.projectId === id);
      for (const exp of projectExpenses) {
        await deleteDoc(doc(db, `farms/${userData.farmId}/rd_expenses`, exp.id));
      }
      if (selectedProject?.id === id) setSelectedProject(null);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!userData?.farmId) return;
    if (window.confirm('Are you sure you want to delete this expense?')) {
      await deleteDoc(doc(db, `farms/${userData.farmId}/rd_expenses`, id));
    }
  };

  if (selectedProject) {
    const projectExpenses = expenses.filter(e => e.projectId === selectedProject.id).sort((a, b) => b.date.localeCompare(a.date));
    const totalSpent = projectExpenses.reduce((sum, e) => sum + e.amount, 0);

    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedProject(null)}
              className="flex items-center px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-all"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Projects
            </button>
            <h2 className="text-2xl font-bold text-slate-900">{selectedProject.name}</h2>
          </div>
          <button 
            onClick={() => setIsAddingExpense(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Expense
          </button>
        </div>

        <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 mb-8">
          <p className="text-sm text-slate-500 font-medium mb-1">Total Project Spend</p>
          <p className="text-3xl font-bold text-slate-900">${totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          {selectedProject.description && (
            <p className="mt-4 text-slate-700 text-sm">{selectedProject.description}</p>
          )}
        </div>

        <h3 className="text-lg font-bold text-slate-900 mb-4">Project Expenses</h3>
        {projectExpenses.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
            <p className="text-slate-500">No expenses recorded for this project.</p>
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
                {projectExpenses.map(exp => (
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
              <h3 className="text-xl font-bold text-slate-900 mb-4">Add Project Expense</h3>
              <form onSubmit={handleAddExpense} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <input
                    type="text"
                    required
                    value={expDesc}
                    onChange={(e) => setExpDesc(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="e.g., Soil testing kit"
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
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="e.g., 250.00"
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
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700"
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
          <FlaskConical className="w-6 h-6 text-purple-600" />
          R&D Projects
        </h2>
        <button 
          onClick={() => setIsAddingProject(true)}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
          <FlaskConical className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No R&D projects added yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(proj => {
            const projectExpenses = expenses.filter(e => e.projectId === proj.id);
            const totalSpent = projectExpenses.reduce((sum, e) => sum + e.amount, 0);

            return (
              <div 
                key={proj.id} 
                onClick={() => setSelectedProject(proj)}
                className="border border-slate-200 rounded-xl p-5 hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group relative"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg">{proj.name}</h3>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                    <FlaskConical className="w-5 h-5" />
                  </div>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-slate-600 mb-4">
                  <div className="flex items-center gap-1">
                    <DollarSign className="w-4 h-4 text-slate-400" />
                    <span className="font-medium">${totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <span className="text-purple-600 text-sm font-medium flex items-center gap-1">
                    Manage Expenses <ChevronRight className="w-4 h-4" />
                  </span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProject(proj.id);
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

      {isAddingProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Create R&D Project</h3>
            <form onSubmit={handleAddProject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="e.g., Soil Carbon Trial"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description (Optional)</label>
                <textarea
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsAddingProject(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
