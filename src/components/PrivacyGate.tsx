import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Lock, AlertCircle, CheckCircle2, ScrollText, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isWorkshopMode } from '../lib/workshopMode';

interface PrivacyGateProps {
  children: React.ReactNode;
}

export function PrivacyGate({ children }: PrivacyGateProps) {
  const { userData, agreeToTerms, logout, loading, error } = useAuth();
  const [hasReadToBottom, setHasReadToBottom] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (isWorkshopMode()) {
    return <>{children}</>;
  }

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 20) {
        setHasReadToBottom(true);
      }
    }
  };

  const handleAccept = async () => {
    if (!isAccepted || !hasReadToBottom) return;
    setIsSubmitting(true);
    try {
      await agreeToTerms();
    } catch (error) {
      console.error("Failed to accept terms:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // If there's an error, show it
  if (error) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Issue</h2>
          <p className="text-slate-600 mb-8">{error}</p>
          <button
            onClick={() => logout()}
            className="w-full py-3 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
          >
            Sign Out & Try Again
          </button>
        </div>
      </div>
    );
  }

  // If user data is loading, show a loading state
  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-500 font-medium tracking-wide">Loading your profile...</p>
        </div>
      </div>
    );
  }

  // If we have a user but no data yet, wait for it
  if (!userData) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-500 font-medium tracking-wide">Initializing your account...</p>
        </div>
      </div>
    );
  }

  if (userData.hasAgreedToTerms) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Proprietary Access & Privacy</h2>
            <p className="text-sm text-slate-500 font-medium">Omega Walnuts Management System</p>
          </div>
        </div>

        {/* Content */}
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-8 space-y-6 text-slate-600 leading-relaxed"
        >
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-indigo-500" />
              Privacy Statement & Confidentiality Agreement
            </h3>
            <p className="text-sm italic text-slate-500">Last Updated: March 17, 2026</p>
            
            <p>
              This Privacy Statement and Confidentiality Agreement ("Agreement") governs your access to and use of the 
              proprietary agricultural management systems, data, and intellectual property of <strong>Omega Walnuts</strong>.
            </p>
          </section>

          <div className="space-y-4 text-sm">
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-amber-800 font-medium">
                Access to this system is restricted to authorized personnel only. All data contained herein is 
                strictly confidential and proprietary to Omega Walnuts.
              </p>
            </div>

            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs">1. Collection of Information (APP 5)</h4>
            <p>
              Omega Walnuts collects personal information necessary for the operation and security of this system, 
              including your name, email address, IP address, and system interaction logs. This information is 
              collected to ensure authorized access and to maintain the integrity of our proprietary models.
            </p>

            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs">2. Use and Disclosure (APP 6)</h4>
            <p>
              Your personal information will be used solely for the purposes of managing your access to the system 
              and improving our agricultural operations. We do not disclose your information to third parties 
              unless required by Australian law or with your explicit consent.
            </p>

            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs">3. Confidentiality of Proprietary Data</h4>
            <p>
              By accessing this system, you acknowledge that the <strong>Blight Risk Models</strong>, <strong>Orchard Layouts</strong>, 
              <strong>Harvest Analytics</strong>, and <strong>Infrastructure Maps</strong> are the exclusive intellectual 
              property of Omega Walnuts. You agree to:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Maintain strict confidentiality of all data and models.</li>
              <li>Not take screenshots, recordings, or exports of data for use outside of authorized Omega Walnuts operations.</li>
              <li>Not share your access credentials with any other individual.</li>
              <li>Report any suspected security breaches or unauthorized access immediately.</li>
            </ul>

            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs">4. Data Security (APP 11)</h4>
            <p>
              We take reasonable steps to protect the personal and proprietary information held within this system 
              from misuse, interference, loss, and unauthorized access. This includes encryption, secure servers, 
              and strict whitelist-based access control.
            </p>

            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs">5. Access and Correction (APP 12 & 13)</h4>
            <p>
              You have the right to request access to the personal information we hold about you and to request 
              corrections if that information is inaccurate. Please contact the System Administrator for such requests.
            </p>

            <div className="pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400 italic">
                By clicking "Accept and Enter System", you confirm that you have read, understood, and agree to be 
                bound by these terms under the laws of Australia.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 space-y-4">
          {!hasReadToBottom && (
            <div className="flex items-center justify-center gap-2 text-indigo-600 text-xs font-bold animate-pulse">
              <ScrollText className="w-4 h-4" />
              Please scroll to the bottom to review all terms
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => logout()}
              className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 transition-all"
            >
              Decline & Logout
            </button>
            
            <div className="flex-[2] flex items-center gap-3">
              <label className={`flex-1 flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                isAccepted ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'
              }`}>
                <input 
                  type="checkbox"
                  disabled={!hasReadToBottom}
                  checked={isAccepted}
                  onChange={(e) => setIsAccepted(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                />
                <span className={`text-sm font-bold ${!hasReadToBottom ? 'text-slate-300' : 'text-slate-700'}`}>
                  I Agree to the Terms
                </span>
              </label>

              <button
                disabled={!isAccepted || isSubmitting}
                onClick={handleAccept}
                className={`flex-1 px-6 py-3 font-bold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 ${
                  isAccepted && !isSubmitting
                    ? 'bg-indigo-600 text-white shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-0.5'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                }`}
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Enter System
                    <CheckCircle2 className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
