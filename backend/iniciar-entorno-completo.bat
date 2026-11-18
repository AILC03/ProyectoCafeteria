@echo off
title Cafeteria - Entorno Completo
color 0A
echo ======================================================
echo          PROYECTO CAFETERIA - ENTORNO COMPLETO
echo ======================================================
echo.
cd /d "%~dp0"

:: Asegurar que Node.js y Docker esten en el PATH de la sesion
set "PATH=C:\Program Files\nodejs;C:\Program Files\Docker\Docker\resources\bin;%PATH%"

:: Deteccion de IP Local
set "IP_LOCAL=localhost"
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4" ^| findstr /v "192.168.56." ^| findstr /v "172."') do (
    for /f "tokens=1" %%b in ("%%a") do set "IP_LOCAL=%%b"
)

echo [1/4] Verificando Docker y PostgreSQL...
docker ps >nul 2>&1
if %errorlevel% equ 0 goto docker_listo

echo [INFO] Docker Desktop no responde. Intentando iniciar la aplicacion...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo Esperando a que el motor de Docker este listo...

set intentos=0
:esperar_docker
timeout /t 3 /nobreak >nul
docker ps >nul 2>&1
if %errorlevel% equ 0 goto docker_listo
set /a intentos+=1
if %intentos% geq 15 goto docker_fallo
goto esperar_docker

:docker_fallo
color 0C
echo.
echo [ERROR] Docker Desktop no respondio a tiempo.
echo Por favor abre Docker Desktop manualmente y vuelve a ejecutar este script.
echo.
if /i "%~1" neq "/no-pause" pause
exit /b 1

:docker_listo
echo Iniciando contenedor de PostgreSQL...
call npm.cmd run db:up
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERROR] No se pudo levantar PostgreSQL en Docker.
    echo.
    if /i "%~1" neq "/no-pause" pause
    exit /b %errorlevel%
)

echo [2/4] Iniciando Backend API (Puerto 3000)...
start "Backend API (Puerto 3000)" cmd /k "title Backend API && npm.cmd run dev"

echo [3/4] Iniciando Frontend Clientes (Puerto 5173)...
start "Frontend Clientes (Puerto 5173)" cmd /k "title Frontend Clientes && cd ..\frontend\clientes && npm.cmd run dev"

echo [4/4] Iniciando Frontend Empleados / POS (Puerto 5174)...
start "Frontend Empleados / POS (Puerto 5174)" cmd /k "title Frontend Empleados && cd ..\frontend\empleados && npm.cmd run dev"

echo.
echo ======================================================
echo  Todos los servicios han sido lanzados con exito:
echo.
echo  - Backend API:        http://localhost:3000/api/v1/health
echo  - Frontend Clientes:  http://localhost:5173
echo  - Acceso Celular/Red: http://%IP_LOCAL%:5173
echo  - POS Empleados:      http://localhost:5174
echo ======================================================
echo.
if /i "%~1" equ "/no-pause" goto fin
echo Presiona cualquier tecla para cerrar esta ventana.
echo Los servidores continuaran abiertos en sus terminales.
pause >nul
:fin
