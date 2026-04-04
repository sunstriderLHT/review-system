# 系统维护文档

## 1. 优化概述

本系统为本地运行的 Flask + MySQL 复习管理系统，包含后端 API 服务和前端页面。

---

## 2. 已实施的优化措施

### 2.1 后端优化 (server.py)

| 优化项 | 说明 | 状态 |
|--------|------|------|
| **数据库连接池** | 使用 `dbutils.pooled_db.PooledDB` 预创建 5 个连接，避免每次请求创建新连接 | ✅ |
| **Gzip 压缩** | 启用 `flask_compress` 自动压缩响应，降低网络传输量 | ✅ |
| **移除调试模式** | 生产环境关闭 `debug=True`，提升性能 | ✅ |
| **数据库索引** | 新增 `/api/init-indexes` 接口，可手动创建 `next_review` 和 `category` 索引 | ✅ |

### 2.2 前端优化 (app.js)

| 优化项 | 说明 | 状态 |
|--------|------|------|
| **本地缓存** | 使用 `localStorage` 缓存数据，5分钟内重复请求直接返回缓存 | ✅ |
| **缓存失效机制** | 任何写操作（新增/更新/删除）自动清除缓存，确保数据一致 | ✅ |
| **防抖渲染** | 筛选操作 100ms 防抖，避免频繁重渲染 DOM | ✅ |

---

## 3. 依赖安装

首次部署或更新时需安装以下 Python 依赖：

```bash
pip install flask flask-cors flask-compress pymysql dbutils
```

---

## 4. 初始化数据库索引

系统首次运行或数据量较大时，建议创建索引以提升查询性能：

```bash
curl -X POST http://localhost:3000/api/init-indexes
```

成功响应：`{"success": true}`

---

## 5. 启动服务

```bash
python server.py
```

服务运行于 `http://localhost:3000`

---

## 6. 缓存机制说明

### 缓存策略
- **缓存时间**: 5 分钟
- **存储位置**: 浏览器 localStorage
- **键名**: `reviewDataCache` (数据), `reviewDataTimestamp` (时间戳)

### 缓存流程
1. 发起请求时检查 localStorage 是否有有效缓存
2. 若缓存存在且未过期，直接返回缓存数据（无网络请求）
3. 若缓存不存在或已过期，发送 API 请求，响应后更新缓存
4. 执行任何写操作后，自动清除缓存

### 手动清除缓存
如需强制刷新数据，可在浏览器控制台执行：

```javascript
localStorage.removeItem('reviewDataCache');
localStorage.removeItem('reviewDataTimestamp');
location.reload();
```

---

## 7. 后续可考虑的优化方向

1. **分页加载**: 数据量大时改为分页 API，避免一次性加载全量数据
2. **增量同步**: 仅同步变更数据，而非全量刷新
3. **服务端预计算**: 在 MySQL 端完成 snake_case → camelCase 转换
4. **实时推送**: 使用 WebSocket 替代前端轮询，实现数据变更即时通知

---

## 8. 常见问题

| 问题 | 解决方案 |
|------|----------|
| 启动报错 `ImportError: No module named 'dbutils'` | 执行 `pip install dbutils` |
| 启动报错 `ImportError: No module named 'flask_compress'` | 执行 `pip install flask-compress` |
| 页面显示旧数据 | 清除浏览器缓存或手动清除 localStorage |
| 数据库连接池耗尽 | 检查是否有未关闭的连接，确保在 `finally` 块中调用 `connection.close()` |

---

*文档生成时间: 2026-04-04*