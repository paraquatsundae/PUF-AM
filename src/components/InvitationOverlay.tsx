import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Mail, CheckCircle2, XCircle, Loader2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function InvitationOverlay() {
  const [isProcessing, setIsProcessing] = useState(false);
  const { pendingInvite, acceptInvite, declineInvite } = useAuth();

  if (!pendingInvite) return null;

  const handleAccept = async () => {
    setIsProcessing(true);
    try {
      await acceptInvite();
    } catch (error) {
      console.error("Failed to accept invite:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecline = async () => {
    setIsProcessing(true);
    try {
      await declineInvite();
    } catch (error) {
      console.error("Failed to decline invite:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      >
        <motion.div 
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
        >
          <div className="bg-blue-600 p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-32 h-32 bg-blue-400/20 rounded-full blur-2xl" />
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="bg-white/20 p-4 rounded-2xl mb-4 backdrop-blur-md border border-white/20">
                <Mail className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Farm Invitation</h2>
              <p className="text-blue-100 text-sm">You've been invited to join a farm organization.</p>
            </div>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <div className="flex items-start gap-4">
                <div className="bg-blue-100 p-2 rounded-lg mt-1">
                  <Info className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Organization Details</p>
                  <p className="text-sm font-bold text-slate-900 mb-1">Farm ID: <span className="font-mono text-blue-600">{pendingInvite.farmId}</span></p>
                  <p className="text-sm text-slate-600">Role: <span className="font-bold text-slate-900 capitalize">{pendingInvite.role}</span></p>
                  <p className="text-xs text-slate-500 mt-2 italic">Invited by: {pendingInvite.invitedBy}</p>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col gap-3">
              <button
                onClick={handleAccept}
                disabled={isProcessing}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl font-bold transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 active:scale-95"
              >
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                Accept Invitation
              </button>
              
              <button
                onClick={handleDecline}
                disabled={isProcessing}
                className="w-full py-4 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-600 border border-slate-200 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <XCircle className="w-5 h-5" />}
                Decline
              </button>
            </div>
            
            <p className="text-center text-[10px] text-slate-400 leading-relaxed">
              Accepting this invitation will move your account to the new farm organization. Your existing personal farm data will remain in your original farm ID.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
