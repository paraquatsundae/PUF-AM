import React from 'react';
import { FileText, Scale, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function TermsOfService() {
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
          <div className="bg-slate-900 p-8 text-white">
            <div className="flex items-center gap-3 mb-2">
              <Scale className="w-8 h-8 text-emerald-500" />
              <h1 className="text-3xl font-bold">Terms of Service</h1>
            </div>
            <p className="text-slate-400">Last Updated: July 15, 2026</p>
          </div>

          <div className="p-8 prose prose-slate max-w-none">
            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                1. Acceptance of Terms
              </h2>
              <p className="text-slate-600 leading-relaxed">
                By accessing or using Walnut Farm Manager, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the application.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">2. Description of Service</h2>
              <p className="text-slate-600 leading-relaxed">
                SentiNut (Walnut Farm Manager) provides paddock-first orchard tools: orchard mapping and field issues, a Farm Diary for plans and applications, mechanistic blight risk forecasting, water and nutrition logging, and harvest/drying records. The service is provided &quot;as is&quot; and &quot;as available.&quot;
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                3. Agricultural Disclaimer
              </h2>
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl text-amber-900 text-sm leading-relaxed">
                <strong>IMPORTANT:</strong> Blight risk charts, water budgets, and drying predictions are informational decision aids only. Farming decisions involve complex variables and inherent risks. We are not responsible for crop loss, financial loss, or any damages resulting from use of this application. Always verify with local agronomy advice and field inspection.
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">4. User Accounts</h2>
              <p className="text-slate-600 leading-relaxed">
                Access is via farm invite PIN and display name (and related admin-managed roles). You are responsible for keeping your PIN and session private and for activity under your farm membership.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">5. Data Ownership</h2>
              <p className="text-slate-600 leading-relaxed">
                You retain all rights to the farm data you input into the system. By using the service, you grant us a license to process this data to provide the requested services.
              </p>
            </section>

            <section className="mb-8 border-t border-slate-100 pt-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">6. Limitation of Liability</h2>
              <p className="text-slate-600">
                In no event shall Walnut Farm Manager be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
