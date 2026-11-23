#!/bin/bash
# Browser tests. Needs: Node 22+, Python 3 + `pip install playwright` + `playwright install chromium`.
# Each suite gets a fresh harness server (real Worker code on SQLite + in-memory R2) and an empty database.
#   bash tests/e2e/run.sh                # all suites
#   bash tests/e2e/run.sh public1.py     # one suite
cd "$(dirname "$0")/../.."
SUITES=${@:-"public1.py admin1.py misc1.py"}
RC=0
for t in $SUITES; do
  pkill -f e2e-server.mjs 2>/dev/null; sleep 0.5
  node --experimental-sqlite worker/test/e2e-server.mjs > /tmp/gv-e2e.log 2>&1 &
  SP=$!
  for i in $(seq 1 40); do curl -s localhost:8788/v1/health >/dev/null 2>&1 && break; sleep 0.25; done
  echo "=== $t"; python3 "tests/e2e/$t" || RC=1
  kill $SP 2>/dev/null; wait $SP 2>/dev/null
done
exit $RC
