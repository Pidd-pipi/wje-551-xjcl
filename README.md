# SupplyChain Hub

面向中小企业的供应链与物流协同平台，覆盖供应商、仓库库存、运单追踪、RBAC 权限和审计日志。

## 主要功能

- 供应链总览仪表盘：在途、待签收、低库存、活跃供应商、状态分布与预警列表。
- 供应商管理：搜索筛选、审核、评分、详情与关联运单。
- 库存管理：仓库维度库存查询、入库、出库、调拨、盘点和安全库存预警。
- 运单追踪：运单列表、状态流转、发货、在途、按明细分批收货（实收数量 + 收货批次号）、未收待收汇总、累计收齐自动签收入库、超收整单拒绝、批次号幂等、异常和取消。
- 横切能力：JWT 登录、角色权限、前端路由守卫、按钮级 `v-permission`、统一异常处理、审计日志。

## 分批收货差异闭环

仓库在运单详情（运输中的运单）按明细录入**本次实收数量**与**收货批次号**：

- **部分收货**：未收部分保留待收，运单保持 `IN_TRANSIT（运输中）`，详情页展示待收汇总（原始数量 / 累计实收 / 待收数量，逐 SKU 与整单汇总）。
- **完全收货**：每个 SKU 的累计实收达到原始数量后运单才签收为 `DELIVERED（已签收）`，记录实际签收时间，库存按本次净增数量逐 SKU 入库。
- **超收整单拒绝**：任一 SKU「累计已收 + 本次实收」超过原始数量时，整批提交被拒绝，**不写入任何库存、不产生批次记录、运单状态不变**（先全量校验后落库）。
- **批次号幂等**：同一运单下同一收货批次号不能重复提交入库；批次内同一明细不能重复出现。
- **审计**：每次批次收货记录审计日志，包含收货批次号、逐 SKU 实收数量、批次后差异（待收）与待收汇总；完全收货额外记录签收状态流转。入库审计同时回写批次号与来源运单号。

相关接口：`POST /api/v1/shipments/:id/receive`（body：`{ batchNo, lines: [{ itemId, receivedQuantity }] }`）、`GET /api/v1/shipments/:id/pending-summary`。
相关表：`shipment_receipts`、`shipment_receipt_items`，`shipment_items.received_quantity`。

## 快速启动

```bash
cp .env.example .env
docker compose up -d
```

访问地址：

- 前端：http://localhost:38201
- 后端健康检查：http://localhost:38301/api/v1/health
- MySQL：localhost:3306
- Redis：localhost:6379

验证账号：

- 管理员：admin / admin123
- 采购经理：purchase / purchase123
- 仓库经理：warehouse / warehouse123

## 本地开发

```bash
cd backend
npm install
npm run dev

cd ../frontend
npm install
npm run dev
```

前端本地开发通过 Vite proxy 将 `/api` 转发到 `http://localhost:38301`。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3, Vite, TypeScript, Pinia, Vue Router, Axios |
| 后端 | Node.js, Express, TypeScript, JWT |
| 数据库脚本 | MySQL 8 SQL migration + seed |
| 缓存/依赖 | Redis 7 |
| 部署 | Docker Compose, Nginx |

## 项目结构

```text
.
├── backend/
│   ├── src/controllers/
│   ├── src/services/
│   ├── src/routes/
│   ├── src/models/
│   ├── src/middlewares/
│   └── src/constants/
├── frontend/
│   ├── src/api/
│   ├── src/stores/
│   ├── src/pages/
│   ├── src/components/common/
│   ├── src/router/
│   └── src/constants/
├── database/
│   ├── migrations/001_initial.sql
│   └── seeds/001_initial_data.sql
├── docker-compose.yml
├── .env
└── .env.example
```

## 环境变量说明

```env
# Compose 项目名（确保中文目录下正常启动）
COMPOSE_PROJECT_NAME=wjescm

# 前端端口
FRONTEND_PORT=38201

# 后端端口
BACKEND_PORT=38301

# 数据库配置
DB_ROOT_PASSWORD=root123456
DB_NAME=supplychain_hub
DB_USER=wjescm
DB_PASSWORD=wjescm123456
DB_PORT=3306

# Redis 配置
REDIS_PORT=6379

# JWT 配置
JWT_SECRET=your-jwt-secret-key-change-in-production
JWT_EXPIRES_IN=7d
```

## Docker 部署说明

`docker-compose.yml` 不包含 `version` 字段，顶层声明 `name: wjescm`，并通过 `.env` 中的 `COMPOSE_PROJECT_NAME=wjescm` 保证中文目录名下容器名稳定。数据库与 Redis 使用命名卷，前端 Nginx 将 `/api` 反向代理到 `backend:38301`。

## 枚举出现位置清单

### ShipmentStatus

| 位置 | 文件路径 |
|------|---------|
| 后端枚举定义 | backend/src/constants/enums.ts |
| 后端实体 | backend/src/models/shipment.entity.ts |
| 后端实体 | backend/src/models/shipment-item.entity.ts |
| 后端实体 | backend/src/models/shipment-receipt.entity.ts（收货批次） |
| 后端服务 | backend/src/services/shipments.service.ts |
| 后端控制器 | backend/src/controllers/shipments.controller.ts |
| 前端枚举定义 | frontend/src/constants/enums.ts |
| 前端类型 | frontend/src/types/shipment.d.ts |
| 前端组件 | frontend/src/components/common/StatusBadge.vue |
| 前端页面 | frontend/src/pages/Shipments.vue |
| 前端页面 | frontend/src/pages/ShipmentDetail.vue |
| 前端页面 | frontend/src/pages/Dashboard.vue |
| 数据库迁移 | database/migrations/001_initial.sql |
| 种子数据 | database/seeds/001_initial_data.sql |

### SupplierStatus

| 位置 | 文件路径 |
|------|---------|
| 后端枚举定义 | backend/src/constants/enums.ts |
| 后端实体 | backend/src/models/supplier.entity.ts |
| 后端服务 | backend/src/services/suppliers.service.ts |
| 后端控制器 | backend/src/controllers/suppliers.controller.ts |
| 前端枚举定义 | frontend/src/constants/enums.ts |
| 前端类型 | frontend/src/types/supplier.d.ts |
| 前端组件 | frontend/src/components/common/StatusBadge.vue |
| 前端页面 | frontend/src/pages/Suppliers.vue |
| 数据库迁移 | database/migrations/001_initial.sql |

### InventoryAlertLevel

| 位置 | 文件路径 |
|------|---------|
| 后端枚举定义 | backend/src/constants/enums.ts |
| 后端实体 | backend/src/models/inventory.entity.ts |
| 后端服务 | backend/src/services/inventory.service.ts |
| 前端枚举定义 | frontend/src/constants/enums.ts |
| 前端类型 | frontend/src/types/inventory.d.ts |
| 前端组件 | frontend/src/components/common/StatusBadge.vue |
| 前端页面 | frontend/src/pages/Inventory.vue |
| 前端页面 | frontend/src/pages/Dashboard.vue |
| 数据库迁移 | database/migrations/001_initial.sql |

## License

MIT
