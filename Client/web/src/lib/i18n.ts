import { useLocaleStore } from "@/stores/locale";

const zh: Record<string, string> = {
  // weather / sidebar / focus / common (历史)
  "weather.title": "天气",
  "weather.humidity": "湿度",
  "weather.wind": "风力",
  "weather.feelsLike": "体感",
  "weather.uvIndex": "紫外线",
  "sidebar.home": "首页",
  "sidebar.rss": "信息源",
  "sidebar.schedule": "日程",
  "sidebar.vms": "虚拟机",
  "sidebar.config": "配置",
  "sidebar.admin": "管理",
  "sidebar.studio": "Studio301",
  "sidebar.studioServices": "工作室服务",
  "sidebar.disconnected": "未连接",
  "sidebar.linux": "工作室服务",
  "sidebar.system": "系统监控",
  "sidebar.ocr": "OCR 识别",
  "sidebar.camera": "摄像头",
  "sidebar.nas": "NAS 存储",
  "sidebar.newChat": "新对话",
  "focus.history": "对话历史",
  "focus.historyEmpty": "暂无对话\n点击左上「新对话」开始",
  "focus.schedule": "日程",
  "focus.feeds": "信息源 RSS",
  "focus.vms": "虚拟机",
  "focus.toggle": "切换专注侧栏",
  "focus.toggleExpand": "展开专注侧栏",
  "focus.toggleCollapse": "收起专注侧栏",
  "focus.rename": "重命名",
  "focus.delete": "删除",
  "focus.deleteConfirm": "确定删除「{title}」？",
  "common.cancel": "取消",
  "common.confirm": "确认",

  // 时间格式 (P3 新组件用到)
  "time.justNow": "刚刚",
  "time.secondsAgo": "{n} 秒前",
  "time.minutesAgo": "{n} 分钟前",
  "time.hoursAgo": "{n} 小时前",
  "time.daysAgo": "{n} 天前",
  "time.never": "从未",
  "time.dash": "—",

  // 通知 (NotificationBell + useNotificationStream)
  "notification.title": "通知",
  "notification.center": "通知中心",
  "notification.markAllRead": "全部已读",
  "notification.empty": "暂无通知",
  "notification.unreadBadge": "通知 ({n} 未读)",
  "notification.unreadBadgeZero": "通知",
  "notification.badge99Plus": "99+",

  // 网页监控 (PageMonitorCard)
  "pageMonitor.monitoring": "监控中",
  "pageMonitor.paused": "已暂停",
  "pageMonitor.checkNow": "立即检查",
  "pageMonitor.pause": "暂停",
  "pageMonitor.enable": "启用",
  "pageMonitor.edit": "编辑",
  "pageMonitor.delete": "删除",
  "pageMonitor.deleteConfirm": "删除监控「{title}」？",
  "pageMonitor.checkEvery": "每 {n} 分钟检查",
  "pageMonitor.lastCheck": "上次检查",
  "pageMonitor.lastChange": "上次变化",
  "pageMonitor.changeDetected": "检测到变化: {summary}",
  "pageMonitor.changeDetectedEmpty": "检测到变化: (无摘要)",
  "pageMonitor.editDialogTitle": "编辑网页监控",
  "pageMonitor.close": "关闭",
  "pageMonitor.field.name": "名称",
  "pageMonitor.field.url": "URL",
  "pageMonitor.field.urlHint": "只读",
  "pageMonitor.field.cssSelector": "CSS 选择器",
  "pageMonitor.field.cssSelectorHint":
    '默认 "body" — 抽取正文区域, 忽略广告/导航',
  "pageMonitor.field.interval": "检查间隔 (分钟)",
  "pageMonitor.field.enabled": "启用监控",
  "pageMonitor.save": "保存",
  "pageMonitor.saving": "保存中…",
  "pageMonitor.saveFailed": "保存失败: {msg}",

  // Feed 详情 (FeedItemDetail)
  "feed.back": "返回列表",
  "feed.openOriginal": "查看原文",
  "feed.read": "阅读",
  "feed.noSummary": "(无摘要)",
  "feed.loadFailed": "加载失败",
  "feed.loadingContent": "正在加载正文…",
  "feed.extracting": "正在抽取正文（约 3-5 秒）…",
  "feed.extractFailed": "抽取失败 ({status})",
  "feed.extractFailedHint": '{msg}。可点下方"打开原文"查看。',
  "feed.empty.monitor": "正在监控页面变化。检测到变更后会生成变更摘要。",
  "feed.empty.rss": "暂无文章。后台每 15 分钟抓取一次。",

  // 后台任务 (CronStatusCard)
  "cron.title": "后台任务",
  "cron.rss": "RSS 抓取",
  "cron.pageMonitor": "网页监控",
  "cron.totalTicks": "共 {n} 次",
  "cron.errorCount": "· {n} 错",
  "cron.lastError": "最近错误: {msg}",

  // SSE toast (useNotificationStream)
  "sse.notificationTitleWithBody": "{title}: {body}",
  "sse.pageMonitorChangeWithBody": "{label}: {body}",
  "sse.pageMonitorChangeDefault": "{label} 页面有新变化",

  // 工作室服务离线 (StudioServiceOffline)
  "studio.offline.title": "未连接 server",
  "studio.offline.serviceHint":
    "{label}属于工作室服务, 需连接 server 后才能查看",
  "studio.offline.steps": "连接步骤:",
  "studio.offline.step1Label": "确认 server 端运行:",
  "studio.offline.step2Label": "或打开 docker:",
  "studio.offline.step3": "在左上角菜单 → 设置 → 工作室服务 连接 server",
  "studio.offline.retry": "重新检测",
  "studio.serviceLabel.vms": "虚拟机",
  "studio.serviceLabel.nas": "NAS 存储",
  "studio.serviceLabel.ha": "HomeAssistant",

  // Studio Home (StudioHomePage)
  "home.studio.weatherEmpty.title": "暂无天气数据",
  "home.studio.weatherEmpty.hint": "无法获取当前位置天气",
  "home.studio.serverOffline.title": "未连接 server",
  "home.studio.serverOffline.hint": "工作室服务需连接后查看",
  "home.studio.centerButton.aria": "打开阿洛娜专注面板",
  "home.studio.centerButton.alt": "阿洛娜专注",
  "home.studio.greeting.morning": "早上好",
  "home.studio.greeting.afternoon": "下午好",
  "home.studio.greeting.evening": "晚上好",
  "home.studio.greeting.fallback": "欢迎",

  // Command Home (HomeCommandPage)
  "home.command.badge": "Arona 阿洛娜 · online",
  "home.command.hero.title": "老师，今天需要我帮忙吗？",
  "home.command.hero.subtitle":
    "阿洛娜已经同步了记忆、日程、RSS 情报和工作室状态。你可以直接开始对话，或让她进入语音模式陪你处理任务。",
  "home.command.context.title": "Context",
  "home.command.context.panelTitle": "阿洛娜的同步面板",
  "home.command.context.currentUser": "当前用户",
  "home.command.context.userFallback": "老师",
  "home.command.context.intro": "阿洛娜已准备好处理对话、记忆与工作室任务。",
  "home.command.context.recentMemory": "最近记忆",
  "home.command.context.recentMemoryFallback": "暂无新的会话记忆",
  "home.command.context.todaySchedule": "今日日程",
  "home.command.context.todayScheduleFallback": "等待同步日程事件",
  "home.command.context.systemSummary": "系统摘要",
  "home.command.context.systemSummaryFallback":
    "CPU / Memory / RSS worker 正常",
  "home.command.quickActions.aria": "阿洛娜快捷功能",
  "home.command.open": "打开",
  "home.command.quick.feeds.label": "情报站",
  "home.command.quick.feeds.desc": "RSS 文章、摘要与订阅源",
  "home.command.quick.system.label": "工作室状态",
  "home.command.quick.system.desc": "CPU、内存、网络与事件流",
  "home.command.quick.vms.label": "VM 控制台",
  "home.command.quick.vms.desc": "启动、停止和查看虚拟机",
  "home.command.quick.schedule.label": "日程计划",
  "home.command.quick.schedule.desc": "今日安排与阿洛娜规划",
  "home.command.timeline.title": "Live Timeline",
  "home.command.timeline.subtitle": "实时事件流",
  "home.command.timeline.busStandby": "WebSocket bus standby",
  "home.command.timeline.now": "刚刚",
  "home.command.timeline.todayAt": "今天 {time}",
  "home.command.timeline.aronaReady": "阿洛娜已同步首页上下文",
  "home.command.timeline.memorySummarized": "最近会话摘要已写入记忆",
  "home.command.timeline.rssUpdated": "RSS 情报站完成一次刷新",
  "home.command.timeline.presenceIdle": "工作室感知处于待机状态",

  // Studio home tiles (Schedule / RSS / 右上角日期)
  "tile.schedule.title": "日程",
  "tile.schedule.empty": "今天没有日程",
  "tile.schedule.footer.empty": "今天没有日程",
  "tile.schedule.footer.count": "今天 {n} 个日程",
  "tile.rss.title": "RSS 订阅",
  "tile.rss.empty": "暂无文章",
};

