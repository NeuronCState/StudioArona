/**
 * Legacy API schema snapshot. New Rust-center contracts belong in contracts.ts
 * until the server exposes a reproducible OpenAPI document.
 */

export interface paths {
  "/api/auth/login": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** 用户名密码登录 */
    post: operations["login"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/auth/refresh": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** 刷新 access token */
    post: operations["refreshToken"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/auth/logout": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** 注销 */
    post: operations["logout"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/me": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** 当前用户信息 + 偏好 */
    get: operations["getMe"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/me/preferences": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** 更新个人偏好 */
    patch: operations["updatePreferences"];
    trace?: never;
  };
  "/api/users": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** 工作室成员列表（admin） */
    get: operations["listUsers"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/chat/sessions": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** 创建新对话 */
    post: operations["createSession"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/chat/sessions/{sessionId}/messages": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** 历史消息 */
    get: operations["getMessages"];
    put?: never;
    /**
     * SSE 流式对话
     * @description 响应为 text/event-stream
     */
    post: operations["streamMessage"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/schedules": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** 日程列表（当前用户） */
    get: operations["listSchedules"];
    put?: never;
    /** 创建日程 */
    post: operations["createSchedule"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/schedules/{scheduleId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** 删除日程 */
    delete: operations["deleteSchedule"];
    options?: never;
    head?: never;
    /** 更新日程 */
    patch: operations["updateSchedule"];
    trace?: never;
  };
  "/api/feeds": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** RSS 订阅源列表（当前用户） */
    get: operations["listFeeds"];
    put?: never;
    /** 添加 RSS 订阅 */
    post: operations["createFeed"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/feeds/{feedId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** 单个订阅源详情 */
    get: operations["getFeed"];
    put?: never;
    post?: never;
    /** 删除订阅源 */
    delete: operations["deleteFeed"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/feeds/{feedId}/items": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** 订阅源文章列表 */
    get: operations["listFeedItems"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/feeds/items/{itemId}/read": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** 标记已读 */
    post: operations["markFeedItemRead"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/feeds/items/{itemId}/star": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** 切换收藏 */
    post: operations["toggleFeedItemStar"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/memory/entries": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** 记忆列表（当前用户） */
    get: operations["listMemoryEntries"];
    put?: never;
    /** 写入记忆 */
    post: operations["createMemoryEntry"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/memory/entries/{entryId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** 获取单条记忆 */
    get: operations["getMemoryEntry"];
    put?: never;
    post?: never;
    /** 删除记忆 */
    delete: operations["deleteMemoryEntry"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/system/status": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** 系统状态概览（聚合 cpu/mem/disk/gpu + 在线设备数 + VM 数） */
    get: operations["getSystemStatus"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/system/metrics": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** 硬件监控快照 */
    get: operations["getMetrics"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/vms": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** 虚拟机列表（当前用户） */
    get: operations["listVMs"];
    put?: never;
    /** 注册虚拟机 */
    post: operations["createVM"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/vms/{vmId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** 删除虚拟机 */
    delete: operations["deleteVM"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/vms/{vmId}/start": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** 启动虚拟机 */
    post: operations["startVM"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/vms/{vmId}/stop": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** 停止虚拟机 */
    post: operations["stopVM"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/vms/{vmId}/console": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** 读取 VM 串口日志末尾 */
    get: operations["readVMConsole"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/vms/{vmId}/exec_enable": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** 开关此 VM 的 exec 权限 */
    post: operations["toggleVMExec"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/network/devices": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** 局域网设备列表 */
    get: operations["listNetworkDevices"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/assets/live2d/arona/manifest.json": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** 阿洛娜 Live2D 资源清单 */
    get: operations["getAronaManifest"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/assets/live2d/arona/{path}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** 阿洛娜 Live2D 静态资产 */
    get: operations["serveAronaAsset"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/assets/scenes/{path}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** 3D 场景 .glb 资产 */
    get: operations["serveSceneAsset"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    User: {
      id: string;
      username: string;
      display_name: string;
      /** @enum {string} */
      role: "admin" | "member";
      /** Format: date-time */
      created_at: string;
    };
    UserProfile: components["schemas"]["User"] & {
      preferences: {
        [key: string]: unknown;
      };
      face_enrolled: boolean;
    };
    ChatSession: {
      id: string;
      user_id: string;
      title?: string;
      /** @enum {string} */
      mode?: "text";
      /** Format: date-time */
      created_at: string;
      /** Format: date-time */
      updated_at?: string;
      /** Format: date-time */
      ended_at?: string;
    };
    ChatMessage: {
      id: string;
      session_id: string;
      /** @enum {string} */
      role: "user" | "assistant" | "tool";
      content: string;
      tool_calls?: {
        [key: string]: unknown;
      }[];
      /** Format: date-time */
      created_at: string;
    };
    Schedule: {
      id: string;
      user_id: string;
      title: string;
      body?: string;
      /** Format: date-time */
      starts_at: string;
      /** Format: date-time */
      ends_at?: string;
      rrule?: string;
      reminder_min?: number;
      /** @enum {string} */
      status: "pending" | "done" | "cancelled";
      /** @enum {string} */
      source: "manual" | "agent" | "rss" | "ha";
      /** Format: date-time */
      created_at: string;
      /** Format: date-time */
      updated_at: string;
    };
    Feed: {
      id: string;
      user_id: string;
      /** Format: uri */
      url: string;
      title?: string;
      category?: string;
      enabled: boolean;
      /** Format: date-time */
      last_fetched_at?: string;
      /** Format: date-time */
      created_at: string;
    };
    FeedItem: {
      id: string;
      feed_id: string;
      guid: string;
      title: string;
      link?: string;
      summary?: string;
      /** Format: date-time */
      published_at?: string;
      read: boolean;
      starred: boolean;
      /** Format: date-time */
      fetched_at: string;
    };
    MemoryEntry: {
      id: string;
      user_id: string;
      kind: string;
      content: string;
      tags?: string[];
      source_msg_id?: string;
      weight: number;
      /** Format: date-time */
      created_at: string;
      /** Format: date-time */
      expires_at?: string;
    };
    SystemStatus: {
      /** Format: date-time */
      ts: string;
      cpu_pct: number;
      mem_pct: number;
      disk_pct: number;
      gpu_count: number;
      vm_count: number;
      online_devices: number;
    };
    GpuProcess: {
      pid: number;
      name: string;
      user: string;
      gpu_mem_mb: number;
    };
    GPU: {
      name: string;
      mem_total_mb: number;
      mem_used_mb: number;
      util_pct: number;
      temp_c: number;
      processes: components["schemas"]["GpuProcess"][];
    };
    CPUCore: {
      index: number;
      util_pct: number;
      freq_mhz: number;
    };
    DiskUsage: {
      mount: string;
      total_gb: number;
      used_gb: number;
      util_pct: number;
    };
    TrainingJob: {
      id: string;
      user: string;
      name: string;
      /** @enum {string} */
      status: "running" | "paused" | "done" | "error";
      gpu_util_pct: number;
      current_step: number;
      total_steps?: number | null;
      elapsed_h: number;
      eta_h?: number | null;
    };
    SystemMetrics: {
      /** Format: date-time */
      ts: string;
      cpu_cores: components["schemas"]["CPUCore"][];
      mem_total_mb: number;
      mem_used_mb: number;
      disks: components["schemas"]["DiskUsage"][];
      gpus: components["schemas"]["GPU"][];
      training_jobs: components["schemas"]["TrainingJob"][];
    };
    VM: {
      id: string;
      user_id: string;
      name: string;
      /** @enum {string} */
      hypervisor: "libvirt" | "vbox" | "mock";
      spec_cpu?: number;
      spec_ram_mb?: number;
      spec_disk_gb?: number;
      /** @enum {string} */
      status:
        | "queued"
        | "creating"
        | "running"
        | "stopped"
        | "error"
        | "destroyed";
      ip?: string;
      notes?: string;
      console_path?: string;
      guest_agent_ok: boolean;
      exec_enabled: boolean;
      /** Format: date-time */
      created_at: string;
    };
    NetworkDevice: {
      ip: string;
      mac: string;
      hostname: string;
      vendor: string;
      online: boolean;
      /** Format: date-time */
      last_seen: string;
    };
    Error: {
      code: string;
      message: string;
      trace_id: string;
    };
  };
  responses: {
    /** @description 未认证 */
    Unauthorized: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        "application/json": components["schemas"]["Error"];
      };
    };
  };
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  login: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          username: string;
          password: string;
        };
      };
    };
    responses: {
      /** @description 登录成功 */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            access_token: string;
            refresh_token: string;
            user: components["schemas"]["User"];
          };
        };
      };
      401: components["responses"]["Unauthorized"];
    };
  };
  refreshToken: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description 刷新成功 */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            access_token: string;
          };
        };
      };
    };
  };
  logout: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description 已注销 */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getMe: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["UserProfile"];
        };
      };
    };
  };
  updatePreferences: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        "application/json": {
          key: string;
          value: unknown;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["UserProfile"];
        };
      };
    };
  };
  listUsers: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["User"][];
        };
      };
    };
  };
  createSession: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ChatSession"];
        };
      };
    };
  };
  getMessages: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ChatMessage"][];
        };
      };
    };
  };
  streamMessage: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          content: string;
        };
      };
    };
    responses: {
      /** @description SSE 事件流 */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "text/event-stream": unknown;
        };
      };
    };
  };
  listSchedules: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Schedule"][];
        };
      };
    };
  };
  createSchedule: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          title: string;
          body?: string;
          /** Format: date-time */
          starts_at: string;
          /** Format: date-time */
          ends_at?: string;
          rrule?: string;
          reminder_min?: number;
          /** @default pending */
          status?: string;
          /** @default manual */
          source?: string;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Schedule"];
        };
      };
    };
  };
  deleteSchedule: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        scheduleId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description 已删除 */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  updateSchedule: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        scheduleId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        "application/json": {
          title?: string;
          body?: string;
          /** Format: date-time */
          starts_at?: string;
          /** Format: date-time */
          ends_at?: string;
          rrule?: string;
          reminder_min?: number;
          status?: string;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Schedule"];
        };
      };
    };
  };
  listFeeds: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Feed"][];
        };
      };
    };
  };
  createFeed: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          /** Format: uri */
          url: string;
          title?: string;
          category?: string;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Feed"];
        };
      };
    };
  };
  getFeed: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        feedId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Feed"];
        };
      };
    };
  };
  deleteFeed: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        feedId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description 已删除 */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listFeedItems: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        feedId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["FeedItem"][];
        };
      };
    };
  };
  markFeedItemRead: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        itemId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        "application/json": {
          /** @default true */
          read?: boolean;
        };
      };
    };
    responses: {
      /** @description 已更新 */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  toggleFeedItemStar: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        itemId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        "application/json": {
          /** @default true */
          starred?: boolean;
        };
      };
    };
    responses: {
      /** @description 已更新 */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listMemoryEntries: {
    parameters: {
      query?: {
        kind?: string;
        tag?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["MemoryEntry"][];
        };
      };
    };
  };
  createMemoryEntry: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          kind: string;
          content: string;
          tags?: string[];
          /** @default 1 */
          weight?: number;
          /** Format: date-time */
          expires_at?: string;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["MemoryEntry"];
        };
      };
    };
  };
  getMemoryEntry: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        entryId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["MemoryEntry"];
        };
      };
    };
  };
  deleteMemoryEntry: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        entryId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description 已删除 */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  getSystemStatus: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SystemStatus"];
        };
      };
    };
  };
  getMetrics: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SystemMetrics"];
        };
      };
    };
  };
  listVMs: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["VM"][];
        };
      };
    };
  };
  createVM: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          name: string;
          /** @enum {string} */
          hypervisor: "libvirt" | "vbox" | "mock";
          spec_cpu?: number;
          spec_ram_mb?: number;
          spec_disk_gb?: number;
          ip?: string;
          notes?: string;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["VM"];
        };
      };
    };
  };
  deleteVM: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        vmId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description 已删除 */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  startVM: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        vmId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["VM"];
        };
      };
    };
  };
  stopVM: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        vmId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["VM"];
        };
      };
    };
  };
  readVMConsole: {
    parameters: {
      query?: {
        lines?: number;
      };
      header?: never;
      path: {
        vmId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            vm_id: string;
            lines: string;
            truncated?: boolean;
          };
        };
      };
    };
  };
  toggleVMExec: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        vmId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          enabled: boolean;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["VM"];
        };
      };
    };
  };
  listNetworkDevices: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["NetworkDevice"][];
        };
      };
    };
  };
  getAronaManifest: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            modelPath?: string;
            expressions?: {
              [key: string]: string;
            };
            motions?: {
              [key: string]: string[];
            };
          };
        };
      };
    };
  };
  serveAronaAsset: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        path: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description 资产文件 */
      200: {
        headers: {
          /** @description max-age=86400 */
          "Cache-Control"?: string;
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  serveSceneAsset: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        path: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description 场景资产文件 */
      200: {
        headers: {
          /** @description max-age=86400 */
          "Cache-Control"?: string;
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
}
