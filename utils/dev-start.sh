#!/bin/bash

# Docker 开发模式启动脚本

set -e

echo "🚀 启动 Docker 开发模式..."

# 检查是否存在 .env 文件
if [ ! -f .env ]; then
    echo "⚠️  警告: .env 文件不存在，请确保已配置环境变量"
fi

# 检查是否需要构建镜像
if [ "$1" == "--build" ] || [ "$1" == "-b" ]; then
    echo "📦 构建开发镜像..."
    docker-compose -f docker-compose.dev.yml build
fi

# 启动服务
echo "▶️  启动服务..."
docker-compose -f docker-compose.dev.yml up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 5

# 显示服务状态
echo ""
echo "✅ 服务状态:"
docker-compose -f docker-compose.dev.yml ps

echo ""
echo "📝 服务访问地址:"
echo "   前端开发服务器: http://localhost:3090"
echo "   后端开发服务器: http://localhost:3080"
echo "   MongoDB: localhost:27017"
echo "   Meilisearch: localhost:7700"
echo ""
echo "📋 查看日志:"
echo "   docker-compose -f docker-compose.dev.yml logs -f"
echo ""
echo "🛑 停止服务:"
echo "   docker-compose -f docker-compose.dev.yml down"
echo ""
