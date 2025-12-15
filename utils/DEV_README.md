# Docker 开发模式使用指南

## 概述

Docker 开发模式支持代码热重载，修改源代码后自动刷新，无需重新构建 Docker 镜像。

## 快速开始

### 1. 首次启动（需要构建镜像）

```bash
# 构建开发镜像
docker-compose -f docker-compose.dev.yml build

# 启动所有服务
docker-compose -f docker-compose.dev.yml up -d

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f
```

### 2. 日常使用

```bash
# 启动服务
docker-compose -f docker-compose.dev.yml up -d

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f

# 查看特定服务日志
docker-compose -f docker-compose.dev.yml logs -f backend-dev
docker-compose -f docker-compose.dev.yml logs -f frontend-dev

# 停止服务
docker-compose -f docker-compose.dev.yml down

# 重启服务
docker-compose -f docker-compose.dev.yml restart
```

## 服务说明

### 端口映射

- **前端开发服务器**: http://localhost:3090 (Vite 开发服务器，支持热重载)
- **后端开发服务器**: http://localhost:3080 (nodemon 自动重启)
- **MongoDB**: localhost:27017
- **Meilisearch**: localhost:7700

### 热重载说明

1. **前端热重载**: 
   - 修改 `client/` 目录下的代码
   - Vite 会自动检测变化并热更新
   - 浏览器会自动刷新（HMR）

2. **后端热重载**:
   - 修改 `api/` 目录下的代码
   - nodemon 会自动检测变化并重启服务器
   - 无需手动重启

3. **共享包**:
   - 修改 `packages/` 目录下的代码可能需要重启相应服务
   - 或者运行构建命令: `npm run build:data-provider` 等

## 首次启动时构建依赖包（可选）

如果遇到依赖包问题，可以在容器内构建：

```bash
# 进入后端容器
docker exec -it Aipyq-Backend-Dev sh

# 构建必要的包
npm run build:data-provider
npm run build:data-schemas
npm run build:api
npm run build:client-package
```

或者一次性构建所有包：

```bash
docker exec -it Aipyq-Backend-Dev npm run build:packages
```

## 常见问题

### 1. 端口被占用

如果端口被占用，可以修改 `docker-compose.dev.yml` 中的端口映射：

```yaml
ports:
  - "3091:3090"  # 前端端口
  - "3081:3080"  # 后端端口
```

### 2. 依赖包未构建

如果前端报错找不到某些包，需要先构建依赖包（见上方"首次启动时构建依赖包"）。

### 3. node_modules 权限问题

如果遇到权限问题，可以调整用户ID：

```yaml
user: "${UID:-1000}:${GID:-1000}"
```

### 4. 清除所有数据重新开始

```bash
# 停止并删除容器、网络
docker-compose -f docker-compose.dev.yml down -v

# 删除镜像（可选）
docker rmi aipyq-dev-backend-dev aipyq-dev-frontend-dev

# 重新构建和启动
docker-compose -f docker-compose.dev.yml build
docker-compose -f docker-compose.dev.yml up -d
```

## 与生产模式的区别

| 特性 | 开发模式 | 生产模式 |
|------|---------|---------|
| 配置文件 | `docker-compose.dev.yml` | `deploy-compose.yml` |
| 代码挂载 | ✅ 挂载源代码 | ❌ 代码在镜像中 |
| 热重载 | ✅ 支持 | ❌ 不支持 |
| 构建 | 运行时构建 | 镜像构建时 |
| 性能 | 较慢（开发优化） | 较快（生产优化） |
| 调试 | ✅ 更容易 | ❌ 较困难 |

## 注意事项

1. 开发模式下会安装所有依赖（包括 devDependencies），镜像会更大
2. 首次启动可能需要一些时间来安装依赖
3. 修改 `package.json` 后需要重建镜像或重新安装依赖
4. 数据目录（`data-node`, `meili_data_v1.12` 等）会与生产环境共享

## 开发工作流建议

1. 使用开发模式进行日常开发
2. 测试完成后，切换到生产模式测试构建结果
3. 确认无误后，提交代码
