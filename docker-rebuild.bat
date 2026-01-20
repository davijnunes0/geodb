@echo off
REM Script para reconstruir e reiniciar containers Docker no Windows usando WSL
REM Garante que todas as alterações sejam aplicadas

echo Parando containers...
wsl bash -c "cd /mnt/c/Users/davijnunes/paradigmas && docker compose down"

echo Removendo containers antigos...
wsl bash -c "cd /mnt/c/Users/davijnunes/paradigmas && docker compose rm -f"

echo Reconstruindo imagens (sem cache)...
wsl bash -c "cd /mnt/c/Users/davijnunes/paradigmas && docker compose build --no-cache"

echo Iniciando containers...
wsl bash -c "cd /mnt/c/Users/davijnunes/paradigmas && docker compose up -d"

echo Containers iniciados!
echo.
echo Ver logs com: wsl bash -c "cd /mnt/c/Users/davijnunes/paradigmas && docker compose logs -f node"
echo Acesse: http://localhost:8080
echo.
echo Aguardando inicializacao...
timeout /t 3 /nobreak >nul

echo Logs do container Node:
wsl bash -c "cd /mnt/c/Users/davijnunes/paradigmas && docker compose logs --tail=50 node"

pause
