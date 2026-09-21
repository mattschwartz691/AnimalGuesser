#!/usr/bin/env bash
# Run every suite. Each is a plain node script; non-zero means something broke.
cd "$(dirname "$0")"
fail=0
for t in *_test.js; do
  printf "  %-18s " "${t%.js}"
  if node "$t" >/tmp/tout 2>&1; then echo PASS; else
    echo FAIL; fail=1; grep -E "FAIL|Error" /tmp/tout | head -3 | sed 's/^/      /'
  fi
done
[ $fail -eq 0 ] && echo "all suites pass" || echo "FAILURES"
exit $fail
