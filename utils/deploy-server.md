# 服务器部署指南 - 使用 aipyq:latest 镜像

## 步骤 1: 将镜像传输到服务器

### 方法 1: 使用 scp 传输（推荐）

```bash
# 在本地执行，将镜像文件传输到服务器
scp aipyq-latest-amd64.tar user@your-server-ip:/path/to/destination/
```

### 方法 2: 使用 rsync（支持断点续传）

```bash
rsync -avz --progress aipyq-latest-amd64.tar user@your-server-ip:/path/to/destination/
```

### 方法 3: 先压缩再传输（节省带宽）

```bash
# 在本地压缩
gzip aipyq-latest-amd64.tar

# 传输压缩文件
scp aipyq-latest-amd64.tar.gz user@your-server-ip:/path/to/destination/

# 在服务器上解压
gunzip aipyq-latest-amd64.tar.gz
```

## 步骤 2: 在服务器上加载镜像

```bash
# SSH 登录服务器
ssh user@your-server-ip

# 进入镜像文件所在目录
cd /path/to/destination/

# 加载镜像
docker load -i aipyq-latest-amd64.tar

# 验证镜像已加载
docker images | grep aipyq
```

## 步骤 3: 准备部署文件

在服务器上创建部署目录并准备必要的文件：

```bash
# 创建部署目录
mkdir -p /opt/aipyq
cd /opt/aipyq

# 创建必要的目录
mkdir -p images uploads logs data-node meili_data_v1.12
```

## 步骤 4: 准备配置文件

### 4.1 创建 .env 文件

```bash
# 创建 .env 文件（根据实际情况修改）
cat > .env << 'EOF'
# MongoDB 配置
MONGO_PORT=27017

# Meilisearch 配置
MEILI_PORT=7700
MEILI_MASTER_KEY=your-master-key-here

# API 配置
API_PORT=3080

# RAG 配置（如果使用）
RAG_PORT=8000

# 用户权限（可选）
UID=1000
GID=1000
EOF
```

### 4.2 创建 Aipyq.yaml 配置文件

```bash
# 从本地复制 Aipyq.yaml 到服务器
scp Aipyq.yaml user@your-server-ip:/opt/aipyq/
```

### 4.3 创建 docker-compose.yml

使用提供的 `deploy-compose.yml` 或创建新的：

```bash
# 复制 deploy-compose.yml 到服务器
scp deploy-compose.yml user@your-server-ip:/opt/aipyq/docker-compose.yml
```

然后修改 `docker-compose.yml` 中的镜像名称：

```yaml
services:
  api:
    image: aipyq:latest  # 修改为 aipyq:latest
    # ... 其他配置
```

### 4.4 创建 nginx 配置（如果需要前端）

```bash
# 复制 nginx 配置
scp client/nginx.conf user@your-server-ip:/opt/aipyq/nginx.conf
```

## 步骤 5: 启动服务

```bash
# 进入部署目录
cd /opt/aipyq

# 启动所有服务
docker compose up -d

# 或者使用 docker-compose（旧版本）
docker-compose up -d

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f api
```

## 步骤 6: 验证部署

```bash
# 检查容器是否运行
docker ps

# 检查 API 是否响应
curl http://localhost:3080/api/health

# 或者访问前端（如果配置了 nginx）
curl http://localhost:80
```

## 常用管理命令

```bash
# 停止服务
docker compose down

# 重启服务
docker compose restart

# 更新镜像后重启
docker compose pull  # 如果使用远程镜像
docker compose up -d --force-recreate api

# 查看日志
docker compose logs -f api
docker compose logs -f mongodb
docker compose logs -f meilisearch

# 进入容器
docker exec -it Aipyq-API sh
```

## 故障排查

### 镜像加载失败
```bash
# 检查镜像文件完整性
docker load -i aipyq-latest-amd64.tar

# 如果失败，检查文件大小
ls -lh aipyq-latest-amd64.tar
```

### 容器无法启动
```bash
# 查看详细日志
docker compose logs api

# 检查端口占用
netstat -tulpn | grep 3080

# 检查磁盘空间
df -h
```

### 数据库连接问题
```bash
# 检查 MongoDB 是否运行
docker compose ps mongodb

# 检查网络连接
docker compose exec api ping mongodb
```

## 更新镜像

当有新版本时：

```bash
# 1. 在本地构建新镜像并保存
docker save aipyq:latest -o aipyq-latest-amd64.tar

# 2. 传输到服务器
scp aipyq-latest-amd64.tar user@server:/opt/aipyq/

# 3. 在服务器上加载新镜像
cd /opt/aipyq
docker load -i aipyq-latest-amd64.tar

# 4. 重启服务
docker compose up -d --force-recreate api
```

