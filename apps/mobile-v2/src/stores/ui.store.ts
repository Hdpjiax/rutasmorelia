import {create} from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';

type UiState = {
  message: string | null;
  toastKind: ToastKind;
  routeGeometryLoading: boolean;
  sheetSnapIndex: number;
  setMessage: (message: string | null, kind?: ToastKind) => void;
  setRouteGeometryLoading: (loading: boolean) => void;
  setSheetSnapIndex: (index: number) => void;
};

export const useUiStore = create<UiState>(set => ({
  message: null,
  toastKind: 'info',
  routeGeometryLoading: false,
  sheetSnapIndex: 0,
  setMessage: (message, toastKind = 'info') => set({message, toastKind}),
  setRouteGeometryLoading: routeGeometryLoading => set({routeGeometryLoading}),
  setSheetSnapIndex: sheetSnapIndex => set({sheetSnapIndex}),
}));