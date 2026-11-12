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
set "MISSING="

rem ---------------- preflight 1: Python venv ----------------
if not exist "%PY%" (
    set "MISSING=1"
    echo [MISSING] Python venv
    echo           ^-^> cd backend ^&^& python -m venv .venv
    echo           ^-^> .venv\Scripts\python.exe -m pip install -r requirements.txt
)

rem ---------------- preflight 2: backend\.env ----------------
if not exist "%BACKEND_DIR%\.env" (
    set "MISSING=1"
    echo [MISSING] backend\.env
    echo           ^-^> copy backend\.env.example backend\.env
    echo           ^(without it DIFY_MOCK defaults to false and uploads will
    echo            try to reach a real Dify instance^)
)

rem ---------------- preflight 3: Node ----------------
if exist "%NODE_DIR%\node.exe" (
    set "NODE_EXE=%NODE_DIR%\node.exe"
) else (
    for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
)
rem  call echo: NODE_EXE is assigned inside the block above, so it must be
rem  expanded at run time, not at parse time.
if defined NODE_EXE (
    call echo [OK]      Node: %%NODE_EXE%%
) else (
    set "MISSING=1"
    echo [MISSING] Node.js 18+
    echo           ^-^> install from https://nodejs.org, or unpack a portable build
    echo             into .tools\node\ ^(looked for node.exe and "node" on PATH^)
)

rem ---------------- preflight 4: frontend dependencies ----------------
if not exist "%FRONTEND_DIR%\node_modules\vite\bin\vite.js" (
    set "MISSING=1"
    echo [MISSING] frontend\node_modules
    echo           ^-^> cd frontend ^&^& npm install
)

if defined MISSING (
    echo.
    echo Fix the items above once, then re-run start.bat.
    echo.
    pause
    exit /b 1
)

rem ---------------- Backend ----------------
rem  A plain "port is listening" check is not enough: Docker Desktop and other
rem  tools often hold 8000, and skipping on that false positive leaves the user
rem  with a frontend talking to nothing. So probe the health endpoint instead.
call :probe_backend
if defined HEALTHY (
    echo [SKIP]  Backend already running on port 8000 ^(health check ok^)
    goto backend_done
)
call :is_listening 8000
if "%LISTENING%"=="1" (
    echo [ERROR] Port 8000 is occupied, but /api/health does not answer.
    echo         Another program is holding it -- Docker container, IDE,
    echo         or a leftover process. Free the port, then re-run.
    echo.
    pause
    exit /b 1
)
echo [START] Backend  --^> http://127.0.0.1:8000
start "EVP-Backend-8000" /D "%BACKEND_DIR%" cmd /k ""%PY%" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
:backend_done

rem ---------------- Frontend ----------------
call :probe_frontend
if defined VITE_UP (
    echo [SKIP]  Frontend already running on port 5173 ^(vite responds^)
    goto frontend_done
)
call :is_listening 5173
if "%LISTENING%"=="1" (
    echo [ERROR] Port 5173 is occupied, but it is not this Vite server.
    echo         Free the port, then re-run.
    echo.
    pause
    exit /b 1
)
echo [START] Frontend --^> http://localhost:5173/patient/upload
start "EVP-Frontend-5173" /D "%FRONTEND_DIR%" cmd /k ""%NODE_EXE%" node_modules\vite\bin\vite.js"
:frontend_done

echo.
echo Done. Run stop.bat to shut both services down.
timeout /t 6 >nul
exit /b 0

:probe_backend
set "HEALTHY="
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:8000/api/health'; if ($r.Content -match 'status.{1,4}ok') { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 set "HEALTHY=1"
exit /b 0

:probe_frontend
set "VITE_UP="
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:5173/'; if ($r.Content -match 'vite') { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 set "VITE_UP=1"
exit /b 0

:is_listening
set "LISTENING=0"
for /f "tokens=5" %%A in ('netstat -ano ^| findstr /C:":%~1 " ^| findstr /C:"LISTENING"') do set "LISTENING=1"
exit /b 0
