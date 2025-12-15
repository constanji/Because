#!/bin/bash
# 使用 Dockerfile 构建 amd64 版本的 Docker 镜像
# 自动检测并使用本地已构建的 agents-Aipyq/dist

set -e

cd "$(dirname "$0")"

TAG=${1:-latest}
PLATFORM="linux/amd64"

echo "准备使用 Dockerfile 构建 amd64 镜像，tag: $TAG"

# 检查 agents-Aipyq/dist 是否存在且不为空
if [ -d "agents-Aipyq/dist" ] && [ -n "$(ls -A agents-Aipyq/dist 2>/dev/null)" ]; then
    echo "✓ 检测到本地已构建的 agents-Aipyq/dist，将使用本地构建结果（跳过 Docker 内构建）"
    USE_LOCAL_DIST=true
else
    echo "⚠ 未找到本地 agents-Aipyq/dist，将在 Docker 内构建"
    echo "  提示：如果构建失败（内存不足），可以先在本地运行 'cd agents-Aipyq && npm run build'"
    USE_LOCAL_DIST=false
    # 创建一个空的 dist 目录，避免 COPY 失败
    mkdir -p agents-Aipyq/dist
fi

# 使用 docker buildx 构建 amd64 镜像
echo "开始构建（这可能需要一些时间，特别是在 Mac 上构建 amd64 镜像）..."
docker buildx build \
    --platform "$PLATFORM" \
    -t "aipyq:$TAG" \
    -f Dockerfile \
    --load \
    .

# 如果之前创建了空的 dist 目录，现在清理它
if [ "$USE_LOCAL_DIST" = "false" ] && [ -d "agents-Aipyq/dist" ] && [ -z "$(ls -A agents-Aipyq/dist 2>/dev/null)" ]; then
    rmdir agents-Aipyq/dist 2>/dev/null || true
fi

echo "✓ 构建完成！镜像: aipyq:$TAG"

