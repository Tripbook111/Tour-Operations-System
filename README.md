# 入境游管理系统 - 部署指南

## 系统简介

本系统已升级为多人协作版，支持：
- 多人同时在线使用（共享同一份数据）
- 用户登录认证（每人独立账号）
- 数据自动同步（每15秒刷新）
- 版本冲突检测（防止互相覆盖）

## 本地测试

```bash
cd tour-system-cloud
npm install
node server.js
```
访问 http://localhost:3000 ，用 admin / admin123 登录。

---

## 部署到 Render（推荐）

Render 提供免费的 Node.js 托管，适合4-5人小团队。

### 步骤一：上传代码到 GitHub

1. 在 GitHub 创建一个新仓库（如 `tour-system`）
2. 将 `tour-system-cloud` 目录下的所有文件上传到该仓库
   ```
   tour-system-cloud/
   ├── server.js
   ├── package.json
   ├── .gitignore
   └── public/
       └── index.html
   ```

### 步骤二：在 Render 创建 Web Service

1. 打开 https://render.com ，用 GitHub 账号注册/登录
2. 点击 **New +** → **Web Service**
3. 连接你的 GitHub 仓库
4. 填写配置：
   - **Name**: `tour-system`（随意）
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free`（免费版）
5. 添加环境变量（可选但推荐）：
   - **Key**: `JWT_SECRET` → **Value**: 随便填一串长密码（如 `my-secret-key-2026`）
   - 这会让登录 token 更安全，且重启后不失效
6. 点击 **Create Web Service**

### 步骤三：等待部署完成

- Render 会自动安装依赖并启动服务
- 部署完成后，你会得到一个公网地址，如：`https://tour-system-xxxx.onrender.com`
- **把这个地址发给你的4个同事**，他们打开就能用

### 步骤四：初始化系统

1. 打开部署地址，用 **admin / admin123** 登录
2. 进入「数据管理」→ 点击「注入演示数据」体验功能
3. 在「数据管理」→「用户管理」添加4个同事的账号
4. **重要**：修改 admin 密码（在「数据管理」→「修改密码」）

### ⚠️ Render 免费版限制

- **数据持久性**：免费版重启后数据可能丢失。建议每天导出一次备份。
- **休眠**：15分钟无访问会自动休眠，首次访问需等待约30秒唤醒。
- **解决方案**：如需数据持久化，升级到 Starter 计划（$7/月），并添加 Persistent Disk。

---

## 部署到其他平台

### Railway（推荐替代）

Railway 也提供免费额度，且支持持久化存储：

1. 打开 https://railway.app
2. **New Project** → **Deploy from GitHub repo**
3. 选择你的仓库，Railway 会自动识别 Node.js 项目
4. 添加环境变量 `JWT_SECRET`
5. 部署完成后获取公网地址

### 传统 VPS（阿里云/腾讯云）

如果你有云服务器：

```bash
# 1. 在服务器上安装 Node.js 18+
# 2. 上传项目文件
# 3. 安装依赖并启动
cd tour-system-cloud
npm install
JWT_SECRET=your-secret-key node server.js
# 4. 用 nginx 反向代理到 3000 端口
```

推荐用 PM2 保持服务运行：
```bash
npm install -g pm2
pm2 start server.js --name tour-system
pm2 startup
pm2 save
```

---

## 使用说明

### 管理员操作

1. **添加用户**：数据管理 → 用户管理 → 添加用户
2. **注入演示数据**：数据管理 → 注入演示数据（仅管理员可见）
3. **修改密码**：数据管理 → 修改密码

### 普通成员操作

- 登录后正常使用所有团组管理、报账功能
- 数据自动同步（每15秒）
- 如果看到顶部黄色提示条，说明有人修改了数据，点击刷新即可

### 数据备份

- 定期在「数据管理」→「导出全部数据」保存 JSON 备份
- 如需恢复，用「导入数据」功能上传备份文件

---

## 技术架构

```
浏览器 (4个同事)
    ↓ HTTP API (JWT认证)
Express 服务器 (Node.js)
    ↓ 文件读写
store.json (JSON文件存储)
```

- **前端**：纯 HTML + CSS + JS（无框架依赖）
- **后端**：Express + JWT + bcryptjs
- **存储**：JSON 文件（适合小团队，可升级为数据库）
- **同步**：15秒轮询 + 乐观锁版本控制
