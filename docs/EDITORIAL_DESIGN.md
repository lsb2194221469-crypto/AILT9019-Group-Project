# 编辑式学习工作台 · 2026-11-13

## 研究与借鉴

- [Linear：A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh)：明确导航、视图与操作的层级，次要配置不与主任务争夺注意力。
- [Are.na](https://www.are.na/)：以材料与集合组织知识。借鉴集合的卡片组织方式，历史测验按 PDF 分组展示。
- [Cosmos](https://www.cosmos.so/)：内容集合与视觉编排的参考。这里采用纸张和问题卡的原创图形，而非照搬网站或作品素材。

## 重新设计

移除固定侧栏和旧式圆角仪表盘；顶部导航区分创建、资料库与继续作答。暖纸色底、炭黑正文、砖红强调、浅橄榄材料面板，中文保持微软雅黑，插画内英文使用系统 Georgia。用字号、网格和细线组织信息。首屏原创纸张图形表达讲义到问题的转换，不使用远程字体、素材或分析脚本。

讲义和题量设置形成连续工作台。三个题型保持滑条，模型配置收进可展开区域，生成动作归入统一底部操作区，说明选中文件与题量。历史从窄侧栏改为完整资料库，可搜索、按 PDF 分组、保留独立测验。没有历史时显示真实空状态，不填充虚构数据。

手机重新编排图文，不把桌面布局简单缩小；360px 隐去装饰以保证可读性。打印隐藏导航、资料库、装饰及配置，只保留练习内容。

## 验证与边界

完整历史及新功能回归 test_minimal_browser.cjs 通过；test_editorial_browser.cjs 检查 1440、768、390、360 四个宽度、横向溢出、标题可读性、资料库导航、模型配置展开及作答时隐藏生成操作区。桌面与手机截图已查看。本轮使用模拟模型，没有消耗真实 API；没有改动数据库格式或模型出题逻辑。

## 完整恢复

本机基线包 outputs/backups/lecture-lab-before-editorial-2026-11-13.zip 已保存改版前的所有项目源码（排除 API 配置、日志、任务数据与运行时）。检查：`runtime/python.exe tools/restore_before_editorial.py`；停止服务后恢复：`runtime/python.exe tools/restore_before_editorial.py --apply`。恢复先核验 SHA-256、ZIP 和解压字节，不覆盖密钥或用户学习记录。

GitHub 基线分支：backup/before-editorial-2026-11-13。此前的 before-minimal 分支和本机备份仍保留，可恢复更早版本。
