#!/bin/bash
# 服务器端部署脚本
# 用于在服务器上快速部署 aipyq:latest 镜像

set -e

DEPLOY_DIR=${1:-/opt/aipyq}
IMAGE_FILE=${2:-aipyq-latest-amd64.tar}

echo "=========================================="
echo "Aipyq 服务器部署脚本"
echo "=========================================="
echo "部署目录: $DEPLOY_DIR"
echo "镜像文件: $IMAGE_FILE"
echo ""

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  建议使用 sudo 运行此脚本"
fi

# 创建部署目录
echo "📁 创建部署目录..."
mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"
mkdir -p images uploads logs data-node meili_data_v1.12

# 检查镜像文件是否存在
if [ ! -f "$IMAGE_FILE" ]; then
    echo "❌ 错误: 镜像文件 $IMAGE_FILE 不存在"
    echo "请先将镜像文件传输到服务器，或指定正确的路径"
    exit 1
fi

# 加载镜像
echo "📦 加载 Docker 镜像..."
docker load -i "$IMAGE_FILE"

# 验证镜像
if docker images | grep -q "aipyq.*latest"; then
    echo "✅ 镜像加载成功"
    docker images | grep aipyq
else
    echo "❌ 镜像加载失败"
    exit 1
fi

# 检查 docker-compose 是否可用
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    echo "❌ 错误: 未找到 docker-compose"
    exit 1
fi

# 检查是否存在 docker-compose.yml
if [ ! -f "docker-compose.yml" ]; then
    echo "⚠️  未找到 docker-compose.yml，创建示例配置..."
    cat > docker-compose.yml << 'EOF'
services:
  api:
    image: aipyq:latest
    container_name: Aipyq-API
    ports:
      - "3080:3080"
    depends_on:
      - mongodb
      - meilisearch
    restart: always
    networks:
      - aipyq-network
    env_file:
      - .env
    environment:
      - HOST=0.0.0.0
      - PORT=3080
      - NODE_ENV=production
      - MONGO_URI=mongodb://mongodb:27017/Aipyq
      - MEILI_HOST=http://meilisearch:7700
    volumes:
      - ./Aipyq.yaml:/app/Aipyq.yaml
      - ./images:/app/client/public/images
      - ./uploads:/app/uploads
      - ./logs:/app/api/logs

  mongodb:
    container_name: pyqchat-mongodb
    image: mongo
    restart: always
    networks:
      - aipyq-network
    volumes:
      - ./data-node:/data/db
    command: mongod --noauth

  meilisearch:
    container_name: chat-meilisearch
    image: getmeili/meilisearch:v1.12.3
    restart: always
    networks:
      - aipyq-network
    env_file:
      - .env
    environment:
      - MEILI_HOST=http://meilisearch:7700
      - MEILI_NO_ANALYTICS=true
    volumes:
      - ./meili_data_v1.12:/meili_data

networks:
  aipyq-network:
    driver: bridge
EOF
    echo "✅ 已创建 docker-compose.yml 示例文件"
fi

# 检查是否存在 .env 文件
if [ ! -f ".env" ]; then
    echo "⚠️  未找到 .env 文件，创建示例配置..."
    cat > .env << 'EOF'
# MongoDB 配置
MONGO_PORT=27017

# Meilisearch 配置
MEILI_PORT=7700
MEILI_MASTER_KEY=change-this-master-key

# API 配置
API_PORT=3080
EOF
    echo "✅ 已创建 .env 示例文件"
    echo "⚠️  请修改 .env 文件中的配置，特别是 MEILI_MASTER_KEY"
fi

# 检查是否存在 Aipyq.yaml
if [ ! -f "Aipyq.yaml" ]; then
    echo "⚠️  未找到 Aipyq.yaml 文件"
    echo "请从本地复制 Aipyq.yaml 到服务器:"
    echo "  scp Aipyq.yaml user@server:$DEPLOY_DIR/"
fi

echo ""
echo "=========================================="
echo "✅ 部署准备完成！"
echo "=========================================="
echo ""
echo "下一步操作："
echo "1. 检查并修改配置文件："
echo "   - .env (必需)"
echo "   - Aipyq.yaml (必需)"
echo "   - docker-compose.yml (可选)"
echo ""
echo "2. 启动服务："
echo "   cd $DEPLOY_DIR"
echo "   $COMPOSE_CMD up -d"
echo ""
echo "3. 查看日志："
echo "   $COMPOSE_CMD logs -f api"
echo ""

