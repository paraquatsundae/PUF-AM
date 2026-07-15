import { db, auth } from "../firebase";
import { WALNUT_AGRONOMIC_IDEALS } from "../constants";
import { trackMetric } from "./metricsService";
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, doc, setDoc, getDoc } from "firebase/firestore";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface NutritionReport {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: 'xlsx' | 'csv' | 'image' | 'manual';
  reportType: 'soil' | 'leaf' | 'water';
  sampleDate: string;
  labName?: string;
  blockId?: string;
  status: 'pending' | 'parsed' | 'error';
  createdAt: any;
  createdBy: string;
}

export interface NutrientData {
  reportId: string;
  nutrients: Record<string, {
    value: number;
    unit: string;
    status: string;
    optimalRange: string;
  }>;
}

const cleanObject = (obj: any) => {
  const newObj = { ...obj };
  Object.keys(newObj).forEach(key => {
    if (newObj[key] === undefined) {
      delete newObj[key];
    }
  });
  return newObj;
};

export const nutritionService = {
  async saveReport(farmId: string, report: Omit<NutritionReport, 'createdAt'>) {
    const reportsRef = collection(db, 'farms', farmId, 'nutrition_reports');
    const docRef = report.id ? doc(reportsRef, report.id) : doc(reportsRef);
    const id = docRef.id;
    
    try {
      // Track write
      trackMetric('write').catch(console.error);
      await setDoc(docRef, cleanObject({
        ...report,
        id,
        createdAt: new Date().toISOString(),
      }));
      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/nutrition_reports/${id}`);
      throw error;
    }
  },

  async getReports(farmId: string) {
    const reportsRef = collection(db, 'farms', farmId, 'nutrition_reports');
    const q = query(reportsRef, orderBy('sampleDate', 'desc'));
    try {
      // Track read
      trackMetric('read').catch(console.error);
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NutritionReport));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `farms/${farmId}/nutrition_reports`);
      throw error;
    }
  },

  async saveNutrientData(farmId: string, reportId: string, data: Omit<NutrientData, 'reportId'>) {
    const dataRef = doc(db, 'farms', farmId, 'nutrition_data', reportId);
    try {
      // Track write
      trackMetric('write').catch(console.error);
      await setDoc(dataRef, cleanObject({
        reportId,
        ...data
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/nutrition_data/${reportId}`);
      throw error;
    }
  },

  async getNutrientData(farmId: string, reportId: string) {
    const dataRef = doc(db, 'farms', farmId, 'nutrition_data', reportId);
    try {
      // Track read
      trackMetric('read').catch(console.error);
      const snapshot = await getDoc(dataRef);
      if (!snapshot.exists()) return null;
      return snapshot.data() as NutrientData;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `farms/${farmId}/nutrition_data/${reportId}`);
      throw error;
    }
  },

  async deleteReport(farmId: string, reportId: string) {
    const reportRef = doc(db, 'farms', farmId, 'nutrition_reports', reportId);
    const dataRef = doc(db, 'farms', farmId, 'nutrition_data', reportId);
    
    try {
      // Track writes (deletes count as writes for metrics)
      trackMetric('write', 2).catch(console.error);
      // Hard delete both the report and its associated nutrient data
      const { deleteDoc } = await import("firebase/firestore");
      await Promise.all([
        deleteDoc(reportRef),
        deleteDoc(dataRef)
      ]);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `farms/${farmId}/nutrition_reports/${reportId}`);
      throw error;
    }
  }
};
