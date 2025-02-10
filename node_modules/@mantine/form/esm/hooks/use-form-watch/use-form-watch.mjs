'use client';
import { useRef, useCallback, useEffect } from 'react';
import { getPath } from '../../paths/get-path.mjs';
import 'klona/full';

function useFormWatch({
  $status
}) {
  const subscribers = useRef(
    {}
  );
  const watch = useCallback((path, callback) => {
    useEffect(() => {
      subscribers.current[path] = subscribers.current[path] || [];
      subscribers.current[path].push(callback);
      return () => {
        subscribers.current[path] = subscribers.current[path].filter((cb) => cb !== callback);
      };
    }, [callback]);
  }, []);
  const getFieldSubscribers = useCallback((path) => {
    if (!subscribers.current[path]) {
      return [];
    }
    return subscribers.current[path].map(
      (callback) => (input) => callback({
        previousValue: getPath(path, input.previousValues),
        value: getPath(path, input.updatedValues),
        touched: $status.isTouched(path),
        dirty: $status.isDirty(path)
      })
    );
  }, []);
  return {
    subscribers,
    watch,
    getFieldSubscribers
  };
}

export { useFormWatch };
//# sourceMappingURL=use-form-watch.mjs.map
