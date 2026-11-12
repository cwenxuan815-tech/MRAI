@echo off
setlocal

rem ============================================================
rem  Start EVP services
rem    - Backend  : FastAPI + Uvicorn on 0.0.0.0:8000
rem    - Frontend : Vite dev server on 0.0.0.0:5173
rem  Each service gets its own window so logs stay readable.
rem  Use stop.bat to shut both down.
rem
rem  Node resolution order:
rem    1) .tools\node\node.exe   portable build (NOT in the repository)
rem    2) node found on PATH     system install, Node 18+
rem ============================================================

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "PY=%BACKEND_DIR%\.venv\Scripts\python.exe"
set "NODE_DIR=%ROOT%.tools\node"
set "NODE_EXE="

rem ---------------- preflight: Python venv ----------------
if not exist "%PY%" (
    echo [ERROR] Python venv not found: %PY%
    echo.
    echo   Create it once, then re-run this script:
    echo     cd backend
    echo     python -m venv .venv
    echo     .venv\Scripts\python.exe -m pip install -r requirements.txt
    echo     copy .env.example .env
    echo.
    pause
    exit /b 1
)

rem ---------------- preflight: backend\.env ----------------
if not exist "%BACKEND_DIR%\.env" (
    echo [WARN]  backend\.env not found -- copy the template before the first run:
    echo           copy backend\.env.example backend\.env
    echo         Without it DIFY_MOCK defaults to false and uploads will try
    echo         to reach a real Dify instance.
    echo.
)

rem ---------------- resolve Node ----------------
if exist "%NODE_DIR%\node.exe" (
    set "NODE_EXE=%NODE_DIR%\node.exe"
    echo [INFO]  Node: portable build ^(.tools\node^)
) else (
    for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
    if defined NODE_EXE (
        echo [INFO]  Node: %NODE_EXE% ^(from PATH^)
    )
)

if not defined NODE_EXE (
    echo [ERROR] Node.js not found.
    echo         Looked for "%NODE_DIR%\node.exe" and for "node" on PATH.
    echo.
    echo   Install Node 18+ from https://nodejs.org and re-run,
    echo   or unpack a portable build into .tools\node\.
    echo.
    pause
    exit /b 1
)

rem ---------------- preflight: frontend dependencies ----------------
if not exist "%FRONTEND_DIR%\node_modules\vite\bin\vite.js" (
    echo [ERROR] Frontend dependencies are missing: %FRONTEND_DIR%\node_modules
    echo.
    echo   Install them once, then re-run this script:
    echo     cd frontend
    echo     npm install
    echo.
    pause
    exit /b 1
)

rem ---------------- Backend ----------------
call :is_listening 8000
if "%LISTENING%"=="1" (
    echo [SKIP]  Backend already running on port 8000
) else (
    echo [START] Backend  --^> http://127.0.0.1:8000
    start "EVP-Backend-8000" /D "%BACKEND_DIR%" cmd /k ""%PY%" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
)

rem ---------------- Frontend ----------------
call :is_listening 5173
if "%LISTENING%"=="1" (
    echo [SKIP]  Frontend already running on port 5173
) else (
    echo [START] Frontend --^> http://localhost:5173/patient/upload
    start "EVP-Frontend-5173" /D "%FRONTEND_DIR%" cmd /k ""%NODE_EXE%" node_modules\vite\bin\vite.js"
)

echo.
echo Done. Run stop.bat to shut both services down.
timeout /t 6 >nul
exit /b 0

:is_listening
set "LISTENING=0"
for /f "tokens=5" %%A in ('netstat -ano ^| findstr /C:":%~1 " ^| findstr /C:"LISTENING"') do set "LISTENING=1"
exit /b 0
