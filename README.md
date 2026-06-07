# 个人版股票 F10 研究终端

当前实现 Phase 1 + Phase 2 的本地 MVP：

- A 股全市场代码、名称和模糊搜索
- 最近查看（浏览器本地存储，与股票池分离）
- 真实行情详情
- 日/周/月/年 K、成交量、MA5、MA10、MA20、BBI
- 1年、3年、5年、10年、上市以来时间范围
- F10 式年报与单季度财务对比、趋势和变化摘要
- 每个数据模块独立显示加载和错误状态

## 目录

```text
backend/   FastAPI + AkShare
frontend/  React + TypeScript + Tailwind + lightweight-charts
```

## 启动后端

建议使用 Python 3.9 及以上版本。

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8006
```

后端地址：<http://localhost:8006>

接口文档：<http://localhost:8006/docs>

## 启动前端

需要 Node.js 18 及以上版本和 npm。

```bash
cd frontend
npm install
npm run dev
```

前端地址：<http://localhost:5173>

Vite 会把 `/api` 请求代理到 `http://127.0.0.1:8006`。

## 数据说明

- 股票池：`akshare.stock_info_a_code_name()`
- 实时行情：`akshare.stock_zh_a_spot_em()`
- 日 K：`akshare.stock_zh_a_hist()`
- 财务摘要：`akshare.stock_financial_abstract()`
- 页面不会使用 mock 数据。
- 外部接口失败时，API 会返回实际失败原因，前端对应模块会单独显示错误。

## 公网部署

推荐使用：

```text
Vercel：React / Vite 前端
Render：FastAPI 后端
```

浏览器继续通过同域 `/api/*` 请求数据。Vercel 将这些请求转发到
Render，因此不需要修改 React 页面或 FastAPI 业务接口。

### 1. 部署 Render 后端

1. 将项目推送到 GitHub、GitLab 或 Bitbucket。
2. 在 Render 控制台选择 `New > Blueprint`。
3. 连接项目仓库。Render 会读取仓库根目录的 `render.yaml`。
4. Blueprint 使用以下配置：

```text
Root Directory: backend
Build Command: pip install -r requirements.txt
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health Check Path: /api/health
Python: 3.11.11
```

5. 等待部署完成，并访问：

```text
https://你的服务名.onrender.com/api/health
```

正常响应应为：

```json
{"status":"ok"}
```

Render 默认文件系统不是永久存储。服务重启或重新部署后，本地 JSON
缓存和已下载 PDF 可能丢失，但系统会在后续请求中重新获取数据。

### 2. 填写 Render 公网地址

打开 `frontend/vercel.json`，将：

```text
https://your-render-service.onrender.com
```

替换为实际 Render 服务地址。保留后面的 `/api/:path*`，例如：

```json
{
  "source": "/api/:path*",
  "destination": "https://stock-research-terminal-api.onrender.com/api/:path*"
}
```

### 3. 部署 Vercel 前端

1. 在 Vercel 中导入同一个代码仓库。
2. 将项目的 `Root Directory` 设置为 `frontend`。
3. Framework Preset 选择 `Vite`。
4. Build Command 使用 `npm run build`。
5. Output Directory 使用 `dist`。
6. 部署后访问 Vercel 提供的 `https://xxx.vercel.app` 地址。

`frontend/vercel.json` 包含两类规则：

- `/api/*` 转发到 Render FastAPI。
- 其他路径回退到 `index.html`，保证 SPA 地址刷新后仍可打开。

### 4. 部署验证

依次检查：

```text
/api/health
/api/search-stocks?q=000988
股票搜索、行情、K线、财务表
市场要闻
报告列表与摘要
```

### 本地开发

公网部署配置不会改变现有本地开发方式：

```bash
# 后端
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8006

# 前端
cd frontend
npm run dev
```

本地 Vite 仍将 `/api` 代理到 `http://127.0.0.1:8006`。
`render.yaml` 只由 Render 使用，`frontend/vercel.json` 只由 Vercel 使用。
