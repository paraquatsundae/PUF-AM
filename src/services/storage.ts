import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export const storageApi = {
  uploadFile: async (path: string, file: File | Blob): Promise<string> => {
    try {
      const storageRef = ref(storage, path);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading file to storage:', error);
      throw error;
    }
  },
  
  uploadFieldIssuePhoto: async (farmId: string, issueId: string, file: File | Blob): Promise<string> => {
    const path = `farms/${farmId}/issues/${issueId}/photo.jpg`;
    return storageApi.uploadFile(path, file);
  },
  
  uploadNutritionReport: async (farmId: string, reportId: string, file: File, extension: string): Promise<string> => {
    const path = `farms/${farmId}/nutrition_reports/${reportId}/report.${extension}`;
    return storageApi.uploadFile(path, file);
  }
};
