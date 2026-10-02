(function (root, factory) {
  'use strict';
  const evidence = factory();
  if (typeof module === 'object' && module.exports) module.exports = evidence;
  else root.PT_COMMAND_VERIFICATION = evidence;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  // Only reviewed simulator executions belong here, never generator-test fixtures.
  const manifest = /* BEGIN COMMAND VERIFICATION JSON */
  {"schema_version": 1, "records": []}
  /* END COMMAND VERIFICATION JSON */;
  Object.freeze(manifest.records);
  return Object.freeze(manifest);
}));
