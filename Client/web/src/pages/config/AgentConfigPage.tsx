import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  Check,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Store,
  TestTube2,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";
import { Button, Tabs } from "@javis/ui-kit";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  useSonettoConfigStore,
  type SonettoProviderConfig,
} from "@/stores/sonetto-config";
import { MarketplaceTab } from "./marketplace/MarketplaceTab";

type Tab =
  | "providers"
  | "persona"
  | "tools"
  | "skills"
  | "marketplace"
  | "memory"
  | "advanced";
type PersonaKey = "agents" | "soul" | "user";
interface ToolConfig {
  name: string;
  description: string;
  enabled: boolean;
  source: "native" | "mcp";
}
interface Configuration {
  personas: Record<PersonaKey, string>;
  credentials: Record<string, boolean>;
  tools: ToolConfig[];
  mcp_servers: Record<string, Record<string, unknown>>;
}
interface Skill {
  slug: string;
  name: string;
  description: string;
  content: string;
}
interface Memory {
  id: string;
  description: string;
  theme: string;
}

const tabs = [
  { id: "providers", label: "模型" },
  { id: "persona", label: "人格" },
  { id: "tools", label: "工具与凭据" },
  { id: "skills", label: "已安装技能" },
  { id: "marketplace", label: "技能市场" },
  { id: "memory", label: "Memory" },
  { id: "advanced", label: "高级" },
];
const credentials = [
  ["zhipuai_api_key", "智谱视觉"],
  ["todoist_api_token", "Todoist"],
  ["uapis_api_key", "UAPI"],
  ["amap_api_key", "高德地图"],
  ["tavily_api_key", "Tavily"],
] as const;
const emptyProvider = (): SonettoProviderConfig => ({
  id: "",
  provider_type: "openai",
  label: "",
  api_key: "",
  base_url: "",
  models: [],
  context_window: 128000,
  enabled: true,
});
const emptyMemory = (): Memory => ({ id: "", theme: "", description: "" });
const inputClass =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]";

async function json<T>(
  base: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      payload.detail || `${response.status} ${response.statusText}`,
    );
  }
  return response.json() as Promise<T>;
}

