# 实现与接口说明

## 数据流程

1. `launch.py` 在 `127.0.0.1:8765` 启动标准库 HTTP 服务，随后打开浏览器。
2. `static/app.js` 把 PDF 字节提交到 `/api/upload`。`pypdf` 提取原文，`pdf_math.py` 使用 PyMuPDF 字形位置生成独立的公式阅读提示。
3. 服务将各页内容保存在内存，返回随机文档 ID。浏览器的原 PDF 链接使用本地 Blob URL。
4. 用户设置 `mcq/tf/short` 三个数量和可选主题，提交到 `/api/generate`。
5. `generate()` 选取讲义页，从本机 `config.json` 读取配置，在服务端调用兼容的 `chat/completions` 接口。原文最多 22,000 字符，公式提示另有最多 22,000 字符预算。
6. `validate_mixed()` 校验题型配额、去重、答案结构及引用匹配，只返回通过检查的题目。
7. 浏览器通过 `format.js` 渲染公式。客观题按原始选项值计分；简答题展示参考答案供自评，原文引用保持文本。

## 文件职责

| 文件 | 阅读重点 |
| --- | --- |
| `server.py` | `read_config` / `provider_request`：配置和云端通信；`extract_pdf`：文档解析；`question_counts` / `validate_mixed`：题目规则；`Handler`：HTTP 路由 |
| `pdf_math.py` | 根据较小字号与上下位移识别脚标，提示和引用分开保存，不推断普通 `x2` |
| `static/app.js` | 三个滑条、文档状态、生成请求、测验渲染、提交评分、错题筛选和导出 |
| `static/format.js` | `textContent` 输入、显式数学记号预处理、KaTeX autorender，禁止信任模型 HTML |
| `tests/` | API 请求和错误处理、题目与引用规则、混合题限制、PDF 脚标复现 |

## 本地 HTTP API

| 方法与路径 | 输入 | 输出/用途 |
| --- | --- | --- |
| `GET /api/health` | 无 | 本地服务健康状态 |
| `GET /api/models` | 无 | 本机配置的模型名称及状态，不返回密钥、不访问云端 |
| `GET /api/sample` | 无 | 明确标注的预生成示例 |
| `POST /api/upload` | PDF 原始字节，`Content-Type: application/pdf` | `{id, pages}`；页包含 `page/text/math_context` |
| `POST /api/generate` | 下方 JSON | `{questions, requested_counts, actual_counts, notice, pages_used, sample}` |

```json
{
  "document_id": "上传接口返回的 ID",
  "model": "与本机配置一致的模型 ID",
  "counts": {"mcq": 2, "tf": 1, "short": 1},
  "topic": "可选主题"
}
```

每道题包含 `type/question/options/answer/explanation/page/quote`。`mcq` 有四个不同选项且答案等于其中一项；`tf` 答案为 `True` 或 `False`；`short` 的 `options` 为空。JSON 中数学反斜线需要转义，例如 `"\\(x^{2}\\)"`。

保留单题型旧请求的 `type/count` 兼容路径；新界面只发送 `counts`。

## 边界与限制

- 服务只绑定回环地址并检查 Host/Origin；不提供公网部署、用户账户或数据库。
- 上传文件最大 15 MB、200 页；最多缓存 10 份文档，之后淘汰最早一份。每页原文和公式提示各截取最多 16,000 字符。
- 密钥在服务端使用；云端重定向不会携带凭证继续访问，错误提示不返回原始服务商错误内容。
- 引用匹配只验证文字出处，不能证明题目、推理和答案语义正确。
- 公式位置提示只恢复可识别的上下标，复杂公式、扫描件、丢失符号仍需核对，模型被要求跳过歧义内容。
- 内置 KaTeX 的 JS/CSS/WOFF2 字体在本机加载。样式应只作用于选项最外层 `> span`，避免影响 KaTeX 内部布局。
- 原始 PDF 不作为文件上传云端；被选取的文字和数学提示会发送到用户配置的服务商。

## 修改后如何验证

先运行 `python -m unittest discover -s tests -v`。涉及界面时，检查三种题型的混合数量、全零/超限状态、上传/生成失败提示、客观评分、简答自评、错题筛选、重练、JSON 导出，以及 390px 手机宽度下的公式和页面布局。公式检查应同时覆盖题干、选项、答案与解析，且保留引用原文。
