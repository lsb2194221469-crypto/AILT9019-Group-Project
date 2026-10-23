# 实现与接口说明

## 数据流程

1. `launch.py` 在 `127.0.0.1:8765` 启动标准库 HTTP 服务，随后打开浏览器。
2. `static/app.js` 把 PDF 字节提交到 `/api/upload`。`pypdf` 提取原文，`pdf_math.py` 使用 PyMuPDF 字形位置生成独立的公式阅读提示。
3. 服务将各页内容保存在内存，返回随机文档 ID。浏览器按文件名与内容哈希复用重复导入的同一 PDF，复用仅用于文件存储，以资料组 ID 管理分栏；生成前多次文件选择追加到当前草稿组。取消或无新增文件不创建新组，补选时先检查累计去重数量（最多 10），超限保留现有选择。已有关联测验的组追加新文件时复制为新草稿组，避免改变历史测验来源；原 PDF 链接使用本地 Blob URL。
4. 用户设置 `mcq/tf/short` 三个数量和可选主题，以随机任务编号提交到 `/api/jobs`（快速返回任务状态），由独立后台线程生成。页面通过 `GET /api/jobs/<id>` 取回状态与结果。旧的同步 `/api/generate` 接口保留兼容性。
5. `generate()` 选取讲义页，从本机 `config.json` 读取配置，在服务端调用兼容的 `chat/completions` 接口。原文最多 22,000 字符，公式提示另有最多 22,000 字符预算。
6. `validate_mixed()` 校验题型配额、去重、答案结构及引用匹配，只返回通过检查的题目。
7. 每次成功生成创建独立测验，关联到当前上传资料组。组内 PDF 联合出题，后端交错取页，并为多个 PDF 的重叠页码分配唯一内部引用 ID；通过引用校验后，再还原实际文件名和页码。浏览器通过 `format.js` 渲染公式。客观题按原始选项值计分；简答题展示参考答案供自评，原文引用保持文本。
8. `library.js` 将 PDF Blob、提取页、各资料组设置及每套题的答案/提交状态/错题筛选/原文展开状态保存到 IndexedDB。临时服务端文档 ID、Blob URL 和 API 配置不持久化。保存时先深拷贝快照，再在同一读写事务中读取最新记录，按 ID 合并本标签页相对上次保存发生的修改；不再用旧标签页的整个工作区覆盖数据库。删除通过 `deletedQuizIds` 墓碑集合持久化，合并取并集，旧页面不能恢复已删测验。删除仅影响所选整套练习及作答，保留源 PDF；资料组记录生成序号，删除后继续生成也不复用旧序号。刷新后恢复当前讲义及测验；服务端来源缓存失效时，生成接口返回 `document_expired`，前端重新读取已保存的 PDF 后重试一次，不重新调用已经成功完成的模型请求。

## 文件职责

| 文件 | 阅读重点 |
| --- | --- |
| `server.py` | `read_config` / `provider_request`：配置和云端通信；`extract_pdf`：文档解析；`question_counts` / `validate_mixed`：题目规则；`Handler`：HTTP 路由 |
| `pdf_math.py` | 根据较小字号与上下位移识别脚标，提示和引用分开保存，不推断普通 `x2` |
| `static/app.js` | 资料组分栏与分次补选、每组 PDF 的多套联合测验、独立作答状态、生成请求、提交评分和导出 |
| `static/platform.js` | 兼容普通 LAN HTTP 没有 SubtleCrypto/randomUUID 的环境；文件 SHA-256 用于去重，UUID 使用 getRandomValues |
| `static/library.js` | 当前浏览器 IndexedDB 事务内按记录合并、删除墓碑，保存队列由 `app.js` 管理 |
| `static/format.js` | `textContent` 输入、显式数学记号预处理、KaTeX autorender，禁止信任模型 HTML |
| `tests/` | API 请求和错误处理、题目与引用规则、混合题限制、PDF 脚标复现 |

## 本地 HTTP API

