import AsyncStorage from '@react-native-async-storage/async-storage';
import type {OfflineCapableStorage} from './storage.interface';

export const asyncStorageAdapter: OfflineCapableStorage = {
  kind: 'async-storage',
  getItem: key => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: key => AsyncStorage.removeItem(key),
};