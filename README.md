# Claude Code 2.1.88 逆向重建版

这是一个从 `cli.js.map` 逆向恢复出来，并重新整理为标准 npm 项目的 Claude Code 2.1.88 工程。当前已可以安装依赖、完成构建并启动 CLI 基础入口。

## 项目概述

该仓库的目标是把 reverse-sourcemap 生成的恢复结果整理成适合继续开发和维护的工程，以便：

- 通过 npm 安装依赖
- 在本地完成构建
- 直接运行 CLI
- 持续修复和补全缺失能力

当前已验证通过：

- `npm install`
- `npm run build`
- `node dist/cli.js`

## 重要说明

这个仓库不是官方上游源码仓库，而是从 sourcemap 恢复结果重建出来的项目。

由于 reverse-sourcemap 的恢复并不完整，当前构建链中包含一部分兼容层、自动生成的 shim 和 stub，用来保证项目能够安装、构建并完成基础启动。因此：

- 适合用来做源码研究、调试和继续修复
- 不保证与官方发布 bundle 的行为完全一致
- 某些私有集成、原生能力或高级功能仍然可能需要继续补全

## 环境要求

- Node.js `>= 18`
- npm `>= 9`

```bash
node -v
npm -v
```

## 快速开始

```bash
npm install
npm run build
node dist/cli.js
```

## 安装为全局命令

构建完成后执行：

```bash
npm install -g .
```

安装后可直接使用：

```bash
cc-copy
cc-copy --help
cc-copy --version
```

如需本地开发联调，也可使用：

```bash
npm link
```

## 构建说明

构建流程定义在 [scripts/build.mjs](./scripts/build.mjs)，主要负责：

- 将 `src/` 和 `vendor/` 转译成 Node.js 可运行的 ESM 输出
- 将 `bun:*` 相关导入改写成 npm/Node 可兼容的 shim
- 处理 `src/*` 别名导入
- 为未完整恢复的模块生成兼容 stub
- 注入 CLI 启动依赖的构建期常量

构建输出：

- `dist/cli.js`
- `dist/src/**`
- `dist/vendor/**`

## 项目结构

```text
.
├── package.json
├── scripts/
│   └── build.mjs
├── src/          # 恢复出的主要源码
├── vendor/       # 替代不可用私有依赖或原生模块的本地兼容实现
└── dist/         # 构建生成的运行产物
```

## 已知限制

- 某些原始依赖并不存在于 npm，目前通过本地 shim 替代
- 某些模块无法从 sourcemap 中完整恢复，构建时会自动生成 stub
- "能够启动"不等于"与官方 bundle 完全等价"
- 与私有服务、私有协议或原生平台路径相关的能力，后续仍可能需要继续补全

## 问题排查

遇到构建或运行问题，按以下顺序排查：

1. 确认 Node.js 版本不低于 18
2. 清理旧构建产物并重新安装依赖
3. 重新构建
4. 验证 CLI 基础入口是否正常

```bash
npm run clean
npm install
npm run build
node dist/cli.js
```

## 后续开发建议

如果你准备继续完善这个恢复工程，优先级最高的工作通常是：

- 修复启动阶段的运行时报错
- 把自动生成的 stub 逐步替换成真实实现
- 为缺失的私有依赖补上兼容逻辑
- 对照原始 bundle 校验高价值子命令行为

## 许可证与来源说明

该仓库包含从 sourcemap 恢复整理出的代码。在继续分发或公开发布之前，请自行确认原始项目的许可证、版权和使用条款。
