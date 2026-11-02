# 本地开发与测试

## 运行约定

使用Node24.19.0（`.node-version`）和pnpm8.6.10（packageManager）。仓库仍保留上游npm锁和Netlify配置作来源记录，但本定制版只验证pnpm锁、Vite及GitHub Actions路径；不要混用npm ci或按旧Node16配置部署。没有新增项目依赖。

```sh
pnpm install --frozen-lockfile
pnpm exec vite --host 127.0.0.1 --port 3333 --strictPort
```

本机开发用回环地址。局域网手机需要同可信Wi-Fi、临时监听0.0.0.0:3334和当前Mac IPv4；测试服务停止后旧标签还能本地练习，但刷新/未缓存音频需要服务。不要修改路由器、系统代理或建立公网隧道。

## 模块边界

| 文件 | 职责 |
| --- | --- |
| src/lib/vocabulary/catalog.ts | 原词库只读适配、固定分组及身份版本 |
| typing.ts / useTypingPractice.ts | 输入状态机、取消旧事件、已提交草稿恢复及Vue连接 |
| history.ts | 日级首次有效成绩、加权率、覆盖、推荐及JSON校验 |
| storage.ts | IndexedDB事务、保存队列、去重和导入替换 |
| src/pages/vocabulary/typing.vue / records.vue | 练习与学习记录/备份界面 |
| build/pages.ts | Pages子路径及静态资源复制白名单 |
| scripts/check-release.mjs / check-baseline.mjs | 产物审阅与既有全局诊断基线门禁 |

保持词库文件及DATASET_VERSION不变，不能通过更新测试常量掩盖静默词身份变化。新的词库版本需要显式迁移设计。学习逻辑变化应追加现有TEST_CASES/TEST_REPORT，保留真机事实，不另造测试管理体系。

## 自动检查

```sh
pnpm run test --run
pnpm run lint:target
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run test:browser
pnpm run build:pages
pnpm run check:release
pnpm run test:release
```

typecheck预期仍有ielts/practice.vue第19行两个TS7006及第52行一个TS2322；全量lint既有98,059 errors / 38 warnings。它们是保留的失败，不是PASS。CI记录日志后用脚本精确比对基线，新增诊断会阻断；定向lint必须独立通过。改全局规则或修复旧问题后应审阅并更新基线，不用continue-on-error掩盖变化。

浏览器脚本依赖现有Chrome，默认使用独立临时配置；可设BROWSER_EXECUTABLE_PATH。只访问回环服务，拒绝第三方请求，不读个人Chrome配置。根路径回归输出browser.json；发布脚本用严格静态服务模拟 `/ielts-word-lab/`，不使用SPA fallback掩盖路径错误。所有合成记录、截图和日志置于被忽略的test-results/，实际结论仍统一记本地TEST_REPORT。

```sh
pnpm run preview:pages
```

预览地址为 `http://127.0.0.1:4176/ielts-word-lab/#/vocabulary/typing`。Ctrl+C停止。预览不是线上服务器；预期公开网址为 https://de-line.github.io/ielts-word-lab/ ，尚未部署。

## 维护和隐私

同origin、同数据库名/格式/词库版本的普通更新不主动重置学习数据。不要把构建散列放进数据库名，也不要为更新清站点存储。多个GitHub项目路径可能共享同一origin，注意数据库名冲突。

`.gitignore`防止常见备份、环境配置和输出被误加入；它不审查已跟踪文件，也识别不了任意改名的私人JSON。提交前按发布清单人工审阅候选文件；真实JSON不放test、public或docs。源代码中的secret格式匹配只是一层检查，不等于完整安全审计。

精确回归、Android记录与源文件指纹保留在本地 `docs/TEST_REPORT.md`；其中含个人工作区信息，公开仓库候选清单不自动包含内部报告。Git历史、已验收源码和这些文件都不删除。
