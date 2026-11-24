#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
export ADMIN_USER="${ADMIN_USER:-ervinroch}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-2008}"
export SECRET_KEY="${SECRET_KEY:-nexus-local-dev-secret-change-before-publishing}"
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python app.py
