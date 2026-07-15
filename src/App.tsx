/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { InvitationOverlay } from './components/InvitationOverlay';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';
import { PrivacyGate } from './components/PrivacyGate';
import { OfflineIndicator } from './components/OfflineIndicator';
import { WorkshopModeBanner } from './components/WorkshopModeBanner';
import { isWorkshopMode } from './lib/workshopMode';
import { AlertCircle, Loader2 } from 'lucide-react';

const BlightRisk = React.lazy(() => import('./pages/BlightRisk').then(m => ({ default: m.BlightRisk })));
const WaterMonitoring = React.lazy(() => import('./pages/WaterMonitoring').then(m => ({ default: m.WaterMonitoring })));
const FarmManagement = React.lazy(() => import('./pages/FarmManagement').then(m => ({ default: m.FarmManagement })));
const FarmDiary = React.lazy(() => import('./pages/FarmDiary').then(m => ({ default: m.FarmDiary })));
const Nutrition = React.lazy(() => import('./pages/Nutrition').then(m => ({ default: m.Nutrition })));
const Harvest = React.lazy(() => import('./pages/Harvest').then(m => ({ default: m.Harvest })));
const About = React.lazy(() => import('./pages/About').then(m => ({ default: m.About })));
const OrchardMap = React.lazy(() => import('./pages/OrchardMap').then(m => ({ default: m.OrchardMap })));
const Financials = React.lazy(() => import('./pages/Financials').then(m => ({ default: m.Financials })));
const Admin = React.lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })));
const Settings = React.lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const FarmSetup = React.lazy(() => import('./pages/FarmSetup').then(m => ({ default: m.FarmSetup })));

function RouteFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        <p className="text-slate-500 font-medium">Loading...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, userData, loading, error } = useAuth();

  if (isWorkshopMode()) {
    return <>{children}</>;
  }
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          <p className="text-slate-500 font-medium">Loading your orchard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8 text-rose-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Authentication Error</h2>
          <p className="text-slate-600 mb-8">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-slate-900 text-white py-3 px-4 rounded-xl font-medium hover:bg-slate-800 transition-all shadow-lg"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
  
  if (!user && !userData) {
    return <Navigate to="/login" replace />;
  }
  
  return <PrivacyGate>{children}</PrivacyGate>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <WorkshopModeBanner />
        <OfflineIndicator />
        <InvitationOverlay />
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/" element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route index element={<Dashboard />} />
                <Route path="blight" element={<BlightRisk />} />
                <Route path="water" element={<WaterMonitoring />} />
                <Route path="nutrition" element={<Nutrition />} />
                <Route path="farm-management" element={<FarmManagement />} />
                <Route path="diary" element={<FarmDiary />} />
                <Route path="harvest" element={<Harvest />} />
                <Route path="map" element={<OrchardMap />} />
                <Route path="field-ops" element={<Navigate to="/map" replace />} />
                <Route path="financials" element={<Financials />} />
                <Route path="farm-setup" element={<FarmSetup />} />
                <Route path="settings" element={<Settings />} />
                <Route path="about" element={<About />} />
                <Route path="admin" element={<Admin />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
