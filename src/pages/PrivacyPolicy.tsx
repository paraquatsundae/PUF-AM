import React from 'react';
import { Shield, Lock, Eye, FileText, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-emerald-600 p-8 text-white">
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-8 h-8" />
              <h1 className="text-3xl font-bold">Privacy Policy</h1>
            </div>
            <p className="text-emerald-50">Last Updated: July 15, 2026</p>
          </div>

          <div className="p-8 prose prose-slate max-w-none">
            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5 text-emerald-600" />
                1. Introduction
              </h2>
              <p className="text-slate-600 leading-relaxed">
                Walnut Farm Manager ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile and web applications.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                2. Information We Collect
              </h2>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-slate-800">Account Information</h3>
                  <p className="text-slate-600">When you join a farm with an invite PIN, we store a display name and session identity for that farm. Admin tooling may also associate Firebase Auth UIDs with roles.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Farm Data</h3>
                  <p className="text-slate-600">We store orchard data you enter: block boundaries, issue pins, Farm Diary events (sprays, irrigation, nutrition applications, work plans), harvest and drying records, and Farm setup values (dryers, water allocation, irrigation method).</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Location Data</h3>
                  <p className="text-slate-600">With your permission, we may use device location to centre the orchard map and choose nearby weather stations for blight and water context.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Photos</h3>
                  <p className="text-slate-600">If you attach photos to field issues, they are stored with your farm data for operational use and are not used for advertising.</p>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-600" />
                3. How We Use Your Information
              </h2>
              <ul className="list-disc pl-5 text-slate-600 space-y-2">
                <li>To provide and maintain our Service, including monitoring usage.</li>
                <li>To generate mechanistic blight risk forecasts based on your local climate.</li>
                <li>To manage your account and provide customer support.</li>
                <li>To comply with legal obligations.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">4. Data Storage and Security</h2>
              <p className="text-slate-600 leading-relaxed">
                Your data is stored securely using Google Cloud and Firebase infrastructure. We implement industry-standard security measures to protect your data from unauthorized access, alteration, or disclosure. However, no method of transmission over the internet is 100% secure.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">5. Third-Party Services</h2>
              <p className="text-slate-600 mb-4">We use the following third-party services:</p>
              <ul className="list-disc pl-5 text-slate-600 space-y-2">
                <li><strong>Firebase:</strong> For authentication and database hosting.</li>
                <li><strong>DPIRD / Open-Meteo:</strong> For weather data retrieval.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">6. Your Rights</h2>
              <p className="text-slate-600 leading-relaxed">
                You have the right to access, correct, or delete your personal data. You can manage your farm data directly within the app or contact us for account deletion requests.
              </p>
            </section>

            <section className="mb-8 border-t border-slate-100 pt-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">7. Contact Us</h2>
              <p className="text-slate-600">
                If you have any questions about this Privacy Policy, please contact us at:<br />
                <span className="font-semibold">georgecarmody@gmail.com</span>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
