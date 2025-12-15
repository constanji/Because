#!/bin/bash
# 服务器状态检查脚本

echo "=========================================="
echo "检查 Aipyq 服务状态"
echo "=========================================="
echo ""

echo "📦 容器状态："
docker compose -f deploy-compose.yml ps
echo ""

echo "🔍 检查 API 容器日志（最后 20 行）："
docker compose -f deploy-compose.yml logs --tail=20 api
echo ""

echo "🌐 测试 API 连接："
curl -s http://localhost:3080/api/health || echo "API 未响应"
echo ""

echo "📊 容器资源使用："
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" $(docker compose -f deploy-compose.yml ps -q)
echo ""

echo "⚠️  平台检查："
echo "主机平台：$(uname -m)"
echo "镜像平台："
docker inspect aipyq:latest --format='{{.Architecture}}' 2>/dev/null || echo "无法获取镜像信息"
echo ""

