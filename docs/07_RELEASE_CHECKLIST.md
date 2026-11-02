# 发布清单与Stage 5人工步骤

准备日期：2026-11-02。状态定义：**PASS**=已取得本地证据；**BLOCKED**=公开发布前必须解决；**PENDING**=未执行或待用户明确批准。不是上线记录，不虚构仓库URL、Actions run或线上访问结果。

| 检查项 | 状态 | 证据 / 后续 |
| --- | --- | --- |
| 保留上游提交和来源 | PASS | 仍基于5cef573933663c4673c6e0093f1df04e68018b1a；保留upstream、Frank署名、非商业限制和原README快照 |
| 功能及Android验收 | PASS | Stage 3目标设备六项已通过；本轮未重做手机测试，不扩大设备支持范围 |
| README / 用户 / 备份 / 开发 / 数据格式说明 | PASS | 当前docs及README；内部原始报告单独保留 |
| 根路径和项目子路径本地验证 | PASS | Stage 5重跑54单元/21根路径/6子路径及两种构建通过，见本地TEST_REPORT；不等于真实GitHub环境通过 |
| Pages资源白名单、原始个人数据隔离 | PASS | 只上传dist-pages；JSON/测试输出/审计文档不在产物中，未发现所检查格式的凭据或本机路径 |
| 验证与发布分离 | PASS | PR仅验证；发布工作流仅手动、默认publish=false、默认分支及仓库名约束，固定官方Actions SHA |
| 不随代码构建重置数据库 | PASS | 数据库名/格式/词库版本未变；本地静态版本更新模拟保留完成记录和草稿 |
| 全局typecheck/lint清零 | PENDING | 原3个类型诊断及98,059 errors / 38 warnings继续保留，精确基线门禁拒绝新增诊断；不写成全项目通过 |
| 公开代码/素材分发范围及完整通知 | BLOCKED | 沿用Stage 1未解决授权范围；ATTRIBUTION提供来源，不是许可证。须确认可公开的代码/资源及适用第三方通知后才发布 |
| 内部报告的公开范围 | PENDING | 原审计/实施/手机操作单含本机路径，测试报告含个人操作元数据；默认拟提交不包含这些内部文件。用户确认候选范围后再提交，不能直接git add docs/ |
| GitHub发布目标 | PASS | 用户确认De-line/ielts-word-lab，预期https://de-line.github.io/ielts-word-lab/；目标确认不等于仓库已创建或网站已上线 |
| 仓库存在性及可见性 | PENDING | 公开API查询目标404、De-line账号200；无法排除同名私有仓库，须认证后复核。可见性及公开范围尚未批准 |
| Git提交作者身份 | BLOCKED | 当前有效user.name/user.email均未配置；用户决定作者信息后仅在本仓库配置，不猜测邮箱 |
| 本地commit与基线固定 | PENDING | 文件及提交主题方案见08_RELEASE_PREPARATION；本轮未git add/commit |
| 创建origin、推送、Pages配置 | PENDING | 需Stage 5逐项明确授权；当前仅upstream，无个人远程 |
| GitHub托管runner及真实Pages回归 | PENDING | 未运行任何Actions或部署；首次验证需核对Chrome/Node、artifact和真实网址 |
| iPhone/Safari/其他设备 | PENDING | 不阻止本轮发布准备交付，但不宣称已兼容 |

## 用户在Stage 5需要执行/确认的具体动作

1. 确认GitHub用户名、仓库名ielts-word-lab、可见性、默认分支；完成授权范围及内部报告公开审阅。确认希望发布哪些仍含上游材料的页面；不要自行推定“非商业即可公开”。
2. 审阅拟提交文件与diff，明确批准本地提交主题/范围。原始基准是浅克隆，不能声称包含全部上游历史；如需要完整历史，可在后续授权操作中获取，不重置/替换现有提交。
3. 用户自行用官方浏览器/设备流程认证GitHub。不要把密码、PAT或恢复码发到对话。
4. 明确授权建仓和push后才创建目标仓库、添加origin并推送批准分支。核对不是推往upstream，不force push，不改写原作者历史。
5. 在GitHub仓库Settings → Pages选择GitHub Actions；在Environments → github-pages限定默认分支并设置可用审批保护。首次只验证，不把运行验证视为批准发布。
6. 审核CI实际日志、产物和权限，再明确批准发布。到Actions的手动发布工作流，选择默认分支并勾publish=true；按github-pages环境完成审批。Stage 4不执行。
7. 从部署输出取得实际URL，核对首页、typing/records hash入口、刷新、音频、备份和同源更新。保存实际commit、Actions run、URL及日期，才能填“已发布”。
8. 在旧浏览器地址导出最新JSON并确认文件；未来站点为空时由用户手动预览确认导入。保留原备份，不自动上传、不合并两端历史。上线和每次维护前都保留可恢复备份。

Stage 4准备已完成；Stage 5本轮停在发布前核查及44项候选暂存方案审阅，索引仍为空。批准A（本地提交）、B（建仓及推送）、C（首次Pages部署）分别取得，不互相推定；本清单不是执行这些动作的授权。
