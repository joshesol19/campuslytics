#!/bin/bash
set -e

if command -v dnf >/dev/null 2>&1; then
  dnf -y install python3
else
  yum -y install python3
fi

# bootstrap pip if it's missing
python3 -m ensurepip --upgrade || true

# now install deps
python3 -m pip install --no-cache-dir -r requirements.txt
