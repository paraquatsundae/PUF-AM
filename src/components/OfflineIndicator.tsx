import React from 'react';
import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { motion, AnimatePresence } from 'motion/react';

export function OfflineIndicator() {
  const isOnline = useNetworkStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-amber-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 font-medium text-sm"
        >
          <WifiOff className="w-4 h-4" />
          <span>Offline — paddocks & map stay on this device; sync when back online.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
