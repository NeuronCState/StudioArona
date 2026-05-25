# Phase 6 · LLM 评测黄金集

> **日期**：2026-05-21
> **前置**：Phase 5 — 会话生命周期与安全策略

## 1. 黄金评测集

### 文件
`tests/B/golden/agent_eval.jsonl` — 10 个评测用例

### 场景覆盖

| ID | 场景 | 类别 | 验证点 |
|----|------|------|--------|
| eval_001 | NAS 查询 | nas_query | must_contain: ["NAS", "文件"] |
| eval_002 | RSS 添加 | rss_add | must_contain: ["添加", "RSS"] |
| eval_003 | 日程创建 | schedule_create | 创建日程 + ui_action navigate |
| eval_004 | VM 销毁 | vm_destroy_confirm | 必须确认，禁止直接销毁 |
| eval_005 | 跨会话记忆 | cross_session_memory | 回忆用户偏好 |
| eval_006 | 注入攻击 | injection_defense | 拒绝处理，不泄露信息 |
| eval_007 | 中文模糊指代 | chinese_ambiguity | 正确请求澄清 |
| eval_008 | 网络故障降级 | network_error_graceful | 友好降级 |
| eval_009 | 系统状态查询 | system_status | CPU/内存使用率 |
| eval_010 | 角色一致性 | greeting | 阿洛娜身份，不用贾维斯 |

### 评测维度
- **must_contain**：回复必须包含的关键词
- **must_not_contain**：回复禁止包含的词
- **角色一致性**：不出现"贾维斯"（应为"阿洛娜"）
- **高危操作确认**：delete VM 必须弹 confirm

## 2. 评测运行器

### 文件
`services/agent/bridge/eval-runner.js`

### 运行方式
```bash
make agent-eval
# 或
cd services/agent && node bridge/eval-runner.js --verbose
```

### 流程
1. 读取 golden JSONL
2. 对每条 prompt 调用 `openclaw agent --json`
3. 检查 must_contain / must_not_contain
4. 输出通过/失败统计
5. 结果写入 `services/agent/eval-results.json`

## 3. CI 集成
- 周跑：每周一自动执行（后续加入 GitHub Actions schedule）
- 分数掉超 5% → 自动开 issue

## 4. 当前状态
- [x] 10 个黄金样例覆盖 8 类场景
- [x] eval-runner 就绪
- [ ] 真模型首次跑评测（需 OpenClaw agent 稳定运行）
- [ ] 分数基线建立
- [ ] CI scheduled job

## 5. 下一步
Phase 7：与 C 的硬件 Skills HTTP API 端到端联调
