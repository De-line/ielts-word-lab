# Stage 4 发布准备实施摘要

日期：2026-11-02。项目名IELTS Word Lab，目标仓库ielts-word-lab。本阶段只准备本地源码、文档与流程，尚无真实个人仓库/网址、远端Actions run或发布。

## 结果

README、使用/备份/开发/数据格式/部署说明和发布清单已补齐。Pages使用独立pages模式、固定/ielts-word-lab/、dist-pages资源白名单；原Hash路由保留，必要根链接按BASE_URL适配。验证与部署分离，官方Actions按完整SHA固定，只有手动发布且明确publish=true才会进入部署；未执行任何工作流。

保持Stage 2/3的输入引擎、词身份、统计、IndexedDB数据库名/格式、导入替换逻辑不变。没有重做Android六项验收。类型/lint旧失败仍保留，新增基线脚本要求精确匹配；当前全部新定向检查通过。具体自动执行证据只归档到现有本地TEST_REPORT，不另建竞争测试报告。

## 本轮精确改动路径（相对于Stage 3）

| 路径 | 内容 |
| --- | --- |
| .github/workflows/deploy.yml | 替换旧PR/push混合部署，只保留手动官方Pages流程 |
| .github/workflows/validate.yml | 新增只读验证及可复用artifact准备 |
| .gitignore / .eslintignore | 排除个人备份/环境配置/缓存/构建/测试输出；生成目录不参与源码lint |
| .node-version / package.json | 固定开发Node及包管理器约定，项目名和Pages/检查脚本；未新增依赖 |
| vite.config.ts / build/pages.ts | 独立pages模式、base、输出目录和静态资源白名单，原public文件不删 |
| index.html | 页面标题/描述为IELTS Word Lab |
| src/components/TheHeader.vue | 主页链接尊重BASE_URL，原导航/署名保留 |
| src/components/TheFooter.vue | 保留Frank及版权文字，仅主页链接适配 |
| src/pages/[...all].vue | 404图及返回主页路径适配 |
| src/pages/writing/index.vue | 3处原根路径链接适配；不改写作内容或判定 |
| src/pages/ielts/practice.vue / src/pages/listening/179practice.vue | 仅音频src前缀适配，不修旧类型错误或改业务逻辑 |
| scripts/check-baseline.mjs | 对原3个类型诊断和全量lint计数建立显式门禁 |
| scripts/check-release.mjs | 检查实际静态产物白名单、路径及常见凭据模式 |
| test/browser/release.browser.mjs | 新增严格静态子路径及普通版本更新模拟等6项检查 |
| test/browser/typing.browser.mjs | 保留21项回归，扩展最终源码指纹范围 |
| README.md / ATTRIBUTION.md | 项目说明、来源/限制；不新创覆盖上游的许可证 |
| docs/UPSTREAM_README.md | 原README完整字节快照，SHA-256 ba426a8d2430261299fa4cbc936205ec8c071dab9653b6b9cc6d7f88eead6b06 |
| docs/04_USER_GUIDE.md / docs/BACKUP_RECOVERY.md | 用户操作及不丢历史的备份恢复流程 |
| docs/LOCAL_DEVELOPMENT.md / docs/06_DATA_FORMAT.md | 开发检查、模块接口与稳定数据格式 |
| docs/05_DEPLOYMENT.md / docs/07_RELEASE_CHECKLIST.md | 待批准发布流程、PASS/BLOCKED/PENDING及Stage 5人工动作 |
| docs/TEST_CASES.md / docs/TEST_REPORT.md | 追加既有用例与实际发布回归结果，不修改真机通过事实 |
| docs/08_RELEASE_PREPARATION.md | 本摘要及完整候选提交清单 |

package-lock.json、netlify.toml作为上游历史保留但不是已验证发布路径；不为清理而删除。pnpm-lock.yaml及原词汇列表的既有变更来自Stage 2，本轮不再次升级依赖。原始词库指纹不变。

## 本地Git基线与提出的提交方案（尚未执行）

