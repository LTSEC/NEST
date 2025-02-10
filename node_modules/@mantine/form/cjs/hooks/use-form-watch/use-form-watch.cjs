'use client';
'use strict';

var react = require('react');
var getPath = require('../../paths/get-path.cjs');
require('klona/full');

function useFormWatch({
  $status
}) {
  const subscribers = react.useRef(
    {}
  );
  const watch = react.useCallback((path, callback) => {
    react.useEffect(() => {
      subscribers.current[path] = subscribers.current[path] || [];
      subscribers.current[path].push(callback);
      return () => {
        subscribers.current[path] = subscribers.current[path].filter((cb) => cb !== callback);
      };
    }, [callback]);
  }, []);
  const getFieldSubscribers = react.useCallback((path) => {
    if (!subscribers.current[path]) {
      return [];
    }
    return subscribers.current[path].map(
      (callback) => (input) => callback({
        previousValue: getPath.getPath(path, input.previousValues),
        value: getPath.getPath(path, input.updatedValues),
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

exports.useFormWatch = useFormWatch;
//# sourceMappingURL=use-form-watch.cjs.map
