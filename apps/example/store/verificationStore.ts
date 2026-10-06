import { create } from 'zustand';

interface VerificationState {
  verificationId: string | null;
  token: string | null;
  frontDocument: string | null;
  backDocument: string | null;
  selfieImage: string | null;
  step: 'token' | 'front' | 'back' | 'selfie' | 'complete';
  /** The project's flow asks for the liveness challenge instead of a plain selfie. */
  livenessRequired: boolean;
  
  setLivenessRequired: (required: boolean) => void;
  setVerificationId: (id: string) => void;
  setToken: (token: string) => void;
  setFrontDocument: (data: string | null) => void;
  setBackDocument: (data: string | null) => void;
  setSelfieImage: (data: string | null) => void;
  setStep: (step: 'token' | 'front' | 'back' | 'selfie' | 'complete') => void;
  reset: () => void;
}

export const useVerificationStore = create<VerificationState>((set) => ({
  verificationId: null,
  token: null,
  frontDocument: null,
  backDocument: null,
  selfieImage: null,
  step: 'token',
  livenessRequired: false,
  
  setLivenessRequired: (required) => set({ livenessRequired: required }),
  setVerificationId: (id) => set({ verificationId: id }),
  setToken: (token) => set({ token }),
  setFrontDocument: (data) => set({ frontDocument: data }),
  setBackDocument: (data) => set({ backDocument: data }),
  setSelfieImage: (data) => set({ selfieImage: data }),
  setStep: (step) => set({ step }),
  reset: () => set({
    verificationId: null,
    token: null,
    frontDocument: null,
    backDocument: null,
    selfieImage: null,
    step: 'token',
    livenessRequired: false,
  }),
}));