- 当前仍在master，HEAD与upstream/master为5cef573933663c4673c6e0093f1df04e68018b1a。只有1个可见提交，是浅克隆，不声称已持有完整历史；保留现有对象、工作树和远程，没有重新git init、改remote或破坏性清理。
- 由于Stage 2/3一直未提交，建议在用户审阅后，以原上游提交为父提交，创建**一个当前已验证状态的本地基线提交**，主题建议：  **feat: prepare IELTS Word Lab local release baseline**
- 这只是拟议，不执行git add、commit、tag、分支重命名或push。用户先确认下面候选文件；后续维护再按小变更提交，避免伪造已经存在的阶段提交历史。
- 拟公开的新增/修改文件共44项（包含此前未提交的Stage 2/3代码及测试），必须逐项审阅，不使用git add .或git add docs/：

- `.eslintignore`
- `.github/workflows/deploy.yml`
- `.github/workflows/validate.yml`
- `.gitignore`
- `.node-version`
- `ATTRIBUTION.md`
- `README.md`
- `build/pages.ts`
- `docs/04_USER_GUIDE.md`
- `docs/05_DEPLOYMENT.md`
- `docs/06_DATA_FORMAT.md`
- `docs/07_RELEASE_CHECKLIST.md`
- `docs/08_RELEASE_PREPARATION.md`
- `docs/BACKUP_RECOVERY.md`
- `docs/LOCAL_DEVELOPMENT.md`
- `docs/TEST_CASES.md`
- `docs/UPSTREAM_README.md`
- `index.html`
- `package.json`
- `pnpm-lock.yaml`
- `scripts/check-baseline.mjs`
- `scripts/check-release.mjs`
- `src/components/TheFooter.vue`
- `src/components/TheHeader.vue`
- `src/lib/vocabulary/catalog.ts`
- `src/lib/vocabulary/history.ts`
- `src/lib/vocabulary/storage.ts`
- `src/lib/vocabulary/typing.ts`
- `src/lib/vocabulary/useTypingPractice.ts`
- `src/pages/[...all].vue`
- `src/pages/ielts/practice.vue`
- `src/pages/listening/179practice.vue`
- `src/pages/vocabulary/index.vue`
- `src/pages/vocabulary/records.vue`
- `src/pages/vocabulary/typing.vue`
- `src/pages/writing/index.vue`
- `test/browser/release.browser.mjs`
- `test/browser/typing.browser.mjs`
- `test/vocabulary/catalog.test.ts`
- `test/vocabulary/history.test.ts`
- `test/vocabulary/navigation.test.ts`
- `test/vocabulary/typing-page.test.ts`
- `test/vocabulary/typing.test.ts`
- `vite.config.ts`

以上不包括原基准中未修改的词库、public素材等：它们仍在Git历史和将来仓库中，不因本次差异清单而消失。公开范围审阅仍须考虑整个仓库，而非只看新增文件。

默认**不纳入拟公开提交**的本地内部记录（5项）如下；文件原地保留、不删除，若需要公开应另行审核副本及个人信息，而不是直接上传：

- `docs/01_CODE_AUDIT.md`
- `docs/02_IMPLEMENTATION_REPORT.md`
- `docs/03_IMPLEMENTATION_REPORT.md`
- `docs/ANDROID_TEST_CHECKLIST.md`
- `docs/TEST_REPORT.md`

其中4份原审计/实施/操作单含本机工作区绝对路径；TEST_REPORT含真实操作元数据。真实备份和测试输出不在候选清单，忽略规则已核对。新公开指南只使用通用命令，不含本机用户名或私人学习JSON。对候选文本的常见凭据模式检查没有发现匹配，不等于完整安全/授权审计。

## 停止点

本地准备与验证完成；发布资格仍待原有授权范围/第三方通知确认，用户需决定用户名、可见性、候选提交范围，并批准具体Git和发布动作。GitHub托管runner及真实部署尚未执行。Stage 5顺序见07_RELEASE_CHECKLIST和05_DEPLOYMENT。本地预览脚本已停止，不保留LAN或公网服务。


