#!/bin/bash

# Script para reconstruir e reiniciar containers Docker
# Garante que todas as alterações sejam aplicadas

echo "Parando containers..."
docker-compose down

echo "Removendo containers antigos..."
docker-compose rm -f

echo "Reconstruindo imagens..."
docker-compose build --no-cache

echo "Iniciando containers..."
docker-compose up -d

echo "Containers iniciados!"
echo "Ver logs com: docker-compose logs -f node"
echo "Acesse: http://localhost:8080"
