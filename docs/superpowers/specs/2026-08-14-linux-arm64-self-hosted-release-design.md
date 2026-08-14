# Linux ARM64 自用发行包设计

## 目标

为 `Lidure/SnowLuma` 的自用分支 `feat/ws-client-group-message-filter` 增加一套面向 Raspberry Pi 5 / 64 位 Linux ARM64 的本地发行包构建流程。

目标是让树莓派端无需安装源码开发环境、pnpm 或完整依赖，只需解压发行包并运行 `./launcher.sh` 即可启动 SnowLuma，并保留当前自用的 WS Client 群消息过滤功能。

## 范围

本次只增加自用打包能力，不修改 OneBot 群消息过滤逻辑本身，不创建新的上游 PR，不自动发布 GitHub Release。

由于 SnowLuma 许可允许非商业自托管和私下修改，但公开发布修改版或衍生版需要事先书面授权，因此生成的 ARM64 包默认仅保存在本地 `release/` 目录，不上传为公开 Release。

## 现有能力复用

项目现有构建系统已经支持：

- `SNOWLUMA_TARGET=linux-arm64` 目标构建；
- `snowluma-linux-arm64.node`；
- `snowluma-linux-arm64.so`；
- `websocket-linux-arm64.node`；
- Linux `launcher.sh`；
- `dist/` 自包含运行时布局；
- `launcher.sh` 优先使用包内 `./node`；
- `.node-version` 当前为 `22.13.0`。

因此本次不重写发行体系，只在现有发行布局上增加一个面向个人使用的 Windows 本地打包入口。

## 方案

新增两个主要组件：

### 1. `build_pi_release.bat`

供 Windows 用户双击运行。

职责：

1. 切换到项目根目录；
2. 检查 `node`、`corepack`、`pnpm` 是否可用；
3. 检查 pnpm 是否为项目要求的 `10.28.0`；
4. 必要时执行 `pnpm install --frozen-lockfile`；
5. 调用 ARM64 打包脚本；
6. 成功后打印生成包路径；
7. 失败时保留窗口，显示具体错误。

该 BAT 不直接实现复杂下载/压缩逻辑，避免 Windows shell 细节过多。

### 2. `tools/package-linux-arm64.mjs`

负责真正的构建和打包流程。

流程：

1. 读取根目录 `package.json` 获取 SnowLuma 版本；
2. 读取 `.node-version` 获取需要内置的 Node.js 版本；
3. 设置 `SNOWLUMA_TARGET=linux-arm64`；
4. 执行 `pnpm run build:all`；
5. 验证 `dist/` 中包含关键运行文件；
6. 下载对应版本的官方 Node.js Linux ARM64 二进制发行包；
7. 从 Node.js ARM64 包中提取 `bin/node` 到 `dist/node`；
8. 确保 `launcher.sh` 和 `node` 具备可执行权限信息；
9. 将 `dist/` 打包成 `release/SnowLuma-Lidure-v<version>-linux-arm64.tar.gz`；
10. 再次检查最终压缩包已生成且大小非零。

## 发行包内容

生成的压缩包采用官方 SnowLuma 发行包的扁平布局：

```text
index.mjs
launcher.sh
check-node-version.cjs
package.json
node
EULA.md
PRIVACY.md
native/
  snowluma-linux-arm64.node
  snowluma-linux-arm64.so
  websocket-linux-arm64.node
  ffmpeg/
  ...
```

不包含：

- 源码；
- pnpm；
- TypeScript；
- monorepo 开发依赖；
- Git 历史。

## 树莓派端使用方式

预期使用流程：

```bash
mkdir -p ~/snowluma
cd ~/snowluma

tar -xzf SnowLuma-Lidure-v<version>-linux-arm64.tar.gz
chmod +x launcher.sh node
./launcher.sh
```

然后通过浏览器访问：

```text
http://<树莓派IP>:5099
```

由于完整包内置 Node.js，树莓派端不要求预装 Node.js 或 pnpm。

## 错误处理

构建脚本必须在以下情况明确失败：

- 当前项目缺失 `pnpm`；
- `pnpm install` 失败；
- ARM64 构建失败；
- 任意必须的 ARM64 native 文件缺失；
- Node.js ARM64 下载失败；
- Node.js 压缩包内容不完整；
- 最终 tar.gz 生成失败。

不得在检查失败时继续生成可能残缺的发行包。

## 安全与许可边界

- 不上传任何 Airi / Moe 的 URL、token 或私有配置；
- 不把 `config/`、`data/` 等本地运行数据打进发行包；
- 不自动创建公开 GitHub Release；
- 不创建或提交上游 PR；
- 后续若要公开发布修改版，需先单独确认许可问题并取得用户明确同意。

## 测试与验收

实现完成后至少验证：

1. `pnpm typecheck` 通过；
2. `pnpm lint` 无新增 error；
3. `SNOWLUMA_TARGET=linux-arm64 pnpm run build:all` 成功；
4. `dist/native/` 包含全部 ARM64 必需文件；
5. 打包脚本成功生成 `.tar.gz`；
6. 解包后 `launcher.sh`、`index.mjs`、`node` 和 ARM64 native 文件均存在；
7. 压缩包不包含项目源码、`.git`、`node_modules`、本地配置和用户数据。

如果当前 Windows 环境无法直接执行 Linux ARM64 的内置 Node 二进制，则仅做结构与文件完整性验证；真正运行验证在 Raspberry Pi 5 上完成。

## 后续维护

以后同步 SnowLuma 官方 `dev` 更新时，只要官方仍保留现有 `SNOWLUMA_TARGET` 和 runtime 布局，这套本地 ARM64 打包入口无需大改。

如果官方改变 native 文件命名、Node 版本或发行布局，打包脚本应因完整性检查失败而停止，而不是静默产出错误包。
