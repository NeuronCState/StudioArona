import type { Meta, StoryObj } from "@storybook/react";
import { ChatBubble } from "./ChatBubble";
import type { StreamMessage } from "@/hooks/useChatStream";

const meta: Meta<typeof ChatBubble> = {
  title: "Pages/Chat/ChatBubble",
  component: ChatBubble,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const UserMessage: Story = {
  args: {
    message: {
      role: "user",
      content: "Show me the GPU utilization for the last hour.",
    } satisfies StreamMessage,
  },
};

export const AssistantMessage: Story = {
  args: {
    message: {
      role: "assistant",
      content:
        "GPU 0 (RTX 4090) averaged 72% utilization over the last hour, with a peak of 94% at 14:32. VRAM usage was stable at 18.2 / 24 GB.",
    } satisfies StreamMessage,
  },
};

export const StreamingAssistant: Story = {
  args: {
    message: {
      role: "assistant",
      content: "Let me check the current system metrics for you",
      isStreaming: true,
    } satisfies StreamMessage,
  },
};

export const WithToolCalls: Story = {
  args: {
    message: {
      role: "assistant",
      content:
        "Here is the current status of your training jobs. Two jobs are running, one has completed.",
      toolCalls: [
        {
          id: "tc-1",
          tool: "system_metrics",
          args: { period: "1h" },
          status: "ok" as const,
          result: "Fetched GPU and CPU stats",
          latencyMs: 350,
        },
        {
          id: "tc-2",
          tool: "training_jobs",
          args: {},
          status: "ok" as const,
          result: "Listed 3 training jobs",
          latencyMs: 420,
        },
      ],
    } satisfies StreamMessage,
  },
};

export const StreamingWithToolCalls: Story = {
  args: {
    message: {
      role: "assistant",
      content: "Analyzing the system",
      toolCalls: [
        {
          id: "tc-1",
          tool: "system_metrics",
          args: { period: "1h" },
          status: "loading" as const,
          startedAt: Date.now(),
        },
      ],
      isStreaming: true,
    } satisfies StreamMessage,
  },
};

export const ToolCallError: Story = {
  args: {
    message: {
      role: "assistant",
      content: "I tried to check the VM status but something went wrong.",
      toolCalls: [
        {
          id: "tc-err",
          tool: "vms.console.exec",
          args: { vmId: "build", command: "docker ps" },
          status: "error" as const,
          error: "VM build is not reachable (connection refused)",
          latencyMs: 2500,
        },
      ],
    } satisfies StreamMessage,
  },
};

export const Conversation: Story = {
  render: () => {
    const messages: StreamMessage[] = [
      {
        role: "user",
        content: "How is the training job doing?",
      },
      {
        role: "assistant",
        content:
          "I'll check the training job status for you. Let me look at the system metrics.",
        toolCalls: [
          {
            id: "tc-1",
            tool: "system_metrics",
            args: { period: "1h" },
            status: "ok" as const,
            result: "Fetched GPU stats",
            latencyMs: 310,
          },
          {
            id: "tc-2",
            tool: "training_jobs",
            args: {},
            status: "ok" as const,
            result: "Listed training jobs",
            latencyMs: 450,
          },
        ],
      },
      {
        role: "assistant",
        content:
          "The training job 'llama-finetune' is currently at step 12,450 / 20,000 (62%). GPU utilization is at 87% with VRAM usage of 21.3 / 24 GB. Estimated time remaining: ~3.2 hours.",
      },
      {
        role: "user",
        content: "Great, thanks!",
      },
      {
        role: "assistant",
        content: "You're welcome! The training is progressing well",
        isStreaming: true,
      },
    ];

    return (
      <div className="flex flex-col gap-4">
        {messages.map((msg, i) => (
          <ChatBubble key={i} message={msg} />
        ))}
      </div>
    );
  },
};
