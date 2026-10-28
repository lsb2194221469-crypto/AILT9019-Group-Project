# Lecture Lab · AILT9019 Group 61

<!-- PUBLIC_ENTRY_START -->
## [▶ 打开出题网页](https://passed-sparc-motors-reference.trycloudflare.com)

访客点击上方链接即可上传 PDF、生成练习。无需下载项目、安装 Python 或填写 API Key。

出题使用项目主机的 API 额度。主机和外网服务须保持运行；临时地址重启后会变化。
<!-- PUBLIC_ENTRY_END -->

**上传课程 PDF，一次生成选择、判断和简答的混合练习，并查看答案、解析与原文出处。**

Lecture Lab is a local PDF-to-quiz application powered by a configurable DeepSeek / OpenAI-compatible API. 界面运行在自己的电脑，出题调用云端模型，无需部署网站或安装 Ollama。

访客使用仓库顶部的网页入口即可。下面的安装和 API 配置步骤只面向自行运行源码或维护主机的人。

当前入口是主机电脑通过临时 HTTPS 隧道提供的服务，不是永久托管网站。访客直接打开链接，不需要 GitHub 账号；仓库已公开，阅读和下载源码不需要仓库授权。只要请求到达这台主机，生成就使用主机配置的 API，访客不配置密钥。主机关机、睡眠、断网或服务/隧道停止时无法使用；隧道重启后网址会改变。主机已配置登录启动及 GitHub 自动更新：登录 Windows 且网络恢复后，会启动公开服务并把新地址更新到仓库首页。旧临时网址仍会失效，请回到 GitHub 首页点击新入口。即使能打开页面，API 余额不足、服务商故障、任务拥堵或 PDF 无可读取内容等情况仍可能导致生成失败。不能保证世界所有地区和网络都能访问。

2026-10-23 验证：两个全新、无登录和无密钥配置的浏览器会话，经当前公开 HTTPS 入口上传合成 PDF，实际调用主机 DeepSeek 分别生成选择/判断/简答各 1 道及判断 1 道，完成作答并验证刷新恢复。测试在主机上使用公开域名发起，覆盖桌面和手机尺寸，不等同于不同国家或真实手机的实机测试；独立网页读取工具未能访问该临时域名。详见 [验证记录](VALIDATION.md)及[本次测试结果](docs/PUBLIC_ACCESS_CHECK.json)。恢复后的新域名已通过三个香港节点的首页及后台健康接口检查，详情见 [香港检测](docs/HONG_KONG_CHECK.json)；[服务恢复与自动同步记录](docs/PUBLIC_RESTART_CHECK.json)说明了验证范围。

<!-- REPRODUCIBLE_EXAMPLE_START -->
## Reproduce the assessed core workflow

For course staff: download the two-page [example PDF](examples/math-notes.pdf), upload it through the real generation workflow, set **MCQ = 1, true/false = 1, short-answer = 1**, and leave the topic blank. Expect three supported questions, source references to the PDF, and answers that agree with its facts. The [reproduction guide](examples/README.md) provides the exact UI steps, expected answers, refresh/history checks and the [recorded live output](examples/expected-output.json).

After installing `requirements.txt`, run `python tools/reproduce_example.py` to check the saved result against the PDF **without an API key**. Expected: exit 0 and `passed: true`, with two input pages and one question of each type. This is a saved-output check, not a new generation call. To generate again with your configured API, run `python tools/reproduce_example.py --live --output .example-runs/latest.json`; this consumes provider quota. API output wording can vary, so check supported facts and citations rather than exact text.

The public application link at the top uses the project host's API while that host is online. A separate local installation follows the setup and configuration sections below. [Verification evidence](docs/MIDTERM_REPRODUCTION_CHECK.json) records the 25 October checks, including 38 passing existing unit tests and one real three-question generation. The older `sample.json` is a prewritten demo and does not demonstrate PDF generation.
<!-- REPRODUCIBLE_EXAMPLE_END -->


## 快速导航