const en: Record<string, string> = {
  "weather.title": "Weather",
  "weather.humidity": "Humidity",
  "weather.wind": "Wind",
  "weather.feelsLike": "Feels like",
  "weather.uvIndex": "UV Index",
  "sidebar.home": "Home",
  "sidebar.rss": "RSS",
  "sidebar.schedule": "Schedule",
  "sidebar.vms": "VMs",
  "sidebar.config": "Config",
  "sidebar.admin": "Admin",
  "sidebar.studio": "Studio301",
  "sidebar.studioServices": "Server",
  "sidebar.disconnected": "Disconnected",
  "sidebar.linux": "Server",
  "sidebar.system": "System Monitor",
  "sidebar.ocr": "OCR",
  "sidebar.camera": "Camera",
  "sidebar.nas": "NAS Storage",
  "sidebar.newChat": "New Chat",
  "focus.history": "History",
  "focus.historyEmpty": 'No conversations yet.\nClick "New Chat" to start.',
  "focus.schedule": "Schedule",
  "focus.feeds": "Feeds (RSS)",
  "focus.vms": "Virtual Machines",
  "focus.toggle": "Toggle focus sidebar",
  "focus.toggleExpand": "Expand focus sidebar",
  "focus.toggleCollapse": "Collapse focus sidebar",
  "focus.rename": "Rename",
  "focus.delete": "Delete",
  "focus.deleteConfirm": 'Delete "{title}"?',
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",

  "time.justNow": "just now",
  "time.secondsAgo": "{n}s ago",
  "time.minutesAgo": "{n}m ago",
  "time.hoursAgo": "{n}h ago",
  "time.daysAgo": "{n}d ago",
  "time.never": "never",
  "time.dash": "—",

  "notification.title": "Notifications",
  "notification.center": "Notification center",
  "notification.markAllRead": "Mark all as read",
  "notification.empty": "No notifications",
  "notification.unreadBadge": "Notifications ({n} unread)",
  "notification.unreadBadgeZero": "Notifications",
  "notification.badge99Plus": "99+",

  "pageMonitor.monitoring": "Monitoring",
  "pageMonitor.paused": "Paused",
  "pageMonitor.checkNow": "Check now",
  "pageMonitor.pause": "Pause",
  "pageMonitor.enable": "Enable",
  "pageMonitor.edit": "Edit",
  "pageMonitor.delete": "Delete",
  "pageMonitor.deleteConfirm": 'Delete monitor "{title}"?',
  "pageMonitor.checkEvery": "Every {n} min",
  "pageMonitor.lastCheck": "Last checked",
  "pageMonitor.lastChange": "Last changed",
  "pageMonitor.changeDetected": "Change detected: {summary}",
  "pageMonitor.changeDetectedEmpty": "Change detected: (no summary)",
  "pageMonitor.editDialogTitle": "Edit page monitor",
  "pageMonitor.close": "Close",
  "pageMonitor.field.name": "Name",
  "pageMonitor.field.url": "URL",
  "pageMonitor.field.urlHint": "read-only",
  "pageMonitor.field.cssSelector": "CSS selector",
  "pageMonitor.field.cssSelectorHint":
    'default "body" — extract content area, ignore ads/nav',
  "pageMonitor.field.interval": "Check interval (min)",
  "pageMonitor.field.enabled": "Enable monitor",
  "pageMonitor.save": "Save",
  "pageMonitor.saving": "Saving…",
  "pageMonitor.saveFailed": "Save failed: {msg}",

  "feed.back": "Back to list",
  "feed.openOriginal": "Open original",
  "feed.read": "Read",
  "feed.noSummary": "(no summary)",
  "feed.loadFailed": "Load failed",
  "feed.loadingContent": "Loading content…",
  "feed.extracting": "Extracting content (about 3-5s)…",
  "feed.extractFailed": "Extract failed ({status})",
  "feed.extractFailedHint": '{msg}. Click "Open original" below to view.',
  "feed.empty.monitor":
    "Monitoring for page changes. A change summary will appear when detected.",
  "feed.empty.rss": "No articles yet. Fetched every 15 minutes.",

  "cron.title": "Background tasks",
  "cron.rss": "RSS fetcher",
  "cron.pageMonitor": "Page monitor",
  "cron.totalTicks": "{n} runs",
  "cron.errorCount": "· {n} err",
  "cron.lastError": "Last error: {msg}",

  "sse.notificationTitleWithBody": "{title}: {body}",
  "sse.pageMonitorChangeWithBody": "{label}: {body}",
  "sse.pageMonitorChangeDefault": "{label} has new changes",

  // 工作室服务离线 (StudioServiceOffline)
  "studio.offline.title": "Server not connected",
  "studio.offline.serviceHint":
    "{label} is a studio service — connect the server to view it",
  "studio.offline.steps": "Steps to connect:",
  "studio.offline.step1Label": "Start the server:",
  "studio.offline.step2Label": "Or start docker:",
  "studio.offline.step3":
    "Open the top-left menu → Settings → Studio Services to connect",
  "studio.offline.retry": "Re-check",
  "studio.serviceLabel.vms": "Virtual Machines",
  "studio.serviceLabel.nas": "NAS Storage",
  "studio.serviceLabel.ha": "HomeAssistant",

  // Studio Home (StudioHomePage)
  "home.studio.weatherEmpty.title": "No weather data yet",
  "home.studio.weatherEmpty.hint": "Unable to fetch local weather",
  "home.studio.serverOffline.title": "Server not connected",
  "home.studio.serverOffline.hint": "Studio services require a connection",
  "home.studio.centerButton.aria": "Open Arona focus panel",
  "home.studio.centerButton.alt": "Arona focus",
  "home.studio.greeting.morning": "Good morning",
  "home.studio.greeting.afternoon": "Good afternoon",
  "home.studio.greeting.evening": "Good evening",
  "home.studio.greeting.fallback": "Welcome",

  // Command Home (HomeCommandPage)
  "home.command.badge": "Arona · online",
  "home.command.hero.title": "Sensei, what can I help with today?",
  "home.command.hero.subtitle":
    "Arona has synced your memory, schedule, RSS feed, and studio status. Start a conversation, or switch to voice mode to handle tasks together.",
  "home.command.context.title": "Context",
  "home.command.context.panelTitle": "Arona's sync panel",
  "home.command.context.currentUser": "Current user",
  "home.command.context.userFallback": "Sensei",
  "home.command.context.intro":
    "Arona is ready to handle conversations, memory, and studio tasks.",
  "home.command.context.recentMemory": "Recent memory",
  "home.command.context.recentMemoryFallback": "No new session memories yet",
  "home.command.context.todaySchedule": "Today's schedule",
  "home.command.context.todayScheduleFallback": "Waiting for schedule events",
  "home.command.context.systemSummary": "System summary",
  "home.command.context.systemSummaryFallback":
    "CPU / Memory / RSS worker normal",
  "home.command.quickActions.aria": "Arona quick actions",
  "home.command.open": "Open",
  "home.command.quick.feeds.label": "Intel feed",
  "home.command.quick.feeds.desc": "RSS articles, summaries, and subscriptions",
  "home.command.quick.system.label": "Studio status",
  "home.command.quick.system.desc": "CPU, memory, network, and event stream",
  "home.command.quick.vms.label": "VM console",
  "home.command.quick.vms.desc": "Start, stop, and inspect virtual machines",
  "home.command.quick.schedule.label": "Schedule",
  "home.command.quick.schedule.desc": "Today's agenda and Arona's planning",
  "home.command.timeline.title": "Live Timeline",
  "home.command.timeline.subtitle": "Real-time event stream",
  "home.command.timeline.busStandby": "WebSocket bus standby",
  "home.command.timeline.now": "just now",
  "home.command.timeline.todayAt": "Today {time}",
  "home.command.timeline.aronaReady": "Arona synced the home context",
  "home.command.timeline.memorySummarized":
    "Recent session summary written to memory",
  "home.command.timeline.rssUpdated": "RSS intel feed refreshed",
  "home.command.timeline.presenceIdle": "Studio presence is idle",

  // Studio home tiles (Schedule / RSS / 右上角日期)
  "tile.schedule.title": "Schedule",
  "tile.schedule.empty": "No events today",
  "tile.schedule.footer.empty": "No events today",
  "tile.schedule.footer.count": "{n} event{s} today",
  "tile.rss.title": "RSS Feed",
  "tile.rss.empty": "No recent articles",
};

/**
 * 把 {key} 占位符替换成 args 里的值.
 * 例: format('检查间隔: {n} 分钟', { n: 5 }) → '检查间隔: 5 分钟'
 */
export function format(
  template: string,
  args: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(args[k] ?? `{${k}}`));
}

export function useT() {
  const locale = useLocaleStore((s) => s.locale);
  const dict = locale === "zh" ? zh : en;
  return (key: string, args?: Record<string, string | number>): string => {
    const raw = dict[key] ?? key;
    return args ? format(raw, args) : raw;
  };
}

/**
 * 非 hook 上下文用的纯函数版 (eg. utility 文件), 传入 locale 即可.
 */
export function tFor(
  locale: "zh" | "en",
  key: string,
  args?: Record<string, string | number>,
): string {
  const dict = locale === "zh" ? zh : en;
  const raw = dict[key] ?? key;
  return args ? format(raw, args) : raw;
}
