@echo off
cd /d %~dp0
if not exist node_modules (echo First run: installing, please wait... & call npm install)
call npm start
