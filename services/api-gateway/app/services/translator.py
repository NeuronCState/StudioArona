"""English-to-Chinese translation — 纯免费方案.

策略:
1. **先查本地静态词典** (tech 术语, 离线可用, 0 延迟)
2. **再调 MyMemory free API** (https://api.mymemory.translated.net, 5000 chars/day/IP, no key)
3. **失败/超限/无网络/已中文** → 直接返原文

为什么不用 LLM:
- 每次 search 触发 1+ 次 LLM call, 5h 配额消耗极快
- 翻译结果对 skill 描述这种短文本, 跟 MyMemory 差不多
- MyMemory 免费, 无 key, 响应快 (< 1s)
"""
from __future__ import annotations

import re

import httpx


def is_chinese(text: str) -> bool:
    """Check if text is predominantly Chinese (>= 20% CJK)."""
    if not text:
        return False
    chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
    # 阈值从 30% 降到 20%: MyMemory 翻译含专有名词时英文占比高
    # (如 '使用pyproject.toml、src布局设置Python项目' 只 25% 是汉字但明显是中文)
    return chinese_chars >= len(text) * 0.2


def has_chinese(text: str) -> bool:
    """包含至少 1 个汉字 (比 is_chinese 宽松). 用于判断翻译结果是否含中文. """
    if not text:
        return False
    return bool(re.search(r'[\u4e00-\u9fff]', text))


# ── 本地静态词典 (tech 术语优先命中) ──────────────────────────────
# 不在词典里: 交给 MyMemory / 原文返
_STATIC_DICT: dict[str, str] = {
    # 编程语言
    "python": "Python", "javascript": "JavaScript", "typescript": "TypeScript",
    "rust": "Rust", "golang": "Go", "java": "Java", "kotlin": "Kotlin",
    "swift": "Swift", "php": "PHP", "ruby": "Ruby", "scala": "Scala",
    "rustlang": "Rust", "csharp": "C#", "fsharp": "F#",
    # 框架 / 库
    "react": "React", "vue": "Vue", "angular": "Angular", "svelte": "Svelte",
    "nextjs": "Next.js", "next.js": "Next.js", "nuxt": "Nuxt",
    "django": "Django", "flask": "Flask", "fastapi": "FastAPI",
    "express": "Express", "koa": "Koa", "nestjs": "NestJS",
    "tailwind": "Tailwind CSS", "bootstrap": "Bootstrap", "sass": "Sass",
    "tensorflow": "TensorFlow", "pytorch": "PyTorch", "keras": "Keras",
    "transformers": "Transformers", "huggingface": "Hugging Face",
    "langchain": "LangChain", "llamaindex": "LlamaIndex",
    "pandas": "Pandas", "numpy": "NumPy", "scipy": "SciPy",
    "sklearn": "scikit-learn", "matplotlib": "Matplotlib",
    "docker": "Docker", "kubernetes": "Kubernetes", "k8s": "K8s",
    "terraform": "Terraform", "ansible": "Ansible", "helm": "Helm",
    "nginx": "Nginx", "apache": "Apache", "haproxy": "HAProxy",
    "postgres": "PostgreSQL", "postgresql": "PostgreSQL",
    "mysql": "MySQL", "mariadb": "MariaDB", "mongodb": "MongoDB",
    "redis": "Redis", "memcached": "Memcached", "elasticsearch": "Elasticsearch",
    "kafka": "Kafka", "rabbitmq": "RabbitMQ", "graphql": "GraphQL",
    "grpc": "gRPC", "websocket": "WebSocket", "oauth": "OAuth",
    "jwt": "JWT", "ssl": "SSL", "tls": "TLS", "ssh": "SSH",
    "rest": "REST", "restful": "RESTful", "crud": "CRUD",
    # 概念
    "framework": "框架", "library": "库", "package": "包",
    "module": "模块", "function": "函数", "method": "方法",
    "class": "类", "object": "对象", "interface": "接口",
    "api": "API", "endpoint": "端点", "route": "路由",
    "database": "数据库", "schema": "Schema", "query": "查询",
    "table": "表", "column": "列", "index": "索引",
    "cache": "缓存", "queue": "队列", "stack": "栈",
    "deploy": "部署", "deployment": "部署", "release": "发布",
    "build": "构建", "compile": "编译", "test": "测试",
    "debug": "调试", "refactor": "重构", "review": "审查",
    "commit": "提交", "merge": "合并", "branch": "分支",
    "frontend": "前端", "backend": "后端", "fullstack": "全栈",
    "ai": "AI", "ml": "机器学习", "machine learning": "机器学习",
    "deep learning": "深度学习", "neural network": "神经网络",
    "llm": "大语言模型", "large language model": "大语言模型",
    "embedding": "嵌入", "vector": "向量", "rag": "RAG 检索增强",
    "prompt": "提示词", "fine-tuning": "微调", "agent": "智能体",
    "workflow": "工作流", "automation": "自动化", "script": "脚本",
    "tool": "工具", "utility": "工具", "helper": "辅助",
    "tutorial": "教程", "guide": "指南", "documentation": "文档",
    "example": "示例", "demo": "演示", "template": "模板",
    "project": "项目", "setup": "设置", "init": "初始化",
    "scaffold": "脚手架", "boilerplate": "样板代码",
    "design": "设计", "ui": "UI", "ux": "UX", "figma": "Figma",
    "css": "CSS", "html": "HTML", "svg": "SVG",
    "icon": "图标", "theme": "主题", "color": "颜色",
    "responsive": "响应式", "mobile": "移动端", "desktop": "桌面端",
    "cli": "命令行", "shell": "Shell", "bash": "Bash",
    "linux": "Linux", "macos": "macOS", "windows": "Windows",
    "git": "Git", "github": "GitHub", "gitlab": "GitLab",
    "open source": "开源", "proprietary": "专有",
    "performance": "性能", "scalability": "可扩展性", "reliability": "可靠性",
    "security": "安全", "vulnerability": "漏洞", "exploit": "利用",
    "encryption": "加密", "decryption": "解密", "hash": "哈希",
    "monitor": "监控", "logging": "日志", "alerting": "告警",
    "metrics": "指标", "dashboard": "面板", "visualization": "可视化",
    "analytics": "分析", "reporting": "报告", "etl": "ETL",
    "data": "数据", "dataset": "数据集", "databases": "数据库",
    "image": "图像", "video": "视频", "audio": "音频", "media": "媒体",
    "speech recognition": "语音识别", "ocr": "OCR",
    "translation": "翻译", "translate": "翻译", "i18n": "国际化",
    "l10n": "本地化", "localization": "本地化", "internationalization": "国际化",
    "search": "搜索", "indexing": "索引", "ranking": "排名",
    "recommendation": "推荐", "personalization": "个性化",
    "e-commerce": "电商", "shopping cart": "购物车", "checkout": "结算",
    "payment": "支付", "subscription": "订阅", "billing": "计费",
    "user": "用户", "account": "账户", "profile": "档案",
    "authentication": "认证", "authorization": "授权",
    "session": "会话", "cookie": "Cookie", "token": "令牌",
    "register": "注册", "login": "登录", "logout": "登出",
    "settings": "设置", "preferences": "偏好", "configuration": "配置",
    "notification": "通知", "email": "邮件", "sms": "短信",
    "chat": "聊天", "message": "消息", "comment": "评论",
    "post": "发布", "like": "点赞", "share": "分享", "follow": "关注",
    "feed": "信息流", "timeline": "时间线", "story": "故事",
    "task": "任务", "todo": "待办", "done": "完成",
    "schedule": "日程", "reminder": "提醒", "calendar": "日历",
    "skill": "技能", "plugin": "插件", "extension": "扩展",
    "integration": "集成", "connector": "连接器", "bridge": "桥接",
    "config": "配置", "init": "初始化", "start": "启动",
    "stop": "停止", "restart": "重启", "kill": "终止",
    "install": "安装", "uninstall": "卸载", "update": "更新",
    "version": "版本", "release notes": "发布说明", "changelog": "变更日志",
}


