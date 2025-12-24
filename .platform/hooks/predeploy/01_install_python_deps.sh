#!/bin/bash
set -e

# install python + pip (AL2023 / modern EB images usually have dnf)
if command -v dnf >/dev/null 2>&1; then
  dnf -y install python3 python3-pip
else
  yum -y install python3 python3-pip
fi

# DON'T upgrade pip (it's rpm-managed and will fail)
python3 -m pip install -r requirements.txt --no-cache-dir