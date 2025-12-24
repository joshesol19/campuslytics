#!/bin/bash
set -e

# install python + pip (AL2023 / modern EB images usually have dnf)
if command -v dnf >/dev/null 2>&1; then
  dnf -y install python3 python3-pip
else
  yum -y install python3 python3-pip
fi

# install your python deps (best: keep them in python/requirements.txt)
python3 -m pip install --upgrade pip
python3 -m pip install -r python/requirements.txt
