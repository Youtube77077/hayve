import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StorageAdapter } from '../backend/store';

/** AsyncStorage on iOS, localStorage on web (via the AsyncStorage web shim). */
export const deviceStorage: StorageAdapter = {
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  deleteItem: (k) => AsyncStorage.removeItem(k),
};
