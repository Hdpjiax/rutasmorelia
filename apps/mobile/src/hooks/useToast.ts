import {useCallback, useEffect, useState} from 'react';

export type ToastKind = 'info' | 'success' | 'error';

export type SetMessageFn = (msg: string, kind?: ToastKind) => void;

const DURATION_BY_KIND: Record<ToastKind, number> = {
  info: 3200,
  success: 2600,
  error: 4600,
};

export function useToast() {
  const [message, setMessageState] = useState('');
  const [toastKind, setToastKind] = useState<ToastKind>('info');

  const setMessage: SetMessageFn = useCallback((msg, kind = 'info') => {
    setMessageState(msg);
    setToastKind(msg ? kind : 'info');
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      setMessageState('');
      setToastKind('info');
    }, DURATION_BY_KIND[toastKind]);
    return () => clearTimeout(timer);
  }, [message, toastKind]);

  return {message, toastKind, setMessage};
}