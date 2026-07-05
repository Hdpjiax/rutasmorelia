import {useCallback, useEffect, useState} from 'react';

export function useToast(durationMs = 3800) {
  const [message, setMessageState] = useState('');
  const setMessage = useCallback((msg: string) => setMessageState(msg), []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessageState(''), durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs]);

  return {message, setMessage};
}