def _apply_static_dict(text: str) -> str | None:
    """对常见术语做短词替换. 如果整句都是英文, 全部替后仍可能不中文, 仍交给 MyMemory.

    返回 None 表示不需要翻译 (短文本或空).
    """
    if not text or len(text) < 3:
        return None
    if is_chinese(text):
        return text
    return text  # 留着原文, 后面会传给 MyMemory


async def translate_to_chinese(text: str) -> str:
    """Translate English text to Chinese — 纯免费方案 (静态词典 + MyMemory).

    Returns the original text on any failure (silent fallback).
    """
    if not text or is_chinese(text):
        return text

    # 1) 尝试本地静态词典 (极快, 0 网络)
    static_result = _static_translate(text)
    if static_result and is_chinese(static_result):
        return static_result

    # 2) MyMemory 公开 API (5000 chars/day/IP 免费, 不需 key)
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                "https://api.mymemory.translated.net/get",
                params={"q": text, "langpair": "en|zh-CN"},
            )
            if resp.status_code == 200:
                data = resp.json()
                translated = data.get("responseData", {}).get("translatedText", "")
                # MyMemory 偶尔返 "MYMEMORY WARNING" 或配额超限信息 — 拒
                if (
                    translated
                    and "WARNING" not in translated.upper()
                    and "QUERY LENGTH LIMIT" not in translated.upper()
                    and "INVALID EMAIL" not in translated.upper()
                    and has_chinese(translated)  # 翻译后至少要含汉字
                ):
                    return translated
    except Exception:
        pass

    # 3) 失败: 返原文
    return text


def _static_translate(text: str) -> str:
    """本地静态词典逐词替换.

    按空格分词, 命中词典的短词替换. 不做语法分析, 只在词级别.
    """
    if not text:
        return text
    # 保留分隔符, 按非字母数字切分
    tokens = re.split(r'([\s,.;:!?()\[\]{}<>"\'/\\|_-]+)', text)
    out: list[str] = []
    for t in tokens:
        lower = t.lower().strip(".,;:!?()[]")
        if lower in _STATIC_DICT:
            out.append(_STATIC_DICT[lower])
        elif any(lower.startswith(k) and (len(lower) - len(k) < 4) for k in _STATIC_DICT if len(k) > 3):
            # 简单前缀匹配 (e.g. "pythonic" -> "Python")
            for k in _STATIC_DICT:
                if lower.startswith(k) and k in {"python", "rust", "go", "java", "javascript"}:
                    out.append(_STATIC_DICT[k] + t[len(k):])
                    break
            else:
                out.append(t)
        else:
            out.append(t)
    return "".join(out)


async def translate_skill_descriptions(
    skills: list[dict],
) -> list[dict]:
    """Translate description fields in a list of skills (best-effort, batched)."""
    # 限并发: MyMemory 免费版有 5000 char/day, 串行更稳
    for skill in skills:
        if skill.get("description") and not is_chinese(skill["description"]):
            skill["description_zh"] = await translate_to_chinese(skill["description"])
        else:
            skill["description_zh"] = skill.get("description", "")
    return skills
