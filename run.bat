@echo off
cd /d "%~dp0"
if not defined ADMIN_USER set ADMIN_USER=ervinroch
if not defined ADMIN_PASSWORD set ADMIN_PASSWORD=2008
if not defined SECRET_KEY set SECRET_KEY=nexus-local-dev-secret-change-before-publishing
if not exist .venv (
  py -3 -m venv .venv
)
call .venv\Scripts\activate.bat
py -m pip install -r requirements.txt
py app.py
pause
