import { http, HttpResponse, delay } from "msw";
import { mockUsers } from "./data/users";
import { mockFeeds } from "./data/feeds";
import { mockSchedules } from "./data/schedules";
import { mockSystemMetrics, mockVMs, mockNetworkDevices } from "./data/system";
import { mockPageMonitors } from "./data/page-monitors";
import type { UserProfile } from "@/types/contracts";

export const handlers = [
  // Auth
  http.post("/api/auth/login", async ({ request }) => {
    const body = (await request.json()) as {
      username: string;
      password: string;
    };
    const user = mockUsers.find((u) => u.username === body.username);
    if (!user || (body.password !== "demo" && body.password !== "arona")) {
      return HttpResponse.json(
        { code: "UNAUTHORIZED", message: "Invalid credentials" },
        { status: 401 },
      );
    }
    return HttpResponse.json({
      access_token: `mock-jwt-${user.id}`,
      refresh_token: `mock-refresh-${user.id}`,
      user,
    });
  }),

  http.post("/api/auth/refresh", () => {
    return HttpResponse.json({ access_token: "mock-jwt-refreshed" });
  }),

  http.post("/api/auth/register", async ({ request }) => {
    const body = (await request.json()) as {
      username: string;
      password: string;
      displayName: string;
      avatar?: string;
    };
    const newUser = {
      id: `u_${Date.now()}`,
      username: body.username,
      display_name: body.displayName,
      avatar_url: null,
      email: null,
      role: "member" as const,
      studio_name: null,
      preferences: {},
      created_at: new Date().toISOString(),
    };
    return HttpResponse.json(
      {
        access_token: `mock-jwt-${newUser.id}`,
        refresh_token: `mock-refresh-${newUser.id}`,
        user: newUser,
      },
      { status: 201 },
    );
  }),

  http.post("/api/auth/logout", () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // User
  http.get("/api/me", () => {
    return HttpResponse.json(mockUsers[0] as UserProfile);
  }),

  http.patch("/api/me", async ({ request }) => {
    const body = (await request.json()) as {
      username?: string;
      display_name?: string;
    };
    if (body.username !== undefined) mockUsers[0].username = body.username;
    if (body.display_name !== undefined)
      mockUsers[0].display_name = body.display_name;
    return HttpResponse.json({
      id: mockUsers[0].id,
      username: mockUsers[0].username,
      display_name: mockUsers[0].display_name,
      role: mockUsers[0].role,
    });
  }),

  http.patch("/api/me/preferences", async ({ request }) => {
    const body = (await request.json()) as { key: string; value: unknown };
    const user = {
      ...mockUsers[0],
      preferences: { ...mockUsers[0].preferences, [body.key]: body.value },
    };
    return HttpResponse.json(user);
  }),

  // PATCH /api/me/notification-prefs — 邮件降级偏好 (P1#6)
  http.patch("/api/me/notification-prefs", async ({ request }) => {
    const body = (await request.json()) as {
      email?: string | null;
      notify_by_email?: boolean;
    };
    if (body.email !== undefined) mockUsers[0].email = body.email;
    if (body.notify_by_email !== undefined) {
      mockUsers[0].notify_by_email = body.notify_by_email;
    }
    return HttpResponse.json({
      email: mockUsers[0].email ?? null,
      notify_by_email: mockUsers[0].notify_by_email ?? false,
    });
  }),

  http.get("/api/users", () => {
    return HttpResponse.json(mockUsers);
  }),

  // Chat sessions
  http.get("/api/chat/sessions", () => {
    const now = Date.now();
    const sessions = [
      {
        id: "s_today1",
        title: "系统运行状态怎么样？",
        created_at: new Date(now - 3600_000).toISOString(),
      },
      {
        id: "s_today2",
        title: "帮我查一下最近的日程",
        created_at: new Date(now - 7200_000).toISOString(),
      },
      {
        id: "s_yesterday1",
        title: "创建一个 Ubuntu 虚拟机",
        created_at: new Date(now - 86400_000).toISOString(),
      },
      {
        id: "s_week1",
        title: "关于 NAS 存储的讨论",
        created_at: new Date(now - 172800_000).toISOString(),
      },
      {
        id: "s_older1",
        title: "Arona 能做什么？",
        created_at: new Date(now - 604800_000).toISOString(),
      },
    ];
    return HttpResponse.json(sessions);
  }),

  http.post("/api/chat/sessions", () => {
    return HttpResponse.json({
      id: `s_${Date.now()}`,
      user_id: "u_zhang",
      title: "新对话",
      started_at: new Date().toISOString(),
      ended_at: null,
    });
  }),

  http.get("/api/chat/sessions/:sessionId/messages", () => {
    return HttpResponse.json([]);
  }),

  // SSE streaming (mock)
  http.post("/api/chat/sessions/:sessionId/messages", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        };

        send("session_started", { session_id: "s_mock" });
        await delay(100);

        send("tool_call", { id: "t1", skill: "system.status", args: {} });
        await delay(300);

        send("tool_result", { id: "t1", ok: true, summary: "系统正常运行中" });
        await delay(200);

        const reply =
          "你好！我是 Arona，工作室智能助手。系统运行正常，今天有 3 个日程安排。有什么我可以帮你的吗？";
        for (let i = 0; i < reply.length; i++) {
          send("token", { delta: reply[i], index: i });
          await delay(30);
        }

        send("done", { message_id: `m_${Date.now()}`, tokens: reply.length });
        controller.close();
      },
    });

    return new HttpResponse(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });
  }),

  // Memory entries
  http.get("/api/memory/entries", () => {
    const now = Date.now();
    const entries = [
      {
        id: "m1",
        type: "fact",
        summary: "用户张轩宁，工作室主要使用者",
        hit_count: 42,
        enabled: true,
        decaying: false,
        created_at: new Date(now - 86400_000 * 30).toISOString(),
      },
      {
        id: "m2",
        type: "preference",
        summary: "偏好使用 Ubuntu 22.04 作为默认虚拟机镜像",
        hit_count: 15,
        enabled: true,
        decaying: false,
        created_at: new Date(now - 86400_000 * 20).toISOString(),
      },
      {
        id: "m3",
        type: "todo",
        summary: "周五前完成 ML 训练任务的结果分析",
        hit_count: 5,
        enabled: true,
        decaying: false,
        created_at: new Date(now - 86400_000 * 3).toISOString(),
      },
      {
        id: "m4",
        type: "relation",
        summary: '与李明合作项目"智能感知"',
        hit_count: 8,
        enabled: true,
        decaying: false,
        created_at: new Date(now - 86400_000 * 7).toISOString(),
      },
      {
        id: "m5",
        type: "emotion",
        summary: "对系统响应速度表示满意",
        hit_count: 3,
        enabled: true,
        decaying: true,
        created_at: new Date(now - 86400_000 * 14).toISOString(),
      },
      {
        id: "m6",
        type: "fact",
        summary: "工作室有两台 GPU 服务器，RTX 4090 × 4",
        hit_count: 20,
        enabled: true,
        decaying: false,
        created_at: new Date(now - 86400_000 * 10).toISOString(),
      },
      {
        id: "m7",
        type: "preference",
        summary: "习惯在早上 9 点查看系统状态",
        hit_count: 6,
        enabled: true,
        decaying: false,
        created_at: new Date(now - 86400_000 * 1).toISOString(),
      },
      {
        id: "m8",
        type: "todo",
        summary: "下周一预约 GPU 时间窗口",
        hit_count: 2,
        enabled: false,
        decaying: false,
        created_at: new Date(now - 3600_000 * 12).toISOString(),
      },
    ];
    return HttpResponse.json(entries);
  }),

  http.patch("/api/memory/entries/:entryId", async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: params.entryId, ...body });
  }),

  http.delete("/api/memory/entries/:entryId", () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Feeds
  http.get("/api/feeds", () => {
    return HttpResponse.json(mockFeeds);
  }),

  http.post("/api/feeds", async ({ request }) => {
    const body = (await request.json()) as { url: string; title?: string };
    const feed = {
      id: `f_${Date.now()}`,
      user_id: "u_zhang",
      url: body.url,
      title: body.title ?? new URL(body.url).hostname,
      enabled: true,
      created_at: new Date().toISOString(),
    };
    mockFeeds.push(feed);
    return HttpResponse.json(feed, { status: 201 });
  }),

  http.delete("/api/feeds/:feedId", ({ params }) => {
    const idx = mockFeeds.findIndex((f) => f.id === params.feedId);
    if (idx >= 0) mockFeeds.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/feeds/:feedId/refresh", ({ params }) => {
    const exists = mockFeeds.some((f) => f.id === params.feedId);
    if (!exists) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ fetched: 0, inserted: 0 });
  }),

  // Schedules
  http.get("/api/schedules", ({ request }) => {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    // shared 模式: 返回所有 (mock 数据未区分 visibility, 这里全量返回模拟"共享")
    // 其他 scope: 按 source 过滤 (real server behavior)
    if (scope === "shared") return HttpResponse.json(mockSchedules);
    const filtered = scope
      ? mockSchedules.filter((s) => s.source === scope)
      : mockSchedules;
    return HttpResponse.json(filtered);
  }),

  http.post("/api/schedules", async ({ request }) => {
    const body = (await request.json()) as {
      title: string;
      body?: string;
      starts_at: string;
    };
    const schedule = {
      id: `s_${Date.now()}`,
      user_id: "u_zhang",
      title: body.title,
      body: body.body ?? "",
      starts_at: body.starts_at,
      status: "pending" as const,
      source: "manual" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockSchedules.push(schedule);
    return HttpResponse.json(schedule, { status: 201 });
  }),

  http.patch("/api/schedules/:scheduleId", async ({ request, params }) => {
    const body = (await request.json()) as {
      title?: string;
      body?: string;
      starts_at?: string;
    };
    const idx = mockSchedules.findIndex((s) => s.id === params.scheduleId);
    if (idx < 0) return new HttpResponse(null, { status: 404 });
    const existing = mockSchedules[idx];
    const updated = {
      ...existing,
      ...(body.title !== undefined && { title: body.title }),
      ...(body.body !== undefined && { body: body.body }),
      ...(body.starts_at !== undefined && { starts_at: body.starts_at }),
      updated_at: new Date().toISOString(),
    };
    mockSchedules[idx] = updated;
    return HttpResponse.json(updated);
  }),

  http.delete("/api/schedules/:scheduleId", ({ params }) => {
    const idx = mockSchedules.findIndex((s) => s.id === params.scheduleId);
    if (idx >= 0) mockSchedules.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // Page monitors
  http.get("/api/page-monitors", () => {
    return HttpResponse.json(mockPageMonitors);
  }),

  http.post("/api/page-monitors", async ({ request }) => {
    const body = (await request.json()) as {
      url: string;
      label: string;
      css_selector?: string;
    };
    const monitor = {
      id: `pm_${Date.now()}`,
      user_id: "u_zhang",
      url: body.url,
      label: body.label,
      css_selector: body.css_selector ?? "body",
      last_hash: null,
      last_checked_at: null,
      last_changed_at: null,
      check_interval_min: 15,
      enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockPageMonitors.push(monitor);
    return HttpResponse.json(monitor, { status: 201 });
  }),

  http.patch("/api/page-monitors/:monitorId", async ({ request, params }) => {
    const body = (await request.json()) as {
      label?: string;
      css_selector?: string;
      enabled?: boolean;
    };
    const idx = mockPageMonitors.findIndex((m) => m.id === params.monitorId);
    if (idx < 0) return new HttpResponse(null, { status: 404 });
    mockPageMonitors[idx] = {
      ...mockPageMonitors[idx],
      ...body,
      updated_at: new Date().toISOString(),
    };
    return HttpResponse.json(mockPageMonitors[idx]);
  }),

  http.delete("/api/page-monitors/:monitorId", ({ params }) => {
    const idx = mockPageMonitors.findIndex((m) => m.id === params.monitorId);
    if (idx >= 0) mockPageMonitors.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/page-monitors/:monitorId/events", ({ params }) => {
    const exists = mockPageMonitors.some((m) => m.id === params.monitorId);
    if (!exists) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json([]);
  }),

  http.post("/api/page-monitors/:monitorId/check", ({ params }) => {
    const exists = mockPageMonitors.some((m) => m.id === params.monitorId);
    if (!exists) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({
      changed: false,
      first_seen: false,
      summary: null,
      hash: "mock-hash",
    });
  }),

  // System metrics
  http.get("/api/system/metrics", () => {
    return HttpResponse.json(mockSystemMetrics);
  }),

  // Cron status (P2 #28)
  http.get("/api/system/cron-status", () => {
    const now = new Date();
    return HttpResponse.json({
      crons: [
        {
          name: "rss",
          last_tick_at: new Date(now.getTime() - 60_000).toISOString(),
          last_ok_at: new Date(now.getTime() - 60_000).toISOString(),
          last_error: null,
          total_ticks: 128,
          total_errors: 2,
        },
        {
          name: "page_monitor",
          last_tick_at: new Date(now.getTime() - 30_000).toISOString(),
          last_ok_at: new Date(now.getTime() - 30_000).toISOString(),
          last_error: null,
          total_ticks: 92,
          total_errors: 0,
        },
      ],
    });
  }),

  // VMs
  http.get("/api/vms", () => {
    return HttpResponse.json(mockVMs);
  }),

  http.post("/api/vms", async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      spec_cpu?: number;
      spec_ram_mb?: number;
      spec_disk_gb?: number;
      hypervisor?: string;
    };
    const vm = {
      id: `vm_${Date.now()}`,
      user_id: "u_zhang",
      name: body.name,
      hypervisor: (body.hypervisor ?? "mock") as "libvirt" | "vbox" | "mock",
      spec_cpu: body.spec_cpu ?? 2,
      spec_ram_mb: body.spec_ram_mb ?? 4096,
      spec_disk_gb: body.spec_disk_gb ?? 50,
      status: "queued" as const,
      guest_agent_ok: false,
      exec_enabled: false,
      created_at: new Date().toISOString(),
    };
    mockVMs.push(vm);
    return HttpResponse.json(vm, { status: 201 });
  }),

  http.delete("/api/vms/:vmId", ({ params }) => {
    const idx = mockVMs.findIndex((v) => v.id === params.vmId);
    if (idx >= 0) mockVMs.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // Network devices
  http.get("/api/network/devices", () => {
    return HttpResponse.json(mockNetworkDevices);
  }),

  // ─── Skills marketplace (mock catalog — 跟 Server/center/src/skills.rs mock_catalog 同步) ───
  // devbypass / mock 模式下, 客户端走 MSW 拦截; 真实 server 跑起来后走 Rust 的 endpoints.

  ...(() => {
    const mockMarketCategories = [
      {
        domain: "development",
        domain_name: "开发",
        slug: "development",
        name: "开发",
        count: 4,
        child_slugs: ["frontend", "backend", "mobile", "full-stack", "web"],
        child_names: ["frontend", "backend", "mobile", "full-stack", "web"],
      },
      {
        domain: "devops",
        domain_name: "运维",
        slug: "devops",
        name: "运维",
        count: 4,
        child_slugs: [
          "docker",
          "kubernetes",
          "terraform",
          "ansible",
          "helm",
          "cloud",
        ],
        child_names: [
          "docker",
          "kubernetes",
          "terraform",
          "ansible",
          "helm",
          "cloud",
        ],
      },
      {
        domain: "data-ai",
        domain_name: "数据与AI",
        slug: "data-ai",
        name: "数据与AI",
        count: 4,
        child_slugs: [
          "ml",
          "llm",
          "rag",
          "data-analysis",
          "embedding",
          "vector",
        ],
        child_names: [
          "ml",
          "llm",
          "rag",
          "data-analysis",
          "embedding",
          "vector",
        ],
      },
      {
        domain: "design",
        domain_name: "设计",
        slug: "design",
        name: "设计",
        count: 2,
        child_slugs: ["ui", "ux", "figma", "tailwind", "css"],
        child_names: ["ui", "ux", "figma", "tailwind", "css"],
      },
      {
        domain: "databases",
        domain_name: "数据库",
        slug: "databases",
        name: "数据库",
        count: 3,
        child_slugs: ["postgres", "sql", "mongodb", "nosql", "redis"],
        child_names: ["postgres", "sql", "mongodb", "nosql", "redis"],
      },
      {
        domain: "testing-security",
        domain_name: "测试安全",
        slug: "testing-security",
        name: "测试安全",
        count: 2,
        child_slugs: ["testing", "security", "audit", "jest"],
        child_names: ["testing", "security", "audit", "jest"],
      },
      {
        domain: "documentation",
        domain_name: "文档",
        slug: "documentation",
        name: "文档",
        count: 1,
        child_slugs: ["docs", "markdown", "guide", "readme"],
        child_names: ["docs", "markdown", "guide", "readme"],
      },
      {
        domain: "content-media",
        domain_name: "内容媒体",
        slug: "content-media",
        name: "内容媒体",
        count: 2,
        child_slugs: ["blog", "video", "audio", "media"],
        child_names: ["blog", "video", "audio", "media"],
      },
      {
        domain: "business",
        domain_name: "商业",
        slug: "business",
        name: "商业",
        count: 1,
        child_slugs: ["sales", "marketing", "finance", "project-management"],
        child_names: ["sales", "marketing", "finance", "project-management"],
      },
      {
        domain: "tools",
        domain_name: "工具",
        slug: "tools",
        name: "工具",
        count: 3,
        child_slugs: ["cli", "git", "automation", "ide", "productivity"],
        child_names: ["cli", "git", "automation", "ide", "productivity"],
      },
    ];

    const mockMarketCatalog = [
      [
        "frontend-react",
        "Frontend React",
        "development",
        ["react", "frontend", "ui", "web"],
        ["React", "frontend", "组件"],
        1820,
      ],
      [
        "backend-fastapi",
        "Backend FastAPI",
        "development",
        ["python", "backend", "api", "fastapi"],
        ["FastAPI", "Python", "REST"],
        2410,
      ],
      [
        "mobile-flutter",
        "Mobile Flutter",
        "development",
        ["flutter", "mobile", "dart", "ios", "android"],
        ["Flutter", "跨平台"],
        980,
      ],
      [
        "fullstack-nextjs",
        "Full-stack Next.js",
        "development",
        ["nextjs", "react", "fullstack", "ssr"],
        ["Next.js", "SSR"],
        3050,
      ],
      [
        "docker-compose",
        "Docker Compose",
        "devops",
        ["docker", "container", "compose", "devops"],
        ["Docker", "容器"],
        1740,
      ],
      [
        "kubernetes-ops",
        "Kubernetes Ops",
        "devops",
        ["kubernetes", "k8s", "devops", "cloud"],
        ["Kubernetes", "K8s"],
        2210,
      ],
      [
        "terraform-iac",
        "Terraform IaC",
        "devops",
        ["terraform", "iac", "aws", "gcp", "azure"],
        ["Terraform", "基础设施"],
        1560,
      ],
      [
        "ansible-playbooks",
        "Ansible Playbooks",
        "devops",
        ["ansible", "automation", "config"],
        ["Ansible", "自动化"],
        880,
      ],
      [
        "ml-pytorch",
        "ML PyTorch",
        "data-ai",
        ["pytorch", "ml", "deep-learning", "ai"],
        ["PyTorch", "深度学习"],
        3120,
      ],
      [
        "llm-prompt-eng",
        "LLM Prompt Engineering",
        "data-ai",
        ["llm", "prompt", "gpt", "ai", "rag"],
        ["LLM", "Prompt", "RAG"],
        2750,
      ],
      [
        "data-analysis-pandas",
        "Data Analysis Pandas",
        "data-ai",
        ["pandas", "data", "analytics", "python"],
        ["Pandas", "数据分析"],
        1340,
      ],
      [
        "vector-db-rag",
        "Vector DB RAG",
        "data-ai",
        ["rag", "vector", "embedding", "ai"],
        ["RAG", "向量数据库"],
        1920,
      ],
      [
        "design-figma",
        "Design Figma",
        "design",
        ["figma", "design", "ui", "ux"],
        ["Figma", "UI设计"],
        1180,
      ],
      [
        "tailwind-ui",
        "Tailwind UI Kit",
        "design",
        ["tailwind", "css", "design", "ui"],
        ["Tailwind", "UI"],
        2890,
      ],
      [
        "postgres-sql",
        "PostgreSQL SQL",
        "databases",
        ["postgres", "sql", "database", "postgresql"],
        ["PostgreSQL", "SQL"],
        2050,
      ],
      [
        "mongodb-nosql",
        "MongoDB NoSQL",
        "databases",
        ["mongodb", "nosql", "database"],
        ["MongoDB", "NoSQL"],
        1430,
      ],
      [
        "redis-cache",
        "Redis Cache",
        "databases",
        ["redis", "cache", "database"],
        ["Redis", "缓存"],
        1610,
      ],
      [
        "testing-jest",
        "Testing Jest",
        "testing-security",
        ["jest", "testing", "test"],
        ["Jest", "单元测试"],
        1680,
      ],
      [
        "security-audit",
        "Security Audit",
        "testing-security",
        ["security", "audit", "vuln"],
        ["安全", "审计"],
        740,
      ],
      [
        "documentation-mkdocs",
        "Documentation MkDocs",
        "documentation",
        ["docs", "markdown", "documentation"],
        ["MkDocs", "文档"],
        690,
      ],
      [
        "blog-seo",
        "Blog SEO",
        "content-media",
        ["blog", "seo", "content", "article"],
        ["博客", "SEO"],
        520,
      ],
      [
        "video-ffmpeg",
        "Video ffmpeg",
        "content-media",
        ["video", "ffmpeg", "media"],
        ["ffmpeg", "视频处理"],
        980,
      ],
      [
        "project-mgmt",
        "Project Management",
        "business",
        ["project", "management", "planning"],
        ["项目管理", "OKR"],
        410,
      ],
      [
        "cli-productivity",
        "CLI Productivity",
        "tools",
        ["cli", "shell", "bash", "productivity"],
        ["CLI", "Shell"],
        1380,
      ],
      [
        "git-workflow",
        "Git Workflow",
        "tools",
        ["git", "workflow", "version-control"],
        ["Git", "工作流"],
        1850,
      ],
      [
        "automation-n8n",
        "Automation n8n",
        "tools",
        ["automation", "workflow", "n8n"],
        ["自动化", "n8n"],
        1120,
      ],
    ] as const;

    const buildMarketSkill = ([
      slug,
      name,
      category,
      tags,
      descKws,
      stars,
    ]: (typeof mockMarketCatalog)[number]) => {
      const desc = `关于 ${name} 的实用技能集: 涵盖 ${descKws.join("、")} 等常见场景, 适合 ${category} 工程师快速上手。`;
      return {
        slug,
        name,
        description: desc,
        description_zh: desc,
        source: "skillsmp",
        source_url: `https://skillsmp.com/skills/${slug}`,
        detail_url: `https://skillsmp.com/skills/${slug}`,
        author: "skillsmp-community",
        stars,
        tags: [...tags],
        category,
        updated_at: 1718000000,
      };
    };

    return [
      http.get("/api/skills/marketplace/categories", () => {
        return HttpResponse.json({
          categories: mockMarketCategories,
          total: mockMarketCategories.length,
        });
      }),

      http.get("/api/skills/marketplace/trending", ({ request }) => {
        const url = new URL(request.url);
        const limit = Number(url.searchParams.get("limit") ?? "30");
        const skills = mockMarketCatalog
          .map(buildMarketSkill)
          .sort((a, b) => b.stars - a.stars)
          .slice(0, limit);
        return HttpResponse.json({
          skills,
          total: skills.length,
          cached: true,
        });
      }),

      http.get("/api/skills/marketplace/search", ({ request }) => {
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") ?? "").toLowerCase();
        const category = url.searchParams.get("category") ?? "";
        const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
        const limit = Math.max(
          1,
          Number(url.searchParams.get("limit") ?? "20"),
        );
        const sortBy = url.searchParams.get("sortBy");

        let matched = mockMarketCatalog.map(buildMarketSkill).filter((s) => {
          if (category && s.category !== category) return false;
          if (!q || q === "skill") return true;
          const tagsJoined = s.tags.join(" ");
          return (
            s.name.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q) ||
            s.author.toLowerCase().includes(q) ||
            tagsJoined.toLowerCase().includes(q)
          );
        });

        if (sortBy === "stars")
          matched = matched.sort((a, b) => b.stars - a.stars);

        const total = matched.length;
        const start = (page - 1) * limit;
        const slice = matched.slice(start, start + limit);
        return HttpResponse.json({ skills: slice, total, page });
      }),

      // 已装 marketplace skills — 走 IDB / 内存 mock, 这里给个空列表让默认 marketplace tab 不报"已装"
      http.get("/api/skills/marketplace/installed", () => {
        return HttpResponse.json({ skills: [], slugs: [], total: 0 });
      }),

      // 安装 skill — client-only 模式 (devbypass) 下, 假装 server 接受安装,
      // 真正的"下载到 client 目录" 走 useLocalResource → IDB (table: 'skills').
      // 这里只回 200 + skill 元数据, 让 installMutation onSuccess 链路打通.
      http.post("/api/skills/marketplace/install", async ({ request }) => {
        const body = (await request.json()) as {
          slug: string;
          name?: string;
          source?: string;
          source_url?: string;
          detail_url?: string;
        };
        if (!body.slug) {
          return HttpResponse.json(
            { error: "slug is required" },
            { status: 400 },
          );
        }
        // 从 catalog 里补全 name/source_url (client 端 install 时可能只传了 slug)
        const meta = mockMarketCatalog.find(([slug]) => slug === body.slug);
        const built = meta ? buildMarketSkill(meta) : null;
        const name = body.name ?? built?.name ?? body.slug;
        const source_url = body.source_url ?? built?.source_url ?? "";
        const detail_url = body.detail_url || built?.detail_url || "";
        const installedAt = new Date().toISOString();
        return HttpResponse.json(
          {
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            slug: body.slug,
            name,
            version: "0.1.0",
            description: built?.description ?? "",
            category: built?.category ?? "general",
            source: body.source ?? "marketplace",
            source_url,
            detail_url,
            installed_at: installedAt,
            installed: true,
          },
          { status: 201 },
        );
      }),

      // 列出已装 — 跟 marketplace/installed 区分: 这是 useLocalResource 用来同步的"原始"列表.
      // 客户端模式下永远空 (真正的列表在 IDB table 'skills' 里).
      http.get("/api/skills/installed", () => {
        return HttpResponse.json([]);
      }),

      http.delete("/api/skills/:slug", () => {
        return new HttpResponse(null, { status: 204 });
      }),
    ];
  })(),
];
