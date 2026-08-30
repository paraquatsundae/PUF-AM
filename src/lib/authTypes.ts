import type { FarmModuleId } from '../../shared/auth/farmModules';
import type { FarmCropPacksMap } from '../../shared/farm/cropPacks';

export interface UserData {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: 'admin' | 'farmer' | 'viewer';
  farmId?: string | null;
  modules?: FarmModuleId[];
  authEpoch?: number;
  accessRevoked?: boolean;
  subscriptionTier: 'free' | 'premium';
  hasAgreedToTerms?: boolean;
  agreedToTermsAt?: string;
  createdAt: string;
}

export interface UserPublicData {
  uid: string;
  displayName?: string;
  photoURL?: string;
  role: 'admin' | 'farmer' | 'viewer';
  farmId: string;
}

export interface Farm {
  id: string;
  name: string;
  ownerUid: string;
  createdAt: string;
  enabledModules?: FarmModuleId[];
  cropPacks?: FarmCropPacksMap;
}
