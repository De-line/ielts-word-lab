# 本地数据格式与身份

此文为维护接口参考，规则实现以src/lib/vocabulary/history.ts、storage.ts、typing.ts及现有测试为准。不是个人数据示例，也不保存真实学习记录。

## 存储与版本

| 项目 | 当前值 |
| --- | --- |
| IndexedDB名称 / 数据库版本 | ielts-word-lab-learning / 1 |
| JSON formatVersion | 1 |
| datasetNamespace | my-ielts.vocabulary |
| datasetVersion | 5cef573-v1 |
| 上游基准 | 5cef573933663c4673c6e0093f1df04e68018b1a |
| 词库源SHA-256 | e21e604c16c30f1310dc025ccf6e58b93f2f525b231735f0b27e093d5e0eb1ce |

数据库不随构建版本改名。events store自增主键保存观察到的追加顺序，eventId唯一索引；meta store的identity键保存格式、词库身份和progress。完成事件与进度同一事务写入，重试补存的事件批次也一起原子提交。

## JSON与事件

顶层字段：formatVersion、datasetNamespace、datasetVersion、exportedAt（ISO）、events数组、progress（对象或null）。每个完成事件字段为：

- eventId、attemptId（两者相同）、sessionId。
- wordId（如my-ielts.vocabulary:1）、sourceId、topicId、groupId、datasetNamespace、datasetVersion。
- endedAt ISO、完成时localDate（YYYY-MM-DD）和timezoneOffsetMinutes（设备getTimezoneOffset约定，东八区为-480）。
- result：first_correct、corrected或skipped。incomplete不进入有效完成事件数组。

同会话同词的重复完成按eventId去重；新会话同词可有新原始事件。稳定词身份不使用裸拼写或组内位置；同拼写不同词条不合并。组ID含词库版本、主题与组号；弱词练习仍用原groupId及wordId。

## progress

保存sessionId、groupId、wordIds有序子集、mode（whole/weak）、index、input（最后已提交值）、hadError、touched、startedAt（毫秒或null）、counts（first_correct/corrected/skipped）、savedAt ISO。

whole必须包含原组完整词序；weak为同组原序子集。index与counts之和必须相等。组合暂态不保存成正式input；已发生的真实错误标记保留，刷新不会洗掉错误。同一attempt恢复后完成不会生成第二条有效完成。

## 日期、统计和验证

每词每本地自然日按追加顺序取首个有效完成，同日后续记录不覆盖它。最新三日按日期排序加权50/30/20，不足重新归一化。旅行/设备日期变化不重写旧日期，校验localDate与ISO/当时偏移一致；无法替用户纠正错误系统时钟。

组率只在所有原组词均有有效记录时正式显示，算术平均固定分母；覆盖与正确率分开。弱词及推荐为事件派生值，不另存独立弱词成绩。

导入逐项校验格式、词库版本、词/组身份、重复事件、结果枚举、时间/偏移和进度结构；先预览再明确替换，一个事务成功后才切换内存。没有签名/加密或防人为修改成绩的承诺，不把结构校验当作数据来源证明。

改变词库内容或生成器可能导致sourceId漂移。后续需要显式审核旧/新身份映射，歧义保留不自动合并；当前只拒绝不匹配版本，没有跨版本自动迁移工具。不要仅修改版本常量/测试指纹强行导入。
