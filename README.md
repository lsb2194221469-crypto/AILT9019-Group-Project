# Lecture Lab · AILT9019 Group 61

**上传课程 PDF，一次生成选择、判断和简答的混合练习，并查看答案、解析与原文出处。**

Lecture Lab is a local PDF-to-quiz application powered by a configurable DeepSeek / OpenAI-compatible API. 界面运行在自己的电脑，出题调用云端模型，无需部署网站或安装 Ollama。

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
4. 上传 PDF（同次最多选择 10 份，合为一组联合出题），分别拖动三个题量滑条，点击“生成我的练习”。可先将每种题型设为 1 道进行尝试。
5. 左侧“我的测验”按每次上传的资料组显示分栏：同次上传 A、B 两份 PDF 共用一个分栏，稍后上传 C 则新增另一个分栏。分栏列出本组全部 PDF 及生成的各套练习；点击分栏或练习即可查看。点击“再生成一套”使用本组全部文件继续出题；点击“创建练习”开始下一组。已有测验和各自的作答进度会保留。

不填写 API 也可以点击“体验示例测验”，体验预先编写的示例；示例不使用上传的 PDF，不能用于验证 API 连接。

### 已有 Windows 便携包

完整便携包包含 `runtime/`，解压后直接运行 `start.bat`，无需自行安装 Python。**GitHub 的 Download ZIP 是源码包，不包含运行时**。维护者可按下文命令生成便携包。

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
| PDF 导入 | 每次最多 10 份文字型 PDF，每份最大 15 MB、200 页；同次选择合为一组 |
| 测验分栏 | 按上传批次分组；同组 PDF 联合出题，多次生成保留全部测验 |
| 本机记录 | 切换讲义、测验或刷新页面后，恢复答案、评分、错题筛选和原文展开状态 |
| 混合题型 | 选择、判断、简答各有独立滑条，每种 0–12 道，总计 1–24 道 |
| 主题筛选 | 优先选取包含主题关键词的讲义页 |
| 公式显示 | 题干、选项、答案、解析使用本地 KaTeX，支持上下标、分数、根号等 |
| 原文依据 | 检查引用与提取原文是否匹配，并保留 PDF 文件名及实际页码；可打开 PDF 原页核对 |
| 练习与复习 | 客观题自动计分、简答题自评、错题筛选、重新练习 |
| 导出 | 下载包含题目、答案、解析与出处的 JSON |

PDF 在本机解析。生成时会将选中的提取文字、公式阅读提示、文件名、页码与主题发送到配置的模型服务；不会上传原 PDF 文件。云端 API 可能收费，按服务商账户计费，本项目无需网站托管费用。

PDF、测验及各自的作答记录保存在当前浏览器的 IndexedDB 中；刷新或停止并重新启动本地服务后仍可恢复，继续出题时会按需重新解析已保存的 PDF。记录不跨浏览器、设备或网址同步，清除站点数据会删除记录；重要测验可导出 JSON 备份。浏览器保存不可用时会提示，本页仍可继续使用。API Key 只在本机配置文件中，不进入浏览器数据库。

公式问题有两个处理层：PDF 字形位置用于补充可辨认的上下标；模型输出通过 LaTeX + KaTeX 排版。不会把所有 `x2` 自动改成平方。扫描件需要先 OCR，复杂公式和模型答案仍应核对原 PDF。原文预览及引用保持原始提取文字，避免将美化后的内容当作原文证据。

## 项目结构

```text
.
├── server.py              # 本地 HTTP API、PDF 提取、模型请求和题目校验
├── pdf_math.py            # 根据 PDF 字形位置补充上下标阅读提示
├── launch.py              # 启动本地服务、检查端口、打开浏览器
├── start.bat              # Windows 运行入口，支持便携运行时或虚拟环境
├── configure.bat          # 在记事本编辑本机配置
├── check_connection.py    # API 连接检查，不发送讲义
├── config.example.json    # 可公开分享的空白配置模板
├── requirements.txt       # 固定版本的 Python 依赖
├── static/
│   ├── index.html         # 页面结构
│   ├── app.js             # 多 PDF / 多测验状态、生成、作答、评分、导出
│   ├── library.js         # 浏览器本机记录的 IndexedDB 读写
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

目前 17 项单元测试通过，覆盖引用、题型配额、模型返回格式、API 异常、上下标提取等。桌面/手机浏览器检查还覆盖同次多 PDF 联合出题与文件归属、不同上传批次分栏、旧记录迁移、重复生成、独立进度/评分、刷新恢复、来源缓存失效恢复、生成失败后保留历史记录，以及公式排版。浏览器检查使用模拟接口，不消耗模型额度；本次同步未验证真实 API 的生成质量。

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
- **API 报错**：核对密钥、余额、HTTPS 地址和模型 ID；第三方网关需支持兼容的聊天接口及 JSON 模式。

本仓库保留历史原型分支，`main` 为当前本地 API 版本。第三方组件及其许可证见 [THIRD_PARTY.txt](THIRD_PARTY.txt)。