| 方法与路径 | 输入 | 输出/用途 |
| --- | --- | --- |
| `GET /api/health` | 无 | 本地服务健康状态 |
| `GET /api/models` | 无 | 本机配置的模型名称及状态，不返回密钥、不访问云端 |
| `GET /api/sample` | 无 | 明确标注的预生成示例 |
| `POST /api/upload` | PDF 原始字节，`Content-Type: application/pdf` | `{id, pages}`；页包含 `page/text/math_context` |
| `POST /api/jobs` | 下方 JSON + `job_id`（32–80 位随机编号） | HTTP 202，新任务；同编号/同请求重试返回已有任务，不重复调用模型 |
| `GET /api/jobs/<id>` | 随机任务编号 | queued/running/succeeded/failed，成功时附 result；无任务列表 |
| `POST /api/generate` | 下方 JSON（旧同步接口） | `{questions, requested_counts, actual_counts, notice, pages_used, sample}` |

```json
{
  "document_ids": ["PDF A 的上传 ID", "PDF B 的上传 ID"],
  "document_names": ["A.pdf", "B.pdf"],
  "model": "与本机配置一致的模型 ID",
  "counts": {"mcq": 2, "tf": 1, "short": 1},
  "topic": "可选主题"
}
```

每道题包含 `type/question/options/answer/explanation/page/quote`；资料组请求还包含 `source_name/source_id`，其中 `page` 为原 PDF 的实际页码。前端保存题目时，将临时服务端来源 ID 映射为本机文档 ID。`mcq` 有四个不同选项且答案等于其中一项；`tf` 答案为 `True` 或 `False`；`short` 的 `options` 为空。JSON 中数学反斜线需要转义，例如 `"\\(x^{2}\\)"`。

保留旧请求的单文档 `document_id` 与单题型 `type/count` 兼容路径；新界面发送 `document_ids/document_names/counts`。一组最多 10 份 PDF，组内全部参与选页；预览下拉框仅切换预览文件。

浏览器工作区 payload version 2 增加 `groups`，每组含 `documentIds/settings`，每套题通过 `groupId` 关联。`deletedQuizIds` 与资料组 `lastQuizNumber` 为兼容的可选字段，旧记录默认空集合并从已有练习标题计算序号。version 1 未记录历史选择批次，因此迁移时保留原来的单 PDF 分组，不猜测合并历史记录；答案和评分等保持不变。IndexedDB 的数据库结构版本无需升级。

## 边界与限制

- 默认服务只绑定回环地址；`launch.py --share` 显式绑定 IPv4 的 `0.0.0.0:8765`，允许发现的私有 IPv4/本机名称及回环 Host，并拒绝 Origin 与请求 Host 不一致的 POST。`/api/health` 包含共享模式和分享链接。共享服务沿用主机配置调用模型，不向客户端返回密钥；无登录门槛，能连入的局域网用户均可使用主机额度。不提供公网部署、用户账户或服务端数据库。浏览器本地 IndexedDB 存储测验库，不与 GitHub 或云端同步。
- 上传文件每份最大 15 MB、200 页；服务端最多缓存 10 份文档，之后淘汰最早一份。浏览器 PDF 分栏不受这个缓存数量限制，需要时自动恢复来源。每页原文和公式提示各截取最多 16,000 字符。
- 清除浏览器站点数据会删除本机 PDF 和测验记录；更换端口、主机名、浏览器或设备也会使用不同的存储。保存失败时提示导出备份，仍可在当前页面练习。
- 密钥在服务端使用；云端重定向不会携带凭证继续访问，错误提示不返回原始服务商错误内容。
- 引用匹配只验证文字出处，不能证明题目、推理和答案语义正确。
- 公式位置提示只恢复可识别的上下标，复杂公式、扫描件、丢失符号仍需核对，模型被要求跳过歧义内容。
- 内置 KaTeX 的 JS/CSS/WOFF2 字体在本机加载。样式应只作用于选项最外层 `> span`，避免影响 KaTeX 内部布局。
- 原始 PDF 不作为文件上传云端；被选取的文字和数学提示会发送到用户配置的服务商。