export function AgentConfigPage() {
  const reducedMotion = useReducedMotion();
  const base = useSonettoConfigStore((s) => s.sonettoBaseUrl);
  const setBase = useSonettoConfigStore((s) => s.setSonettoBaseUrl);
  const [tab, setTab] = useState<Tab>("providers");
  const [providers, setProviders] = useState<SonettoProviderConfig[]>([]);
  const [config, setConfig] = useState<Configuration | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [provider, setProvider] = useState(emptyProvider());
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [skill, setSkill] = useState({ slug: "", content: "" });
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [memory, setMemory] = useState(emptyMemory());
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [mcp, setMcp] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const previousTabIndex = useRef(0);
  const tabIndex = tabs.findIndex((item) => item.id === tab);
  const tabDirection = tabIndex >= previousTabIndex.current ? 1 : -1;

  useEffect(() => {
    previousTabIndex.current = tabIndex;
  }, [tabIndex]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [p, c, s, m] = await Promise.all([
        json<{ providers: SonettoProviderConfig[] }>(base, "/api/providers"),
        json<Configuration>(base, "/api/config"),
        json<{ skills: Skill[] }>(base, "/api/skills"),
        json<{
          sections: Array<{ theme: string; items: Omit<Memory, "theme">[] }>;
        }>(base, "/api/memories"),
      ]);
      setProviders(p.providers);
      setConfig(c);
      setSkills(s.skills);
      useSonettoConfigStore.getState().replaceProviders(p.providers);
      setMemories(
        m.sections.flatMap((section) =>
          section.items.map((item) => ({ ...item, theme: section.theme })),
        ),
      );
      setMcp(JSON.stringify(c.mcp_servers, null, 2));
    } catch (error) {
      setMessage({
        error: true,
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (task: () => Promise<void>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await task();
      setMessage({ error: false, text: success });
    } catch (error) {
      setMessage({
        error: true,
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };
  const disabled = useMemo(
    () =>
      config?.tools
        .filter((tool) => tool.source === "native" && !tool.enabled)
        .map((tool) => tool.name) ?? [],
    [config],
  );

  if (loading && !config)
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-[var(--color-accent)]" />
      </div>
    );
  return (
    <div className="studio-page mx-auto min-h-full max-w-6xl px-6 py-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase text-stone-400">Agent</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">
            配置
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${message?.error ? "bg-red-500" : "bg-emerald-500"}`}
          />
          <span className="max-w-72 truncate text-xs text-[var(--color-text-muted)]">
            {base}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void load()}
            aria-label="刷新"
          >
            <RefreshCw size={14} />
          </Button>
        </div>
      </header>
      <div className="overflow-x-auto">
        <Tabs
          tabs={tabs}
          activeTab={tab}
          onTabChange={(id) => setTab(id as Tab)}
          layoutId="agent-config-tabs"
        />
      </div>
      <AnimatePresence initial={false}>
        {message && (
          <motion.div
            key={message.text}
            initial={reducedMotion ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: reducedMotion ? 0 : 0.16 }}
            className={`mt-4 border-l-2 px-3 py-2 text-sm ${message.error ? "border-red-500 text-red-600" : "border-emerald-500 text-emerald-700"}`}
          >
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>
      <main className="relative mt-6 overflow-x-hidden">
        <AnimatePresence initial={false} mode="wait" custom={tabDirection}>
          <motion.div
            key={tab}
            custom={tabDirection}
            variants={{
              enter: (direction: number) =>
                reducedMotion
                  ? { opacity: 1 }
                  : { opacity: 0, x: direction * 18 },
              center: { opacity: 1, x: 0 },
              exit: (direction: number) =>
                reducedMotion
                  ? { opacity: 1 }
                  : { opacity: 0, x: direction * -12 },
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              duration: reducedMotion ? 0 : 0.2,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {tab === "providers" && (
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
                <section>
                  <Title
                    icon={Settings2}
                    text="模型提供商"
                    count={providers.length}
                  />
                  <Rows>
                    {providers.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 py-4"
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${item.enabled !== false ? "bg-emerald-500" : "bg-stone-300"}`}
                        />
                        <button
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            setProvider({ ...item });
                            setEditingProvider(item.id);
                          }}
                        >
                          <b className="block truncate text-sm">{item.label}</b>
                          <span className="block truncate text-xs text-[var(--color-text-muted)]">
                            {item.models.join(", ") || item.base_url}
                          </span>
                        </button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void act(async () => {
                              await json(
                                base,
                                `/api/providers/${item.id}/test`,
                                { method: "POST" },
                              );
                            }, `${item.label} 连接正常`)
                          }
                        >
                          <TestTube2 size={14} /> 测试
                        </Button>
                        <Toggle
                          checked={item.enabled !== false}
                          label={item.label}
                          onChange={(enabled) =>
                            void act(async () => {
                              await json(base, `/api/providers/${item.id}`, {
                                method: "PUT",
                                body: JSON.stringify({ enabled }),
                              });
                              await load();
                            }, "状态已更新")
                          }
                        />
                        <IconDelete
                          label={item.label}
                          onDelete={() =>
                            void act(async () => {
                              await json(base, `/api/providers/${item.id}`, {
                                method: "DELETE",
                              });
                              await load();
                            }, "Provider 已删除")
                          }
                        />
                      </div>
                    ))}
                  </Rows>
                </section>
                <section className="border-l border-[var(--color-border)] pl-6">
                  <Title
                    icon={editingProvider ? Settings2 : Plus}
                    text={editingProvider ? "编辑模型" : "添加模型"}
                  />
                  <div className="space-y-3">
                    <Field label="标识">
                      <input
                        className={inputClass}
                        value={provider.id}
                        disabled={Boolean(editingProvider)}
                        onChange={(e) =>
                          setProvider({ ...provider, id: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="名称">
                      <input
                        className={inputClass}
                        value={provider.label}
                        onChange={(e) =>
                          setProvider({ ...provider, label: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Base URL">
                      <input
                        className={inputClass}
                        value={provider.base_url}
                        onChange={(e) =>
                          setProvider({ ...provider, base_url: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="API Key">
                      <input
                        className={inputClass}
                        type="password"
                        value={provider.api_key}
                        onChange={(e) =>
                          setProvider({ ...provider, api_key: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="模型">
                      <div className="flex gap-2">
                        <input
                          className={inputClass}
                          value={provider.models.join(", ")}
                          onChange={(e) =>
                            setProvider({
                              ...provider,
                              models: e.target.value
                                .split(",")
                                .map((v) => v.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={
                            busy || !provider.base_url || !provider.api_key
                          }
                          onClick={() =>
                            void act(async () => {
                              const result = await json<{ models: string[] }>(
                                base,
                                "/api/providers/discover-models",
                                {
                                  method: "POST",
                                  body: JSON.stringify(provider),
                                },
                              );
                              setProvider({
                                ...provider,
                                models: result.models,
                              });
                            }, "模型列表已更新")
                          }
                        >
                          <RefreshCw size={13} /> 发现
                        </Button>
                      </div>
                    </Field>
                    <Field label="上下文">
                      <input
                        className={inputClass}
                        type="number"
                        value={provider.context_window}
                        onChange={(e) =>
                          setProvider({
                            ...provider,
                            context_window: Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                    <Actions
                      cancel={
                        editingProvider
                          ? () => {
                              setProvider(emptyProvider());
                              setEditingProvider(null);
                            }
                          : undefined
                      }
                    >
                      <Button
                        disabled={busy || !provider.id || !provider.base_url}
                        onClick={() =>
                          void act(async () => {
                            await json(
                              base,
                              editingProvider
                                ? `/api/providers/${editingProvider}`
                                : "/api/providers",
                              {
                                method: editingProvider ? "PUT" : "POST",
                                body: JSON.stringify(provider),
                              },
                            );
                            setProvider(emptyProvider());
                            setEditingProvider(null);
                            await load();
                          }, "模型配置已保存")
                        }
                      >
                        <Save size={14} /> 保存
                      </Button>
                    </Actions>
                  </div>
                </section>
              </div>
            )}

            {tab === "persona" && config && (
              <div className="space-y-6">
                {(
                  [
                    ["user", "用户自述", UserRound],
                    ["soul", "人格设定", Sparkles],
                    ["agents", "行为规则", Settings2],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <section key={key}>
                    <Title icon={Icon} text={label} />
                    <textarea
                      className={`${inputClass} min-h-44 resize-y font-mono`}
                      value={config.personas[key]}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          personas: {
                            ...config.personas,
                            [key]: e.target.value,
                          },
                        })
                      }
                    />
                  </section>
                ))}
                <Actions>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await json(base, "/api/config/personas", {
                          method: "PUT",
                          body: JSON.stringify(config.personas),
                        });
                        await load();
                      }, "人格配置已生效")
                    }
                  >
                    <Save size={14} /> 保存人格
                  </Button>
                </Actions>
              </div>
            )}

            {tab === "tools" && config && (
              <div className="grid gap-8 lg:grid-cols-2">
                <section>
                  <Title icon={KeyRound} text="服务凭据" />
                  <Rows>
                    {credentials.map(([key, label]) => (
                      <div
                        key={key}
                        className="grid grid-cols-[120px_1fr_auto] items-center gap-3 py-3"
                      >
                        <span className="flex items-center gap-2 text-sm">
                          {config.credentials[key] && (
                            <Check size={13} className="text-emerald-500" />
                          )}
                          {label}
                        </span>
                        <input
                          className={inputClass}
                          type="password"
                          value={secretValues[key] ?? ""}
                          placeholder={
                            config.credentials[key] ? "已配置" : "未配置"
                          }
                          onChange={(e) =>
                            setSecretValues({
                              ...secretValues,
                              [key]: e.target.value,
                            })
                          }
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!config.credentials[key]}
                          aria-label={`清除 ${label}`}
                          onClick={() =>
                            void act(async () => {
                              await json(base, "/api/config/credentials", {
                                method: "PUT",
                                body: JSON.stringify({ clear: [key] }),
                              });
                              await load();
                            }, `${label}凭据已清除`)
                          }
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    ))}
                  </Rows>
                  <Actions>
                    <Button
                      disabled={
                        busy || !Object.values(secretValues).some(Boolean)
                      }
                      onClick={() =>
                        void act(async () => {
                          await json(base, "/api/config/credentials", {
                            method: "PUT",
                            body: JSON.stringify({ values: secretValues }),
                          });
                          setSecretValues({});
                          await load();
                        }, "凭据已保存，重启 Agent 后全部生效")
                      }
                    >
                      <Save size={14} /> 保存凭据
                    </Button>
                  </Actions>
                </section>
                <section>
                  <Title
                    icon={Wrench}
                    text="内置工具"
                    count={config.tools.length}
                  />
                  <Rows className="max-h-[560px] overflow-y-auto">
                    {config.tools.map((tool) => (
                      <label
                        key={tool.name}
                        className="flex cursor-pointer items-start gap-3 py-3"
                      >
                        <input
                          className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
                          type="checkbox"
                          checked={tool.enabled}
                          disabled={tool.source === "mcp"}
                          onChange={(e) =>
                            void act(
                              async () => {
                                const next = e.target.checked
                                  ? disabled.filter(
                                      (name) => name !== tool.name,
                                    )
                                  : [...disabled, tool.name];
                                await json(base, "/api/config/tools", {
                                  method: "PUT",
                                  body: JSON.stringify({
                                    disabled_tools: next,
                                  }),
                                });
                                await load();
                              },
                              e.target.checked ? "工具已启用" : "工具已停用",
                            )
                          }
                        />
                        <span>
                          <b className="block text-sm">{tool.name}</b>
                          <span className="line-clamp-2 text-xs text-[var(--color-text-muted)]">
                            {tool.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </Rows>
                </section>
              </div>
            )}

            {tab === "skills" && (
              <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
                <section>
                  <Title icon={Sparkles} text="Skills" count={skills.length} />
                  <Rows>
                    {skills.map((item) => (
                      <div
                        key={item.slug}
                        className="flex items-center gap-2 py-3"
                      >
                        <button
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            setSkill({
                              slug: item.slug,
                              content: item.content,
                            });
                            setEditingSkill(item.slug);
                          }}
                        >
                          <b className="block truncate text-sm">{item.name}</b>
                          <span className="block truncate text-xs text-[var(--color-text-muted)]">
                            {item.description || item.slug}
                          </span>
                        </button>
                        <IconDelete
                          label={item.name}
                          onDelete={() =>
                            void act(async () => {
                              await json(base, `/api/skills/${item.slug}`, {
                                method: "DELETE",
                              });
                              await load();
                            }, "Skill 已删除")
                          }
                        />
                      </div>
                    ))}
                  </Rows>
                </section>
                <section>
                  <Title
                    icon={editingSkill ? Settings2 : Plus}
                    text={editingSkill ? "编辑 Skill" : "新建 Skill"}
                  />
                  <Field label="Slug">
                    <input
                      className={inputClass}
                      value={skill.slug}
                      disabled={Boolean(editingSkill)}
                      onChange={(e) =>
                        setSkill({ ...skill, slug: e.target.value })
                      }
                    />
                  </Field>
                  <textarea
                    className={`${inputClass} mt-3 min-h-[440px] resize-y font-mono`}
                    value={skill.content}
                    onChange={(e) =>
                      setSkill({ ...skill, content: e.target.value })
                    }
                  />
                  <Actions
                    cancel={
                      editingSkill
                        ? () => {
                            setSkill({ slug: "", content: "" });
                            setEditingSkill(null);
                          }
                        : undefined
                    }
                  >
                    <Button
                      disabled={busy || !skill.slug || !skill.content}
                      onClick={() =>
                        void act(async () => {
                          await json(
                            base,
                            editingSkill
                              ? `/api/skills/${editingSkill}`
                              : "/api/skills",
                            {
                              method: editingSkill ? "PUT" : "POST",
                              body: JSON.stringify(skill),
                            },
                          );
                          setSkill({ slug: "", content: "" });
                          setEditingSkill(null);
                          await load();
                        }, "Skill 已保存")
                      }
                    >
                      <Save size={14} /> 保存
                    </Button>
                  </Actions>
                </section>
              </div>
            )}

            {tab === "memory" && (
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
                <section>
                  <Title icon={Brain} text="长期记忆" count={memories.length} />
                  <Rows>
                    {memories.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 py-3"
                      >
                        <button
                          className="min-w-0 flex-1 text-left"
                          onClick={() => setMemory(item)}
                        >
                          <span className="text-xs font-medium text-[var(--color-accent)]">
                            {item.theme}
                          </span>
                          <p className="mt-1 text-sm">{item.description}</p>
                        </button>
                        <IconDelete
                          label="Memory"
                          onDelete={() =>
                            void act(async () => {
                              await json(base, `/api/memories/${item.id}`, {
                                method: "DELETE",
                              });
                              await load();
                            }, "Memory 已删除")
                          }
                        />
                      </div>
                    ))}
                  </Rows>
                </section>
                <section className="border-l border-[var(--color-border)] pl-6">
                  <Title
                    icon={memory.id ? Settings2 : Plus}
                    text={memory.id ? "编辑 Memory" : "新增 Memory"}
                  />
                  <Field label="分区">
                    <input
                      className={inputClass}
                      value={memory.theme}
                      onChange={(e) =>
                        setMemory({ ...memory, theme: e.target.value })
                      }
                    />
                  </Field>
                  <textarea
                    className={`${inputClass} mt-3 min-h-40 resize-y`}
                    value={memory.description}
                    onChange={(e) =>
                      setMemory({ ...memory, description: e.target.value })
                    }
                  />
                  <Actions
                    cancel={
                      memory.id ? () => setMemory(emptyMemory()) : undefined
                    }
                  >
                    <Button
                      disabled={busy || !memory.theme || !memory.description}
                      onClick={() =>
                        void act(async () => {
                          await json(
                            base,
                            memory.id
                              ? `/api/memories/${memory.id}`
                              : "/api/memories",
                            {
                              method: memory.id ? "PUT" : "POST",
                              body: JSON.stringify({
                                theme: memory.theme,
                                description: memory.description,
                              }),
                            },
                          );
                          setMemory(emptyMemory());
                          await load();
                        }, "Memory 已保存")
                      }
                    >
                      <Save size={14} /> 保存
                    </Button>
                  </Actions>
                </section>
              </div>
            )}

            {tab === "marketplace" && (
              <div>
                <Title icon={Store} text="技能市场" />
                <MarketplaceTab />
              </div>
            )}

            {tab === "advanced" && (
              <div className="space-y-8">
                <section>
                  <Title icon={Settings2} text="Agent 地址" />
                  <Field label="Base URL">
                    <input
                      className={inputClass}
                      value={base}
                      onChange={(e) => setBase(e.target.value)}
                    />
                  </Field>
                </section>
                <McpPanel
                  value={mcp}
                  onChange={setMcp}
                  saving={busy}
                  onSave={() =>
                    void act(async () => {
                      const servers = JSON.parse(mcp) as Record<
                        string,
                        Record<string, unknown>
                      >;
                      await json(base, "/api/config/mcp", {
                        method: "PUT",
                        body: JSON.stringify({ servers }),
                      });
                    }, "MCP 配置已保存，重启 Agent 后生效")
                  }
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function Title({
  icon: Icon,
  text,
  count,
}: {
  icon: typeof Settings2;
  text: string;
  count?: number;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon size={16} className="text-[var(--color-accent)]" />
      <h2 className="text-sm font-semibold">{text}</h2>
      {count !== undefined && (
        <span className="text-xs text-[var(--color-text-muted)]">{count}</span>
      )}
    </div>
  );
}
function Rows({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`divide-y divide-[var(--color-border)] border-y border-[var(--color-border)] ${className}`}
    >
      {children}
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
function Actions({
  children,
  cancel,
}: {
  children: React.ReactNode;
  cancel?: () => void;
}) {
  return (
    <div className="mt-3 flex justify-end gap-2">
      {cancel && (
        <Button variant="ghost" onClick={cancel}>
          取消
        </Button>
      )}
      {children}
    </div>
  );
}
function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-emerald-500" : "bg-stone-300"}`}
      aria-label={`${checked ? "停用" : "启用"} ${label}`}
      onClick={() => onChange(!checked)}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  );
}
function IconDelete({
  label,
  onDelete,
}: {
  label: string;
  onDelete: () => void;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={`删除 ${label}`}
      onClick={() => {
        if (window.confirm(`删除「${label}」？`)) onDelete();
      }}
    >
      <Trash2 size={14} />
    </Button>
  );
}

function McpPanel({
  value,
  onChange,
  saving,
  onSave,
}: {
  value: string;
  onChange: (value: string) => void;
  saving: boolean;
  onSave: () => void;
}) {
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "streamable_http">(
    "stdio",
  );
  const [target, setTarget] = useState("");
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState("{}");
  const servers = useMemo(() => {
    try {
      return JSON.parse(value) as Record<string, Record<string, unknown>>;
    } catch {
      return {};
    }
  }, [value]);
  const update = (next: Record<string, Record<string, unknown>>) =>
    onChange(JSON.stringify(next, null, 2));
  const add = () => {
    const entry =
      transport === "stdio"
        ? {
            transport,
            command: target,
            args: args.split(/\s+/).filter(Boolean),
            env: JSON.parse(env) as Record<string, string>,
          }
        : { transport, url: target };
    update({ ...servers, [name]: entry });
    setName("");
    setTarget("");
    setArgs("");
    setEnv("{}");
  };
  return (
    <section>
      <Title
        icon={Wrench}
        text="MCP Servers"
        count={Object.keys(servers).length}
      />
      <Rows>
        {Object.entries(servers).map(([serverName, server]) => (
          <div key={serverName} className="flex items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <b className="block text-sm">{serverName}</b>
              <span className="block truncate text-xs text-[var(--color-text-muted)]">
                {String(server.command ?? server.url ?? "")}
              </span>
            </span>
            <IconDelete
              label={serverName}
              onDelete={() => {
                const next = { ...servers };
                delete next[serverName];
                update(next);
              }}
            />
          </div>
        ))}
      </Rows>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Field label="名称">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="传输">
          <div className="flex h-[38px] rounded-md border border-[var(--color-border)] p-1">
            <button
              className={`flex-1 text-xs ${transport === "stdio" ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : ""}`}
              onClick={() => setTransport("stdio")}
            >
              stdio
            </button>
            <button
              className={`flex-1 text-xs ${transport === "streamable_http" ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : ""}`}
              onClick={() => setTransport("streamable_http")}
            >
              HTTP
            </button>
          </div>
        </Field>
        <Field label={transport === "stdio" ? "命令" : "URL"}>
          <input
            className={inputClass}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
        {transport === "stdio" && (
          <>
            <Field label="参数">
              <input
                className={inputClass}
                value={args}
                onChange={(e) => setArgs(e.target.value)}
              />
            </Field>
            <Field label="环境变量 JSON">
              <input
                className={inputClass}
                value={env}
                onChange={(e) => setEnv(e.target.value)}
              />
            </Field>
          </>
        )}
        <div className="flex items-end">
          <Button variant="secondary" disabled={!name || !target} onClick={add}>
            <Plus size={14} /> 添加服务器
          </Button>
        </div>
      </div>
      <Actions>
        <Button disabled={saving} onClick={onSave}>
          <Save size={14} /> 保存 MCP
        </Button>
      </Actions>
    </section>
  );
}
