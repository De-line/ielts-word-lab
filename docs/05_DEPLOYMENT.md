# GitHub Pages部署准备

本文件描述待批准的流程，**未建仓、未提交/推送、未运行Actions、未发布**。用户已确认目标仓库 `De-line/ielts-word-lab`，预期网址 `https://de-line.github.io/ielts-word-lab/`；仓库可见性及公开范围仍待批准，真实上线URL须从后续部署输出核对。

## 路径和产物

`pnpm run build:pages` 以pages模式构建：Vite base固定 `/ielts-word-lab/`，输出 `dist-pages/`。普通build/dev仍保留根路径行为。Vue Router继续使用createWebHashHistory(BASE_URL)，正式入口是：

- `https://de-line.github.io/ielts-word-lab/#/vocabulary/typing`
- `https://de-line.github.io/ielts-word-lab/#/vocabulary/records`

Hash不会发送到静态服务器，因此刷新不需要服务端SPA重写。无hash的 `/ielts-word-lab/vocabulary/typing` 不是支持入口，不复制整站index到每个路由来掩盖错误。

Header、Footer、404和原写作页根链接，以及两个179听力练习的根音频路径已按BASE_URL适配；原版权文字、数据、判定和学习存储未改。词汇音频及语法相对资源在仓库子路径下验证。

仅上传 `dist-pages/`。pages构建白名单复制应用需要的mp3、语法PDF/SVG、favicon、404图和ATTRIBUTION.txt；不复制README截图、slogan图、audacity_tags.txt、JSON、docs、测试输出、缓存、原始源文件或本机配置。原public资源不删除，根路径dist只用于本地回归，不能误当发布产物。

产物含原站其他模块的教材/音频，约500MB，准备流程不等于已经取得素材公开许可。适用通知与授权范围仍须发布前确认，不在本阶段重做素材争论或替换内容。

## 工作流与权限

- **validate.yml**：push到main/master、PR及可复用调用只进行测试/构建/审阅。job仅contents:read；锁定pnpm8.6.10和pnpm-lock。记录全量诊断并核对已审阅基线，定向lint必须通过。根路径与Pages预览的浏览器检查都通过后，只有手动发布调用才上传Pages artifact。
- **deploy.yml**：只由workflow_dispatch触发；publish默认false。真正deploy要求publish=true、当前ref是仓库默认分支、仓库名ielts-word-lab，并依赖validate成功。PR不会部署，没有push自动发布。
- deploy job仅pages:write与id-token:write，用github-pages environment及官方configure-pages/upload-pages-artifact/deploy-pages，取消旧的第三方gh-pages分支写入方式。不创建/写入gh-pages分支，不使用个人PAT。
- checkout/setup-node/Pages actions固定到审阅时官方tag指向的完整提交SHA，行内注明major。Node固定`.node-version`。以后更新SHA、Node或pnpm需在PR重新验证；不悄悄跟随latest。GitHub托管ubuntu-24.04上的Chrome路径由BROWSER_EXECUTABLE_PATH明确指定，未远端执行过，首次运行仍需核对runner环境。
- github-pages环境应在Stage 5人工限定默认分支，并配置可用的审批保护；Pages publishing source由用户选择GitHub Actions。enablement=false，不让工作流擅自开启Pages。

固定动作来源：官方 [GitHub Pages工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[Vite子路径部署](https://vite.dev/guide/static-deploy.html#github-pages)、[Vue Router Hash模式](https://router.vuejs.org/guide/essentials/history-mode.html#hash-mode)。SHA由官方仓库git ls-remote只读核实；未触发任何workflow。

## Stage 5才执行的顺序

1. 完成发布清单中的授权、通知、候选源码及内部文档隐私审阅，确认GitHub用户名、仓库可见性和默认分支；取得用户对具体commit/建仓/push/发布的明确批准。
2. 用户使用GitHub官方浏览器/设备认证自行登录。不要发送密码、token或恢复码。
3. 按批准方案本地提交；保留上游基准和upstream远程，不初始化新历史、不force push。创建目标仓库后再添加origin，核对origin不等于upstream，审核待推送分支后才push。
4. 在GitHub Settings → Pages选择GitHub Actions；配置github-pages环境的分支和审批保护。只运行验证先检查远端runner结果。
5. Actions → Publish GitHub Pages (manual)，选择默认分支，只有明确批准发布时勾publish=true；通过验证和环境审批后部署。不得在Stage 4运行此步骤。
6. 从deploy-pages实际输出读取URL，检查首页、两个hash入口、刷新、音频和JSON UI；不要把计划URL写成已上线网址。保存实际commit、Actions run链接、URL及验证记录。

## 更新、数据迁移和回滚

普通更新沿用同origin数据库，不清历史、不更换词库版本。HTTP局域网与未来HTTPS GitHub域不同，需用户先在原地址导出最新JSON，到新站明确确认导入，不自动同步。

内容回滚应针对已批准提交创建revert或选定已审阅历史版本，再完整验证并手动发布；不reset --hard、clean -fd或强推。版本回滚不应擦除用户IndexedDB；若格式/词库不同，先备份并按数据迁移方案处理，不能仅靠回滚网页保证数据兼容。

## Stage 5 当前认证与批准门槛

截至本次发布前核查，本机没有可用的gh命令，也未验证GitHub登录状态；系统凭据助手存在不代表已认证。只读公开API确认De-line账号存在，目标仓库返回404；未登录查询不能排除同名私有仓库。创建前须在已登录的De-line账号下再次核查，若已存在则先报告，不覆盖或修改。

认证优先由用户在GitHub官方网页自行完成。若后续决定安装并使用GitHub CLI，可按[官方gh auth login说明](https://cli.github.com/manual/gh_auth_login)通过浏览器完成 `gh auth login --hostname github.com --git-protocol https --web`，随后核对登录账号及目标仓库；本轮不安装、不登录、不读取或输出token。

- **批准A：本地提交。** 审阅08中的44项候选、提交主题，并提供希望写入提交的作者姓名/邮箱（可自行在GitHub账户设置中取得隐私邮箱）。只为本仓库设置，不擅自改全局配置。
- **批准B：建仓及推送。** 另行确认可见性、全部公开内容范围、默认分支及推送对象后，才创建不预置README/许可证的空仓库，保留upstream并添加单独origin。若同名仓库存在，停止创建，先请求明确处理授权。
- **批准C：首次公开Pages部署。** GitHub验证实际通过、核对artifact及Pages环境后，另行批准publish=true。批准A不包含B，批准B不包含C；验证工作流不会自行部署。

本轮仅审阅候选暂存方案，Git索引保持为空。原Android历史不自动转移；上线后按BACKUP_RECOVERY由用户导出原地址最新JSON、保留原件，在新站预览并明确确认导入，核对统计与草稿后再认定迁移成功。
