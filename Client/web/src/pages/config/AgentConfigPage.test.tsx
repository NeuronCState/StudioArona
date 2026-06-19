import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentConfigPage } from "./AgentConfigPage";
import { useSonettoConfigStore } from "@/stores/sonetto-config";

const responses: Record<string, unknown> = {
  "/api/providers": {
    providers: [
      {
        id: "test-provider",
        provider_type: "openai",
        label: "Test Provider",
        api_key: "secret",
        base_url: "https://example.test/v1",
        models: ["test-model"],
        enabled: true,
        context_window: 128000,
      },
    ],
  },
  "/api/config": {
    personas: { agents: "# Rules", soul: "# Soul", user: "# User" },
    credentials: {
      zhipuai_api_key: false,
      todoist_api_token: true,
      uapis_api_key: false,
      amap_api_key: false,
      tavily_api_key: false,
    },
    tools: [
      {
        name: "get_time",
        description: "Current time",
        enabled: true,
        source: "native",
      },
    ],
    mcp_servers: {},
  },
  "/api/skills": { skills: [] },
  "/api/memories": { sections: [] },
};

describe("AgentConfigPage", () => {
  beforeEach(() => {
    useSonettoConfigStore.setState({ sonettoBaseUrl: "http://127.0.0.1:8081" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return new Response(JSON.stringify(responses[url.pathname]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
  });

  it("loads agent configuration and switches configuration tabs", async () => {
    render(<AgentConfigPage />);

    expect(await screen.findByText("Test Provider")).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));

    fireEvent.click(screen.getByRole("tab", { name: "人格" }));
    expect(await screen.findByText("用户自述")).toBeInTheDocument();
    expect(screen.getByDisplayValue("# Soul")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "工具与凭据" }));
    expect(await screen.findByText("服务凭据")).toBeInTheDocument();
    expect(screen.getByText("get_time")).toBeInTheDocument();
  });
});
