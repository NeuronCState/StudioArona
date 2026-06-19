/**
 * Skills marketplace — bundled catalog data + types.
 *
 * Marketplace is 100% client-side per architecture principle (no server
 * dependency). The catalog below was migrated from
 * `Client/web/src/mocks/handlers.ts` (the original MSW mock) after
 * deciding that fetching the data through MSW added an unnecessary
 * indirection — devbypass mode short-circuits `api/client.ts` with
 * OFFLINE before MSW can intercept.
 *
 * If a real remote marketplace (skillsmp or similar) is reintroduced,
 * swap the data source here. Don't reintroduce server endpoints for
 * marketplace catalog.
 */

export interface MarketSkill {
  slug: string;
  name: string;
  description: string;
  description_zh: string;
  source: string;
  source_url: string;
  detail_url?: string;
  author: string;
  stars: number;
  tags: string[];
  category: string;
  installed?: boolean;
  updated_at?: number;
}

export interface CategoryEntry {
  domain: string;
  domain_name: string;
  slug: string;
  name: string;
  count: number;
  child_slugs: string[];
  child_names: string[];
}

export interface CategoriesResponse {
  categories: CategoryEntry[];
  total: number;
}

export interface SearchResponse {
  skills: MarketSkill[];
  total: number;
  page: number;
}

export interface TrendingResponse {
  skills: MarketSkill[];
  total: number;
  cached: boolean;
}

/** Raw catalog tuple shape — `[slug, name, category, tags, descKws, stars]`. */
export type MarketCatalogTuple = readonly [
  string,
  string,
  string,
  readonly string[],
  readonly string[],
  number,
];

/**
 * Top-level marketplace categories. Order matters: `marketplace-service`
 * emits this verbatim and `MarketplaceTab` falls back to a default domain
 * order when this list is unavailable.
 */
export const MARKET_CATEGORIES: readonly CategoryEntry[] = [
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

/**
 * Bundled skill catalog (26 entries).
 * Each tuple: [slug, name, category, tags, descKws, stars].
 */
export const MARKET_CATALOG: readonly MarketCatalogTuple[] = [
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
];

/** Build a `MarketSkill` from a raw catalog tuple. */
export function buildMarketSkill(
  tuple: MarketCatalogTuple,
): MarketSkill {
  const [slug, name, category, tags, descKws, stars] = tuple;
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
}

/** Look up the source catalog tuple by slug (used by the install mutation to
 *  hydrate a `MarketSkill` when the caller only passed the slug). */
export function findCatalogTuple(
  slug: string,
): MarketCatalogTuple | undefined {
  return MARKET_CATALOG.find(([s]) => s === slug);
}