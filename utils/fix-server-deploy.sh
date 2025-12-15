#!/bin/bash
# 服务器端快速修复脚本
# 用于加载本地镜像并修复 docker-compose 配置

set -e

echo "=========================================="
echo "Aipyq 服务器部署修复脚本"
echo "=========================================="

# 检查镜像文件是否存在
IMAGE_FILE="aipyq-latest-amd64.tar"
if [ ! -f "$IMAGE_FILE" ]; then
    echo "❌ 错误: 未找到镜像文件 $IMAGE_FILE"
    echo "请确保镜像文件在当前目录，或指定正确的路径"
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

# 备份原始 docker-compose.yml
if [ -f "docker-compose.yml" ]; then
    echo "📋 备份原始 docker-compose.yml..."
    cp docker-compose.yml docker-compose.yml.backup
fi

# 创建修复后的 docker-compose.yml
echo "🔧 创建修复后的 docker-compose.yml..."
cat > docker-compose.yml << 'EOF'
services:
  api:
    container_name: Aipyq
    ports:
      - "${API_PORT:-3080}:3080"
    depends_on:
      - mongodb
      - meilisearch
    image: aipyq:latest  # 使用本地镜像
    restart: always
    extra_hosts:
      - "host.docker.internal:host-gateway"
    env_file:
      - .env
    environment:
      - HOST=0.0.0.0
      - PORT=3080
      - DOMAIN_CLIENT=http://localhost:${API_PORT:-3080}
      - DOMAIN_SERVER=http://localhost:${API_PORT:-3080}
      - MONGO_URI=mongodb://mongodb:27017/Aipyq
      - MEILI_HOST=http://meilisearch:7700
      - AIPYQ_LOG_DIR=/app/api/logs
      - CONFIG_PATH=/app/Aipyq.yaml
    volumes:
      - type: bind
        source: ./.env
        target: /app/.env
      - ./images:/app/client/public/images
      - ./uploads:/app/uploads
      - ./logs:/app/api/logs
      - ./logs:/app/logs
      - ./Aipyq.yaml:/app/Aipyq.yaml

  mongodb:
    container_name: PYQ-MongoDB
    image: mongo
    restart: always
    ports:
      - "${MONGO_PORT:-27017}:27017"
    volumes:
      - ./data-node:/data/db
    command: mongod --noauth

  meilisearch:
    container_name: PYQ-Meilisearch
    image: getmeili/meilisearch:v1.12.3
    restart: always
    ports:
      - "${MEILI_PORT:-7700}:7700"
    env_file:
      - .env
    environment:
      - MEILI_HOST=http://meilisearch:7700
      - MEILI_NO_ANALYTICS=true
      - MEILI_MASTER_KEY=${MEILI_MASTER_KEY}
    volumes:
      - ./meili_data_v1.12:/meili_data

  # RAG 相关服务（可选，如果不需要可以注释掉）
  # vectordb:
  #   container_name: vectorDB
  #   image: pgvector/pgvector:0.8.0-pg15-trixie
  #   environment:
  #     POSTGRES_DB: mydatabase
  #     POSTGRES_USER: myuser
  #     POSTGRES_PASSWORD: mypassword
  #   restart: always
  #   volumes:
  #     - pgdata2:/var/lib/postgresql/data
  # 
  # rag_api:
  #   container_name: Rag_api
  #   image: ghcr.io/constanji/aipyq-rag-api-dev-lite:latest
  #   environment:
  #     - DB_HOST=vectordb
  #     - RAG_PORT=${RAG_PORT:-8000}
  #   restart: always
  #   depends_on:
  #     - vectordb
  #   env_file:
  #     - .env

volumes:
  pgdata2:
EOF

echo "✅ docker-compose.yml 已更新"
echo ""
echo "=========================================="
echo "下一步操作："
echo "=========================================="
echo ""
echo "1. 确保有以下文件："
echo "   - .env (包含必要的环境变量)"
echo "   - Aipyq.yaml (配置文件)"
echo ""
echo "2. 启动服务："
echo "   docker compose up -d"
echo ""
echo "3. 查看日志："
echo "   docker compose logs -f api"
echo ""

