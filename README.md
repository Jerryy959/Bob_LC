# LeetCode Solver Bob Plugin

该项目提供一个 Bob 文本翻译插件（`.bobplugin`），用于在 macOS 上对划词/复制的 LeetCode 算法题自动生成思路解析与可提交的 C++17 代码。

## 项目结构
- `LeetCodeSolver.bobplugin/`：插件主体（`info.json`、`main.js`、辅助模块）。

## 构建与打包
1. 将整个 `LeetCodeSolver.bobplugin` 文件夹压缩为 ZIP。
2. 修改扩展名为 `.bobplugin`，即可在 Bob 中直接导入。

## 使用说明
- 在 Bob 设置中填写 OpenAI 兼容 API Key、Base URL、模型名称等选项。
- 默认开启 LeetCode 题目检索，可在插件设置中关闭（直接把划词内容当题面处理）。
- 输出固定包含三段 Markdown：思路讲解、标准 C++ 代码、代码讲解。