## 修改后如何验证

先运行 `python -m unittest discover -s tests -v`。涉及界面时，检查三种题型的混合数量、全零/超限状态、上传/生成失败提示、客观评分、简答自评、错题筛选、重练、JSON 导出，以及 390px 手机宽度下的公式和页面布局。公式检查应同时覆盖题干、选项、答案与解析，且保留引用原文。测验库还应检查同次两份 PDF 共用分栏且联合出题、之后上传另建分栏、同组生成多套测验、切换/刷新后的独立答案及评分、当前草稿补选去重、累计超限与损坏文件保留原选择、新建资料组时可复用已有文件、旧 version 1 记录迁移、生成失败不丢失历史、重练只重置当前套题，以及服务端来源缓存清空后的自动恢复。

## 公开网页入口

`public_host.py` 将相同后端绑定到 `127.0.0.1:8765`，启动固定版本且 SHA-256 校验通过的 cloudflared（Windows x64）连接 Cloudflare Quick Tunnel。解析到临时 HTTPS 域名后，只将该域名加入 Host 白名单，且仅允许对应 HTTPS Origin 访问。生成仍走主机 `read_config → provider_request`，不把凭证交给前端。

公开会话文件 `.public-session.json` 含随机的本机关闭令牌，不属于分发或 GitHub 内容。`stop_public.bat` 通过回环地址、127.0.0.1 Host 和私有令牌调用关闭接口，停止主机自己创建的隧道子进程。公开 Host 或无令牌请求不能关闭服务。HTTP 服务仍只提供固定的静态文件映射，不能读取配置及会话文件。

本地 `README.md` 与 `打开出题网页.md` 在新地址生成后更新；仓库发布由维护者同步。无账号 Quick Tunnel 的域名不持久，不应声称为固定托管地址。原文件上传、题目与 IndexedDB 逻辑不变；不同域名使用不同的浏览器记录。

历史保存和删除回归可用 `node tests/test_history_browser.cjs` 运行。需另装 Node.js 与 Playwright/Chrome（仅开发测试需要，普通用户不需要）；可通过 `LECTURE_LAB_PYTHON`、`LECTURE_LAB_PLAYWRIGHT`、`LECTURE_LAB_CHROME` 指定路径。该检查使用独立浏览器环境、合成 PDF 和模拟服务，既不读取 `config.json` 也不调用真实模型。

## 后台生成与页面恢复

浏览器在提交前将任务编号、资料组、设置和原始请求保存到 IndexedDB `tasks`，断网或提交响应丢失时重用同一编号。服务端在独立线程执行，两个执行槽、最多 16 个未完成任务；提交连接结束不会取消任务。任务编号也是获取结果的随机凭证，接口不列出其他任务。接口仍受 Host/Origin 检查保护，编号不能包含路径。

`generation_jobs.py` 将状态、请求摘要与成功结果原子写入私有 `.generation-jobs/`，不写入 API 配置、完整 PDF 或输入上下文；结果自身包含题目和引用。最多保留 100 条，结果 24 小时过期或容量受限时淘汰已结束记录，活动任务不会被淘汰。该目录被 Git 忽略，打包采用来源白名单也不会包含它。主机重启将未完成的旧任务标为失败，绝不自动重新调用模型。

页面挂起只暂停轮询；恢复可见、焦点、联网或 pageshow 时立即检查状态。初始化恢复 pending 任务。任务编号同时作为生成测验的 ID，重复取回不会追加第二套或覆盖已有作答；已删除的测验仍受删除墓碑保护。`library.js` 也合并任务记录，已结束状态不会被旧标签页写回 pending。主机睡眠/关机不能继续运算。

后台浏览器回归：`node tests/test_background_browser.cjs`，使用与历史回归相同的 Playwright/Python/Chrome 配置变量。测试冻结页面、生成中刷新、关闭页面后取回、离线恢复、丢失首次提交响应后的幂等重试；全部使用模拟模型。
