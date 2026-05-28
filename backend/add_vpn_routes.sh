#!/bin/sh
# Adicionar rotas VPN WireGuard
ip route add 10.0.0.0/8 via 172.19.0.1 2>/dev/null || true
ip route add 172.20.0.0/16 via 172.19.0.1 2>/dev/null || true
echo "Rotas VPN adicionadas"
ip route show | grep -E '10\.0|172\.20'
