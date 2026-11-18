@echo off
title Coffee's POS - Iniciando Aplicacion
color 0B
echo ======================================================
echo             COFFEE'S POS - APLICACION WEB
echo ======================================================
echo.

cd /d "%~dp0"

echo [1/3] Verificando instalacion de Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js no esta instalado o no se encuentra en el PATH.
    echo Por favor descarga e instala Node.js desde: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

node -v
echo.

echo [2/3] Verificando dependencias...
if not exist "node_modules\" (
    echo Instalando dependencias necesarias (npm install)...
    call npm install
    if %errorlevel% neq 0 (
        color 0C
        echo [ERROR] Hubo un problema al instalar las dependencias.
        pause
        exit /b 1
    )
) else (
    echo Dependencias ya instaladas.
)
echo.

echo [3/3] Iniciando servidor de desarrollo...
echo La aplicacion se abrira automaticamente en tu navegador en http://localhost:5173
echo Para detener la aplicacion, presiona Ctrl + C en esta ventana.
echo.
call npm run dev

if %errorlevel% neq 0 (
    echo.
    echo El servidor se ha detenido con codigo de error %errorlevel%.
    pause
)
