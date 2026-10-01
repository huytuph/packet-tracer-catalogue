#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
python3 "$ROOT/tools/init_database.py"
python3 "$ROOT/tools/export_browser_data.py"
python3 "$ROOT/tests/validate_catalogue.py"
python3 "$ROOT/tests/test_version_profiles.py"
python3 "$ROOT/tests/test_generated_data.py"
python3 "$ROOT/tests/validate_generated_data.py"
if command -v node >/dev/null 2>&1; then
  node --check "$ROOT/js/app.js"
  node --check "$ROOT/data/catalogue-data.js"
  node "$ROOT/tests/validate_runtime.js"
fi
printf '\nRebuild complete. Open %s/index.html\n' "$ROOT"
