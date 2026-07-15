import * as fmin from 'fmin';

export interface OptimizationParams {
  aMax: number;        // Maximum biological yield potential (kg NIS/ha)
  bN: number;          // Background Nitrogen (kg/ha)
  bP: number;          // Background Phosphorus (kg/ha)
  bK: number;          // Background Potassium (kg/ha)
  cN: number;          // Nitrogen efficiency
  cP: number;          // Phosphorus efficiency
  cK: number;          // Potassium efficiency
  priceNIS: number;    // Farm gate price for Nut-In-Shell (AUD/kg)
  priceN: number;      // Elemental cost of N (AUD/kg)
  priceP: number;      // Elemental cost of P (AUD/kg)
  priceK: number;      // Elemental cost of K (AUD/kg)
  ureaPrice: number;   // $/t
  mapPrice: number;    // $/t
  mopPrice: number;    // $/t
  fixedCosts: number;  // Fixed costs (AUD/ha)
  
  // Dynamic Factors
  soilPh?: number;
  soilOM?: number;      // Organic Matter %
  clayContent?: number; // %
  rainfall?: number;    // mm
  irrigation?: number;  // mm
  treeAge?: number;     // years
  density?: number;     // trees/ha
  hullManagement?: 'mulched' | 'removed';
  variety?: string;
  leafN?: number;       // % from leaf analysis
  leafP?: number;       // % from leaf analysis
  leafK?: number;       // % from leaf analysis
  leafZn?: number;      // ppm from leaf analysis
  leafB?: number;       // ppm from leaf analysis
  soilMg?: number;      // Magnesium level (ppm or kg/ha)
  mlResidual?: number;  // ML-predicted yield residual (kg/ha)
  ambientTemp?: number; // Current ambient temperature
}

export interface OptimizationResult {
  optN: number;
  optP: number;
  optK: number;
  yieldAtOptimum: number;
  maxProfit: number;
  revenue: number;
  fertCost: number;
  replacementN: number;
  replacementP: number;
  replacementK: number;
  alerts: NutritionalAlert[];
}

export interface NutritionalAlert {
  type: 'critical' | 'warning' | 'info';
  nutrient: string;
  message: string;
  action: string;
}

export const CRITICAL_VALUES = {
  leaf: {
    N: { min: 2.2, max: 3.2 },
    K: { min: 1.2, max: Infinity },
    P: { min: 0.1, max: Infinity },
    Zn: { min: 18, max: Infinity },
    B: { min: 36, max: 300 }
  },
  removal_rates: {
    N_per_tonne: { mulched: 13, removed: 20 },
    K_per_tonne: { mulched: 7.6, removed: 20 },
    P_per_tonne: 4.3
  }
};