## Stage 5 发布前核查与候选暂存复核（2026-11-02）

以上Stage 4内容保留为当时记录。本轮用户已确认GitHub owner为De-line，目标仓库为De-line/ielts-word-lab，预期站点为https://de-line.github.io/ielts-word-lab/；尚未创建仓库或发布。README、部署指南、发布清单和开发说明已同步该目标；没有更改应用、依赖、workflow或数据格式。

### 最终暂存提案

- 沿用上方**原44项**精确清单，无增加或删减：15项已跟踪修改、29项新增。按目录为应用14项、测试7项、docs9项、其余配置/构建/README14项。Stage 2/3功能、Stage 4发布配置均包含在此单一基线提案内。
- 工作树共49项变更/未跟踪文件，另外5项是上方列出的本地内部记录。真实个人备份、测试输出、构建、缓存不纳入；内部报告继续原地保留。索引仍为空，尚未git add/commit。
- 审阅范围包含44项候选差异及未修改的上游跟踪内容；原始README快照逐字节相同、原词库未变、upstream URL未变，HEAD仍是5cef573933663c4673c6e0093f1df04e68018b1a，master浅克隆。没有重写历史或配置origin。
- 对113份仓库/候选文本的限定模式扫描未发现凭据或本机路径，未发现符合学习备份顶层结构的JSON。既有.npmrc只有两项包管理设置，无认证信息，仍是上游跟踪文件；gitignore不会自动移除已跟踪文件。本轮未删除或取消跟踪它。
- 提交主题仍为 **feat: prepare IELTS Word Lab local release baseline**。批准后仅逐项暂存这44项并复核索引，以上游为父提交，不将5项内部报告误加入。

### 本地验证结论

本轮重跑54项单元/组件、21项根路径浏览器、6项严格子路径浏览器均通过；两种生产构建、定向lint及产物审阅通过。原3个typecheck诊断、98,059个lint错误及38个警告依旧存在，精确基线门禁通过，不冒称全局检查通过。正式实际结果仅记于本地TEST_REPORT的Stage 5段。

34文件源码指纹仍为89846097a111b0d3708eb4e946e43d0d4144f7ee1cb2a5d4b13b10df59fd5068，与Stage 4完全一致。Pages产物仍为3,909文件、501,350,480字节，未发现禁止文件或所检查的路径/凭据模式。临时回环测试结束后关闭，不启动3334服务，也不重做Android验收。

### 阻塞与批准门槛

| 项目 | 状态 | 下一步 |
| --- | --- | --- |
| Stage 4本地功能与发布配置一致 | PASS | 源码指纹及全部本地必过检查一致 |
| Git提交作者 | BLOCKED（本地提交） | 当前user.name/user.email均未配置，用户指定作者姓名及邮箱后仅在本仓库设置；不由GitHub用户名猜测邮箱 |
| 本地提交批准A | PENDING | 用户明确批准44项清单及上述主题后才暂存并提交 |
| GitHub目标存在性 | PENDING（认证后复核） | 公开API：De-line账号200、目标仓库404；只能确认目标不公开可见，不能排除私有同名仓库。当前无gh命令，未验证认证 |
| 可见性、公开范围及既有授权/通知 | BLOCKED（公开发布） | 沿用Stage 4未解决事项，不把本地准备视作公开再分发授权 |
| 建仓及推送批准B | PENDING | 独立于A；认证后再查同名仓库，存在时不覆盖，保留upstream |
| GitHub验证及首次部署批准C | PENDING | 真实Actions未运行；CI/artifact审核后另取C，不能把B视为公开Pages批准 |

认证及建仓准备流程见05_DEPLOYMENT的Stage 5段。Android历史不自动迁移；发布后用户自行在原地址导出最新JSON、保留原备份，再在新站预览并明确确认导入，核对草稿及统计后才认定迁移成功。
