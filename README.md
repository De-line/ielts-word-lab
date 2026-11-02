# IELTS Word Lab

个人、非商业用途的雅思词汇打字练习项目，基于 [hefengxian/my-ielts](https://github.com/hefengxian/my-ielts) 定制。

当前为**本地发布准备版本，尚未公开发布**。目标仓库为 `De-line/ielts-word-lab`，预期网址为 `https://de-line.github.io/ielts-word-lab/`。这是用户确认的发布目标，尚未上线；仓库可见性及公开范围仍待批准。

## 功能

- 可编辑原生输入框、逐字反馈，正确后自动前进；可以纠错、重试或跳过，无提交按钮。
- 保留原22个主题、3,674个条目，按主题原序每20词一组，共194组，末组按实际数量完成。
- IndexedDB自动保存完成历史及已提交草稿，刷新和记录页往返可继续上次练习。
- 学习记录区分未开始、进行中和历史完整覆盖；显示组率、弱词及最多10个建议复习组。
- 整组和薄弱词练习共享词身份与历史；不强制循环到全部答对。
- 手动JSON导出、导入校验、预览与明确覆盖确认，便于备份和设备转移。

每词每天只有首次有效完成参与统计；首次正确记1，修正或跳过记0。最近三个不同有效日期按最新到最旧50%/30%/20%加权，不足三日归一化。正式组率只在组内所有词均有有效记录后显示，按原组固定分母计算。这是近期独立拼写成功率估计，不是严格掌握度。

## 使用与兼容范围

入口：`/#/vocabulary/typing`（打字）、`/#/vocabulary/records`（记录）。在计划的Pages站点下，前面还要加 `/ielts-word-lab/`。

已实测 Redmi Note 7 Pro / Android10 / Chrome101.0.4951.61 / 讯飞小米版：Stage 3六项验收通过，涵盖播放/失败提示、草稿恢复、统计、两类复习及JSON替换恢复。开发自动化使用桌面Chrome156及320/390px模拟视口。

iPhone Safari、Mac Safari、其他Android组合未完成实体机验收。原生中文组合事件和200 ms精确时序仅部分真机覆盖；原生音频长挂起、完整退出浏览器进程等分支不冒充已实测。模拟视口不证明虚拟键盘兼容。

## 本地开发

建议使用 `.node-version` 中的 Node **24.19.0**、pnpm **8.6.10**。复用已安装运行时即可，不需要账号、后端或全局安装项目依赖。以 `pnpm-lock.yaml` 为安装依据；保留的上游 `package-lock.json` 和 `netlify.toml` 不是当前验证/发布路径，不混用npm安装。

```sh
pnpm install --frozen-lockfile
pnpm exec vite --host 127.0.0.1 --port 3333 --strictPort
```

开发地址为 `http://127.0.0.1:3333/#/vocabulary/typing`。上述命令仅本机监听；同Wi-Fi真机测试才临时使用 `--host 0.0.0.0 --port 3334`，读取实际IP并保持服务运行。不要使用公网隧道或端口转发；自行启动的终端按Ctrl+C停止。

```sh
pnpm run test --run
pnpm run lint:target
pnpm run build
pnpm run test:browser
pnpm run build:pages
pnpm run check:release
pnpm run test:release
```

浏览器脚本需要已安装的Chrome；非默认安装可设置 `BROWSER_EXECUTABLE_PATH`。脚本只用隔离浏览器和回环服务，不读取个人浏览器会话。

`pnpm run typecheck` 与 `pnpm run lint` 仍有上游既有失败，不能表述为全项目检查通过。CI同时检查已审阅基线和必须通过的定向lint；详见[开发说明](docs/LOCAL_DEVELOPMENT.md)。

## 记录与备份限制

数据只保存在当前浏览器的站点存储，不自动上传、跨设备同步或写入源码。普通代码更新不改数据库名/格式/词库版本，不会主动清库；但换协议、主机、端口或浏览器会看到不同数据。URL路径本身不隔离IndexedDB，同域其他项目若用相同数据库名可能共享存储。

清理站点数据、浏览器回收存储或系统在事务提交前强杀都可能造成丢失。保存失败时保留页面、导出内存备份并记录提示；避免多个标签同时练习/导入。自动保存不要求每组导出，仍建议定期手动备份。

导入是**替换，不是合并**。先备份当前数据、预览待导入文件，再明确确认。用旧备份替换会丢掉其后新增的记录；从本地HTTP迁移到未来GitHub HTTPS站点，也需要手动导出/导入。参见[备份与恢复](docs/BACKUP_RECOVERY.md)。

## 来源、差异与发布状态

上游基准提交：`5cef573933663c4673c6e0093f1df04e68018b1a`。上游原README保存在[原始说明](docs/UPSTREAM_README.md)；保留Frank署名、All rights reserved、非商业限制及Tommy1109255的原打字功能贡献说明。

本项目新增输入可靠性修复、固定分组、稳定身份适配、本地历史/日级统计、复习推荐及备份。原词库、教材/音频和其他备考模块没有被重新授权或大规模重写；发布适配仅修正必要的子路径链接。参见[来源声明](ATTRIBUTION.md)。

**禁止将本项目用于任何商业目的！！！** 这不是新许可证。公开仓库和Pages发布仍需确认上游及第三方素材的适用授权和通知；当前准备工作不代表已获公开再分发许可。没有替用户创建远程仓库、提交、推送或发布。

## 文档

- [使用指南](docs/04_USER_GUIDE.md)
- [备份与恢复](docs/BACKUP_RECOVERY.md)
- [本地开发与测试](docs/LOCAL_DEVELOPMENT.md)
- [GitHub Pages部署准备](docs/05_DEPLOYMENT.md)
- [数据格式与稳定身份](docs/06_DATA_FORMAT.md)
- [发布清单与Stage 5人工步骤](docs/07_RELEASE_CHECKLIST.md)
- [Stage 4变更及拟提交方案](docs/08_RELEASE_PREPARATION.md)

现有审计、实施、测试报告作为本地审阅证据继续保留，不自动上传到网站；其中含本机路径或私人操作信息的文件需要在纳入公开仓库前单独审阅。