export const nutritionEngine = {
  // Dynamic Tree Functions
  calcLockupN(age: number): number {
    return Math.min(17, 1.7 * age);
  },

  calcMaintenanceN(age: number): number {
    if (age === 1) return 0.10;
    if (age <= 3) return 0.30;
    return 0.40;
  },

  getPhAvailability(nutrient: 'N' | 'P' | 'Zn', ph: number): number {
    if (nutrient === 'P') {
      if (ph < 6.0) return 0.40;
      if (ph > 7.5) return 0.50;
      return 1.00;
    }
    if (nutrient === 'Zn') {
      if (ph > 7.0) return 0.30;
      return 1.00;
    }
    if (nutrient === 'N') {
      if (ph < 6.0) return 0.80;
      return 1.00;
    }
    return 1.00;
  },

  // Default parameters
  getDefaultParams(): OptimizationParams {
    return {
      aMax: 5000,
      bN: 25,
      bP: 40,
      bK: 120,
      cN: 0.012,
      cP: 0.035,
      cK: 0.008,
      priceNIS: 3.30,
      ureaPrice: 650,
      mapPrice: 950,
      mopPrice: 750,
      priceN: 650 / (1000 * 0.46), // Urea 46% N
      priceP: 950 / (1000 * 0.22), // MAP 22% P
      priceK: 750 / (1000 * 0.50), // MOP 50% K
      fixedCosts: 4500,
      density: 250,
      treeAge: 10,
      hullManagement: 'removed'
    };
  },

  // Calculate Yield based on N, P, K applied
  calcYield(N: number, P: number, K: number, params: OptimizationParams): number {
    // 1. Dynamic Efficiency Adjustments
    let cN = params.cN;
    let cP = params.cP;
    let cK = params.cK;

    // pH adjustment for P efficiency (P is most available at pH 6.5)
    if (params.soilPh) {
      cP = params.cP * this.getPhAvailability('P', params.soilPh);
      cN = params.cN * this.getPhAvailability('N', params.soilPh);
    }

    // Organic Matter adjustment for N efficiency
    if (params.soilOM) {
      cN = cN * (1 + (params.soilOM - 2) * 0.05);
    }

    // Clay content adjustment for K efficiency (higher clay = higher fixation/lower efficiency)
    if (params.clayContent) {
      cK = params.cK * (1 - (params.clayContent / 100) * 0.3);
    }

    // 2. Background Nutrient Adjustments (Environmental)
    let bN = params.bN;
    
    // Leaching model for Nitrogen
    if (params.rainfall || params.irrigation) {
      const totalWater = (params.rainfall || 0) + (params.irrigation || 0);
      if (totalWater > 200) {
        const leachingFactor = Math.max(0, 1 - ((totalWater - 200) / 100) * 0.1);
        bN = params.bN * leachingFactor;
      }
    }

    // 3. Leaf Analysis Feedback (Bayesian-lite adjustment)
    if (params.leafN !== undefined) {
      const targetLeafN = 2.5; // Optimal for walnuts
      const leafRatio = params.leafN / targetLeafN;
      if (leafRatio < 0.9) bN *= leafRatio;
    }

    // 4. Nutrient Interactions (K-Mg Antagonism)
    if (params.soilMg && params.bK) {
      const kMgRatio = (params.bK + K) / params.soilMg;
      if (kMgRatio < 0.2) {
        cK *= 0.8;
      }
    }

    // 5. Tree Age Adjustment for aMax
    let aMax = params.aMax;
    if (params.treeAge) {
      const ageFactor = Math.min(1, params.treeAge / 15);
      aMax = params.aMax * ageFactor;
    }

    // 6. Mass Flow Halt (Ambient Temp)
    if (params.ambientTemp && params.ambientTemp > 38) {
      // Stomata closed, transpiration stream halted. 
      // Efficiency drops significantly as mass flow is suppressed.
      cN *= 0.1;
      cK *= 0.1;
    }

    const yieldVal = aMax *
      (1 - Math.exp(-cN * (bN + N))) *
      (1 - Math.exp(-cP * (params.bP + P))) *
      (1 - Math.exp(-cK * (params.bK + K)));
    
    // 7. ML Hybrid Residual Adjustment
    const finalYield = yieldVal + (params.mlResidual || 0);
    
    return Math.max(0, finalYield);
  },

  // Calculate Profit
  calcProfit(N: number, P: number, K: number, params: OptimizationParams): number {
    const yieldVal = this.calcYield(N, P, K, params);
    const revenue = yieldVal * params.priceNIS;
    const fertCost = (N * params.priceN) + (P * params.priceP) + (K * params.priceK);
    return revenue - fertCost - params.fixedCosts;
  },

  // Calculate Replacement Requirements (Scientific Budgeter)
  calculateReplacement(yieldTons: number, params: OptimizationParams) {
    const age = params.treeAge || 10;
    const density = params.density || 250;
    const hullMgmt = params.hullManagement || 'removed';
    
    const nRate = CRITICAL_VALUES.removal_rates.N_per_tonne[hullMgmt];
    const kRate = CRITICAL_VALUES.removal_rates.K_per_tonne[hullMgmt];
    const pRate = CRITICAL_VALUES.removal_rates.P_per_tonne;
    
    const nMaint = density * this.calcMaintenanceN(age);
    const nLockup = this.calcLockupN(age);
    
    // Replacement = (Maint + Export + Lockup) / Efficiency
    const replacementN = (nMaint + (yieldTons * nRate) + nLockup) / 0.7;
    const replacementK = (yieldTons * kRate) / 0.7;
    const replacementP = (yieldTons * pRate) / 0.7;
    
    return {
      replacementN,
      replacementP,
      replacementK
    };
  },

  // Optimize N, P, K rates to maximize profit
  optimize(params: OptimizationParams): OptimizationResult {
    const objective = (input: number[]) => {
      const [N, P, K] = input;
      let penalty = 0;
      if (N < 0) penalty += Math.abs(N) * 10000;
      if (P < 0) penalty += Math.abs(P) * 10000;
      if (K < 0) penalty += Math.abs(K) * 10000;
      
      if (N > 400) penalty += (N - 400) * 10000;
      if (P > 100) penalty += (P - 100) * 10000;
      if (K > 300) penalty += (K - 300) * 10000;

      return -this.calcProfit(N, P, K, params) + penalty;
    };

    const initialGuess = [150, 20, 100];
    const solution = fmin.nelderMead(objective, initialGuess);
    
    const [optN, optP, optK] = solution.x.map(v => Math.max(0, v));
    const yieldAtOptimum = this.calcYield(optN, optP, optK, params);
    const maxProfit = this.calcProfit(optN, optP, optK, params);
    const revenue = yieldAtOptimum * params.priceNIS;
    const fertCost = (optN * params.priceN) + (optP * params.priceP) + (optK * params.priceK);

    const replacement = this.calculateReplacement(yieldAtOptimum / 1000, params);
    const alerts = this.diagnoseOrchard(params);

    return {
      optN,
      optP,
      optK,
      yieldAtOptimum,
      maxProfit,
      revenue,
      fertCost,
      ...replacement,
      alerts
    };
  },

  // Diagnostic Engine (Nutritional Alert Matrix)
  diagnoseOrchard(params: OptimizationParams): NutritionalAlert[] {
    const alerts: NutritionalAlert[] = [];
    const { leafN, leafP, leafK, leafZn, leafB, soilPh, ambientTemp, soilMg, bK } = params;

    // 1. Critical Deficiencies (Leaf Tissue)
    if (leafN !== undefined && leafN < CRITICAL_VALUES.leaf.N.min) {
      alerts.push({
        type: 'critical',
        nutrient: 'Nitrogen',
        message: `Leaf N (${leafN}%) is below critical threshold (${CRITICAL_VALUES.leaf.N.min}%).`,
        action: 'Immediate N application required. Check for root health or waterlogging.'
      });
    }

    if (leafZn !== undefined && leafZn < CRITICAL_VALUES.leaf.Zn.min) {
      alerts.push({
        type: 'critical',
        nutrient: 'Zinc',
        message: `Leaf Zn (${leafZn} ppm) is critically low.`,
        action: 'Apply foliar Zinc Sulfate or chelate immediately. Essential for shoot elongation.'
      });
    }

    // 2. Synergy & Antagonism
    if (leafZn !== undefined && leafB !== undefined) {
      if (leafZn < 25 && leafB < 40) {
        alerts.push({
          type: 'warning',
          nutrient: 'Zn-B Synergy',
          message: 'Low Zn and B levels detected simultaneously.',
          action: 'Co-apply Zn and B foliar. This synergy is critical for pollen tube growth and fruit set.'
        });
      }
    }

    if (soilMg !== undefined && bK !== undefined) {
      const kMgRatio = bK / soilMg;
      if (kMgRatio > 0.5) {
        alerts.push({
          type: 'warning',
          nutrient: 'K-Mg Antagonism',
          message: `High K:Mg ratio (${kMgRatio.toFixed(2)}) detected.`,
          action: 'Monitor for Magnesium deficiency. High Potassium is suppressing Magnesium uptake.'
        });
      }
    }

    // 3. Environmental Triggers
    if (ambientTemp !== undefined && ambientTemp > 38) {
      alerts.push({
        type: 'warning',
        nutrient: 'Environmental',
        message: `Extreme heat (${ambientTemp}°C) detected.`,
        action: 'Mass flow halt likely. Suspend soil-applied fertigation; focus on maintaining tree hydration.'
      });
    }

    if (soilPh !== undefined) {
      if (soilPh > 7.5) {
        alerts.push({
          type: 'info',
          nutrient: 'pH Lockup',
          message: `Alkaline soil (pH ${soilPh}) detected.`,
          action: 'P and Zn availability suppressed. Prefer foliar Zn and acidic P sources (e.g., Phosphoric Acid).'
        });
      } else if (soilPh < 5.5) {
        alerts.push({
          type: 'info',
          nutrient: 'pH Lockup',
          message: `Acidic soil (pH ${soilPh}) detected.`,
          action: 'N and P availability suppressed. Consider lime application to reach pH 6.5.'
        });
      }
    }

    // 4. Hidden Hunger (Sub-clinical)
    if (leafN !== undefined && leafN >= CRITICAL_VALUES.leaf.N.min && leafN < 2.5) {
      alerts.push({
        type: 'info',
        nutrient: 'Nitrogen',
        message: 'Leaf N is in the "Hidden Hunger" zone (sub-clinical deficiency).',
        action: 'Slightly increase N rates to reach the 2.5-2.7% optimal window.'
      });
    }

    return alerts;
  }
};