- [安装与运行](#安装与运行)
- [API 配置](#api-配置)
- [主要功能](#主要功能)
- [项目结构](#项目结构)
- [实现与接口说明](docs/ARCHITECTURE.md)
- [测试记录与限制](VALIDATION.md)
- [Windows 中文使用说明](使用说明.txt)
- [第三方组件与许可](THIRD_PARTY.txt)

## 安装与运行

### Windows：从本仓库源码启动

前置条件：**Python 3.11 或以上版本**（安装时勾选 Add Python to PATH），首次安装依赖及调用 API 时需要联网。普通浏览器即可，不需要 Node.js、LaTeX 或本地模型。

1. 点击仓库的 **Code → Download ZIP** 并解压；也可以使用 Git：

   ```powershell
   git clone https://github.com/lsb2194221469-crypto/AILT9019-Group-Project.git
   cd AILT9019-Group-Project
   ```

2. 双击 `configure.bat`，在记事本打开的 `config.json` 中填写 API 配置并保存。密钥填写在本地文件里，网页不提供密钥输入框。
3. 双击 `start.bat`。首次启动会创建 `.venv` 并安装依赖，随后自动打开 [本地页面](http://127.0.0.1:8765)。保持启动窗口打开。
4. 上传 PDF（每组最多 10 份，可分多次选择并联合出题），分别拖动三个题量滑条，点击“生成我的练习”。可先将每种题型设为 1 道进行尝试。
5. 选好第一份 PDF 后，点击讲义区域的“继续选择”补选其他文件，旁边的“清空”可重置当前 PDF 选择，保留历史测验及其作答。前面选好的文件会保留；重复文件不会再次加入。左侧“我的测验”按出题资料组显示分栏：生成前分多次选入 A、B 两份 PDF 共用一个分栏；点击“创建练习”后选入 C，再生成则新增另一个分栏。分栏列出本组全部 PDF 及生成的各套练习；点击分栏或练习即可查看。点击“再生成一套”使用本组全部文件继续出题；点击“创建练习”开始下一组。已有测验和各自的作答进度会保留。
6. 生成任务提交后可以切换窗口、刷新或关闭标签页；在相同网址重新打开会自动取回结果，不必再次点生成。主机服务须保持运行，不能关机或睡眠。后台结果保留 24 小时，浏览器成功取回后按普通测验长期保存在本机。
7. 每套练习旁的垃圾箱按钮，或当前测验工具栏的“删除测验”，可删除指定测验及其作答；确认前可取消，PDF 和其他测验不会被删除。重复生成会新增独立练习，多个标签页保存时会合并历史记录。更新后请刷新所有打开的项目页面。

不填写 API 也可以点击“体验示例测验”，体验预先编写的示例；示例不使用上传的 PDF，不能用于验证 API 连接。

### 已有 Windows 便携包

完整便携包包含 `runtime/`，解压后直接运行 `start.bat`，无需自行安装 Python。**GitHub 的 Download ZIP 是源码包，不包含运行时**。维护者可按下文命令生成便携包。

### 主机：让其他人从 GitHub 直接打开网页

访客只需点击仓库顶部“打开出题网页”，无需下载程序、安装依赖或填写 API Key；可跨网络访问。当前服务由维护者电脑运行，出题统一消耗主机配置的 API 额度。

- 主机关闭旧的本地启动窗口，再双击 `public.bat`；首次会下载并校验官方 Cloudflare 隧道程序，后续复用。
- 把启动窗口打印的 `PUBLIC_URL` 发布到 GitHub 首页入口；本地 README 与 `打开出题网页.md` 会自动更新，但重启后仍需把变化同步到 GitHub。
- 主机保持开机并运行服务。`stop_public.bat` 可关闭公开服务及对应隧道；停止操作仅接受本机私有令牌。
- 隧道提供临时 HTTPS 地址，不需要访客与主机处于同一网络，也不需要访客安装隧道工具。它没有持续在线保证，每次重启地址会变化；固定网址和长期托管需要另行配置。
- 公网模式仅绑定本机回环端口，由隧道接入。密钥只在主机配置文件中，不放进 GitHub、启动文件或浏览器。

### 主机：登录后自动启动与更新 GitHub

维护者在 Windows 便携目录运行 `powershell -NoProfile -ExecutionPolicy Bypass -File tools/install_public_startup.ps1` 可安装当前用户的登录启动快捷方式。该安装已在维护者本机完成；普通访客无需执行。电脑必须保留此项目目录和 Python 运行时，并在 Git Credential Manager 中保持对应 GitHub 仓库的可写登录状态。程序通过 Git 凭据助手在内存中取得凭据，不复制到项目、网页或 GitHub；DeepSeek API 配置仍只保存在主机。

`maintain_public.py` 在登录后后台运行，自动启动或恢复公开服务；发现新地址后只更新远端 `README.md` 的入口区块及 `打开出题网页.md` 的链接，保留远端其他修改，拒绝强制覆盖并重试并发冲突。相同地址不产生重复提交；网络或登录失败时记录状态并重试。主机状态见私有 `.public-maintainer.json`，主机日志见 `.public-host.log`，均不通过 HTTP 提供、不上传仓库、不进入便携包。手动 `stop_public.bat` 会暂停维护进程；下次运行 `public.bat` 恢复。彻底取消自动启动可运行上述安装命令并加 `-Remove`。

这是**登录后自动启动**，不是未登录 Windows 时运行的系统服务。关机和睡眠期间不可用，重启后恢复也不是瞬时的；GitHub 凭据过期、撤权、仓库保护规则或网络异常会阻止更新。仓库已公开，其他人可以直接从 GitHub 首页取得最新地址；阅读仓库和使用网站均不需要 GitHub 账号或仓库授权。香港节点检测记录见 [HONG_KONG_CHECK.json](docs/HONG_KONG_CHECK.json)，网络节点可达不等于所有香港运营商或所有用户均已验证。

### 同一局域网共享你的 API 额度

关闭原来的启动窗口，双击 `share.bat`（或运行 `python launch.py --share`）。启动窗口会列出 `Same-network link: http://你的局域网IP:8765`，其他人连接同一 Wi-Fi/局域网后打开该链接即可使用网页，无需安装程序或填写 API Key。Windows 如提示防火墙访问，允许该程序在你信任的网络通信。

所有出题请求由你的电脑调用本机 `config.json` 中的模型和密钥，API 费用记在你的账户。密钥不会发给浏览器，也不会提交到 GitHub。共享模式没有登录门槛，能访问此服务的同网用户均可调用出题。你的电脑和启动窗口需要保持运行。

这是局域网共享入口，跨网络或公网访问仍需另行配置。本机 `start.bat` 继续只监听回环地址；`share.bat` 显式启用 IPv4 共享。若本地模式已占用端口，共享入口会提示关闭旧窗口，避免误把旧服务当成共享服务。

各浏览器仍分别保存 PDF、测验与答案，不会自动互相共享记录。通过局域网 IP 与通过 `127.0.0.1` 访问属于不同站点存储。`platform.js` 为局域网普通 HTTP 页面补充文件去重哈希和文档 ID 支持。

### 手动运行 / macOS / Linux

在项目根目录依次执行，Windows 使用 `python`，macOS/Linux 通常使用 `python3`：

```sh
python -m venv .venv
```

激活虚拟环境：

```powershell
# Windows PowerShell
.venv\Scripts\Activate.ps1
```

```sh
# macOS / Linux
source .venv/bin/activate
```

```sh
python -m pip install -r requirements.txt
```

将 `config.example.json` 复制为 `config.json`，按下节修改后运行：

```sh
python launch.py
```

如果浏览器没有自动打开，手动访问 [http://127.0.0.1:8765](http://127.0.0.1:8765)。Windows 便携包和浏览器流程已检查；macOS/Linux 启动方式未进行实机验证。

## API 配置

配置模板见 [`config.example.json`](config.example.json)：

```json
{
  "api_key": "在自己的电脑填写真实密钥",
  "base_url": "https://api.deepseek.com",
  "model": "deepseek-flash"
}
```

- `api_key`：服务商签发的 API Key。保留两侧英文双引号，不要提交到 GitHub。
- `base_url`：HTTPS API 基础地址，不是聊天网页，也不要附加 `/chat/completions`。
- `model`：服务商支持的确切模型 ID。模板值只是默认配置；如果使用 Cherry Studio，请核对其中同一服务商的接口地址及模型名称。

保存后点击网页的“重新读取配置”。该状态只表示配置能被读取；双击 `check_connection.bat` 或在已激活的环境运行 `python check_connection.py`，可通过模型列表请求检查连接。模型列表检查不保证出题接口或 JSON 模式可用。

`config.json` 已被 Git 忽略，HTTP 服务也不会提供此文件。密钥以明文保存在本机，分享项目时只分享空白模板。

## 主要功能

| 功能 | 行为 |
| --- | --- |
| PDF 导入 | 每组最多 10 份文字型 PDF，每份最大 15 MB、200 页；可分多次选择、自动去重 |
| 测验分栏 | 按出题资料组分栏；同组 PDF 联合出题，多次生成保留全部测验 |
| 本机记录 | 切换讲义、测验或刷新页面后，恢复答案、评分、错题筛选和原文展开状态 |
| 混合题型 | 选择、判断、简答各有独立滑条，每种 0–12 道，总计 1–24 道 |
| 主题筛选 | 优先选取包含主题关键词的讲义页 |
| 公式显示 | 题干、选项、答案、解析使用本地 KaTeX，支持上下标、分数、根号等 |
| 原文依据 | 检查引用与提取原文是否匹配，并保留 PDF 文件名及实际页码；可打开 PDF 原页核对 |
| 练习与复习 | 客观题自动计分、简答题自评、错题筛选、重新练习 |
| 导出 | 下载包含题目、答案、解析与出处的 JSON |

后台任务结果临时存放在主机 `.generation-jobs/`，包含题目与引用，不含 API 密钥；该目录不上传 GitHub、不进入便携包。更换网址或浏览器不能自动找回原站点的任务编号。主机重启会中止尚未完成的任务，不会自动再次扣费调用模型。

PDF 在本机解析。生成时会将选中的提取文字、公式阅读提示、文件名、页码与主题发送到配置的模型服务；不会上传原 PDF 文件。云端 API 可能收费，按服务商账户计费，本项目无需网站托管费用。

生成前可反复补选文件，取消、重复选择或读取失败不会清掉已选文件。超过每组 10 份时拒绝该次补选并保留原选择。如果给已生成过测验的资料组补选文件，会将原文件和补选文件组成新组，已有测验的出处和作答保持不变。

PDF、测验及各自的作答记录保存在当前浏览器的 IndexedDB 中；刷新或停止并重新启动本地服务后仍可恢复，继续出题时会按需重新解析已保存的 PDF。记录不跨浏览器、设备或网址同步，清除站点数据会删除记录；重要测验可导出 JSON 备份。浏览器保存不可用时会提示，本页仍可继续使用。API Key 只在本机配置文件中，不进入浏览器数据库。

公式问题有两个处理层：PDF 字形位置用于补充可辨认的上下标；模型输出通过 LaTeX + KaTeX 排版。不会把所有 `x2` 自动改成平方。扫描件需要先 OCR，复杂公式和模型答案仍应核对原 PDF。原文预览及引用保持原始提取文字，避免将美化后的内容当作原文证据。

## 项目结构

```text
.
├── server.py              # 本地 HTTP API、PDF 提取、模型请求和题目校验
├── generation_jobs.py     # 后台生成、同任务去重与私有结果缓存（24 小时）
├── pdf_math.py            # 根据 PDF 字形位置补充上下标阅读提示
├── launch.py              # 启动本地服务、检查端口、打开浏览器
├── start.bat              # 本机运行入口，支持便携运行时或虚拟环境
├── share.bat              # 同一局域网共享入口，使用主机的 API 账户
├── public.bat             # 主机公开网页入口；访客只点 GitHub 网页链接
├── public_host.py         # 校验官方隧道、管理公开服务与关闭操作
├── stop_public.bat        # 关闭本机公开服务及隧道
├── configure.bat          # 在记事本编辑本机配置
├── check_connection.py    # API 连接检查，不发送讲义
├── config.example.json    # 可公开分享的空白配置模板
├── requirements.txt       # 固定版本的 Python 依赖
├── static/
│   ├── index.html         # 页面结构
│   ├── app.js             # 多 PDF / 多测验状态、生成、作答、评分、导出
│   ├── library.js         # 浏览器本机记录的 IndexedDB 读写
│   ├── platform.js        # 局域网 HTTP 的 PDF 哈希及随机 ID 兼容
│   ├── format.js          # 数学格式预处理和安全渲染
│   ├── style.css          # 桌面及手机样式
│   └── vendor/katex/      # 内置公式引擎、字体及许可证
├── tests/                 # 离线单元测试，不调用真实模型
├── docs/ARCHITECTURE.md    # 数据流程、接口与开发说明
└── tools/build_portable.py # 构建 Windows x64 便携包
```

阅读代码建议：先看 `static/index.html` 和 `static/app.js` 理解用户流程，再看 `server.py` 的 `extract_pdf → generate → validate_mixed`；数学相关逻辑见 `pdf_math.py` 和 `static/format.js`。

## 测试与打包

安装依赖后，在项目根目录执行：

```sh
python -m unittest discover -s tests -v
```

目前 38 项单元测试通过，覆盖引用、题型配额、模型返回格式、API 异常、上下标提取等。桌面/手机浏览器检查还覆盖同次多 PDF 联合出题与文件归属、分多次补选与新资料组分栏、旧记录迁移、重复生成、独立进度/评分、刷新恢复、来源缓存失效恢复、生成失败后保留历史记录，以及公式排版。浏览器检查使用模拟接口，不消耗模型额度；另通过公开 HTTPS 入口上传合成 PDF 并调用真实 DeepSeek 生成 1 道题、完成作答；这是链路检查，不是出题质量基准评测。输出解析修复后，还直接调用已配置的 DeepSeek，用合成 PDF 一次生成选择、判断、简答各 1 道，全部通过引用校验。

如本机装有 Node.js，可额外检查脚本语法：

```sh
node --check static/app.js
node --check static/library.js
node --check static/format.js
```

构建 Windows x64 便携包（构建脚本只依赖 Python 标准库，需要联网下载官方运行时及依赖）：

```sh
python tools/build_portable.py
```

输出 `dist/Lecture-Lab-DeepSeek-Windows.zip`，内含空白配置，不包含开发者的真实密钥。已有完整 `runtime` 时可使用 `python tools/build_portable.py --runtime runtime` 跳过下载。

## 常见问题

- **更新后仍显示旧页面**：关闭旧的启动窗口，重新运行 `start.bat`，浏览器按 Ctrl+F5，再重新生成题目。
- **8765 端口占用**：关闭之前运行的项目实例或占用端口的应用，再启动。
- **PDF 无法读取**：使用未加密、有可选择文字的 PDF；扫描件先做 OCR。
- **生成数量少于设置**：界面会显示实际/请求数量；材料不足或题目未通过结构与引用检查时会少生成。
- **模型返回空内容、JSON 无效或输出达到长度限制**：程序按题量预留较大的输出空间，保留配置中的模型与默认思考设置。空内容或无法解析的回复最多自动重试一次，可能增加 API 用量；若截断回复中已有完整题目，则只保留通过结构与原文引用校验的题目并提示数量不足。不会把思考内容当作题目，也不会改写原文或猜补损坏的公式。重试仍失败时会显示具体原因，可减少题量后重新生成。
- **API 报错**：核对密钥、余额、HTTPS 地址和模型 ID；第三方网关需支持兼容的聊天接口及 JSON 模式。

本仓库保留历史原型分支，`main` 为当前本地 API 版本。第三方组件及其许可证见 [THIRD_PARTY.txt](THIRD_PARTY.txt)。
