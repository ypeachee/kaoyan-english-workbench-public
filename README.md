# 考研英语工作台

**在线体验（Netlify 自动部署）：** <https://effervescent-alfajores-83f951.netlify.app/><br>
**GitHub Pages 镜像：** <https://ypeachee.github.io/kaoyan-english-workbench-public/>

一个**单页、静态、本地优先**的考研英语练习工作台：阅读练习、逐题解析、长按/双击查词、生词本、错题本、统计、本地记忆、JSON 导入导出、可选云同步与 PWA 离线。

> **公开版已内置完整题库。**<br>
> 本站直接提供 **148 篇真题、740 道题**，打开网页后自动载入，不需要在手机上下载或导入 JSON。另有 2 篇原创示例用于演示。

---

## 1. 已实现功能

| 模块 | 能力 |
|---|---|
| 工作台 | 今日目标、累计正确率、连续天数、最近练习、20 年计划进度 |
| 题库 | 内置 **148 篇真题 / 740 题** + 2 篇原创示例；按考试、年份、状态和关键词筛选 |
| 练习 | 阅读分栏、计时、选项作答、提交判分、逐题解析 |
| 查词 | 手机长按、电脑双击文章/题干/选项中的单词；本地词库 + MyMemory 在线翻译；可加入生词本 |
| 生词本 | 搜索、朗读、删除、导出 JSON；随完整备份迁移 |
| 错题本 | 自动收集错题，显示“你选 vs 正确答案”，一键回本篇重做 |
| 统计 | 完成篇数、正确率、答题数、连续天数、近 7 天柱状图和下一步建议 |
| 本地记忆 | 记录上次篇目与进度，下次打开可继续 |
| 云同步 | 可选 Supabase；同一同步码跨设备合并进度、生词与记忆 |
| 数据 | localStorage 自动保存；导出题库/进度/完整备份；JSON 导入 |
| PWA | 可添加到桌面，静态资源与题库离线缓存 |
| 隐私 | 无账号、无追踪、无广告；在线查词只发送当前单词，不发送文章 |

---

## 2. 题库与手机使用

线上版本会自动请求 `data/real-exams.json`。打开题库页后，应显示：

```text
共 150 篇 · 已载入 148 篇真题（2007–2026） · 内置示例可直接练
```

其中 150 篇包含 148 篇真题和 2 篇原创示例。

手机上不需要额外下载题库：

1. 用手机浏览器打开 Netlify 地址；
2. 进入「题库」；
3. 等待“已载入 148 篇真题”；
4. 可直接选题作答。

如果手机仍显示旧版或题库为空，请关闭页面后重新打开，或在浏览器中强制刷新。PWA 已使用 Service Worker 缓存题库，首次载入后断网也可继续使用。

仍然保留 JSON 导入功能，适合导入自定义题库或恢复备份：

1. 打开「题库」；
2. 点击「导入题库」；
3. 选择 JSON 文件，或把 JSON 粘贴到文本框；
4. 点击「导入并保存」。

支持的格式：

```json
{ "papers": [ { "id": "y2013-t3", "passage": "...", "questions": [] } ] }
```

也支持单篇 paper 对象，以及包含 `bank`、`progress`、`vocab`、`memory` 的完整备份。

---

## 3. 本地运行

### 方式一：直接打开

双击 `index.html`。示例练习和本地存储可用，但浏览器不允许 `file://` 自动读取题库，也可能无法启用 Service Worker/PWA。

### 方式二：本地 HTTP 服务（推荐）

```bash
python -m http.server 8080
```

浏览器打开 <http://localhost:8080>，题库会自动载入。

---

## 4. 当前生产部署

- **Netlify 站点**：<https://effervescent-alfajores-83f951.netlify.app/>
- **GitHub 源仓库**：`ypeachee/kaoyan-english-workbench-public`
- **部署分支**：`main`
- **构建命令**：无
- **发布目录**：仓库根目录（`.`）
- **自动部署**：每次推送或合并到 `main` 后，Netlify 会自动构建并发布最新提交
- **配置入口**：Netlify → **Project configuration → Developer settings → Continuous deployment → Repository → Link repository**

该连接已于 **2026-11-20** 验证：Netlify 成功从 GitHub 自动发布，线上 `app.js` 与 `main` 分支内容一致，页面和题库可正常加载。

### GitHub Pages

公开代码仓库也可以直接启用 GitHub Pages：

- Source：`Deploy from a branch`
- Branch：`main`
- Folder：`/ (root)`

---

## 5. 目录结构

```text
.
├─ index.html                 # 单页应用外壳
├─ styles.css                 # 设计系统与响应式样式
├─ app.js                     # 路由、练习、查词、题库加载、导入导出、同步
├─ sw.js                      # PWA 离线缓存
├─ manifest.webmanifest
├─ data/
│  ├─ plan.js                 # 2007–2026 计划骨架
│  ├─ demo.js                 # 2 篇公开示例
│  ├─ dict.js                 # 高频考研词本地词库
│  └─ real-exams.json         # 148 篇真题 / 740 题
├─ docs/                      # 导入模板与配置说明
├─ supabase/schema.sql        # 可选云同步数据库结构
├─ .github/workflows/ci.yml   # 语法、题库数量与示例检查
├─ netlify.toml
├─ vercel.json
└─ _headers
```

---

## 6. 隐私与数据

- 学习进度默认保存在浏览器 `localStorage`。
- 在线查词只发送当前单词到 MyMemory。
- 邮件反馈通过本机邮件客户端发送。
- 清除浏览器站点数据会同时清空本地进度，请定期导出备份。
- Supabase 云同步为可选功能，需要使用者自行创建项目并填写配置。

---

## 7. CI 检查

GitHub Actions 会检查：

- `app.js` 是否通过 JavaScript 语法检查；
- `data/real-exams.json` 是否存在且可以正常解析；
- 真题是否为 148 篇、740 题；
- 每篇真题是否包含 `id`、正文和题目；
- 公开示例是否可读取；
- `docs` 下的 JSON 是否有效。

---

## 8. 内容与许可

- **程序代码**：MIT License。
- **真题文章、题目与解析**：权利归原权利人所有；禁止商用或用于训练数据转售。
- 示例文章为项目自建内容，仅用于演示功能。
- 使用题库即表示使用者自行承担相应的内容使用责任。

---

## 9. 设计取舍

- **单页 + 原生 JS**：零构建、低依赖，任何静态托管都能运行。
- **题库自动载入**：手机上打开即可用，不要求用户寻找并导入文件。
- **本地优先**：断网可用，不把学习记录默认交给第三方。
- **计划与题库分离**：题库文件独立加载，方便缓存、更新和导入自定义内容。
- **查词本地优先**：内置词库 + 在线兜底，只发送单个单词。
- **静态自动部署**：GitHub `main` 推送后由 Netlify 自动发布。