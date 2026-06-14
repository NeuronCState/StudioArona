import type { Meta, StoryObj } from "@storybook/react";
import { GpuCard } from "./GpuCard";
import type { GPU } from "@/types/contracts";

const meta: Meta<typeof GpuCard> = {
  title: "Pages/System/GpuCard",
  component: GpuCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

const mockGpu: GPU = {
  name: "NVIDIA RTX 4090",
  mem_total_mb: 24576,
  mem_used_mb: 18432,
  util_pct: 76.5,
  temp_c: 68,
  processes: [
    { pid: 12345, name: "python", user: "zhangxuanning", gpu_mem_mb: 16384 },
  ],
};

export const Default: Story = {
  args: {
    gpu: mockGpu,
  },
};

export const HighUtilization: Story = {
  args: {
    gpu: {
      ...mockGpu,
      name: "NVIDIA RTX 4090",
      mem_total_mb: 24576,
      mem_used_mb: 23040,
      util_pct: 95.2,
      temp_c: 82,
      processes: [
        {
          pid: 12345,
          name: "train.py",
          user: "zhangxuanning",
          gpu_mem_mb: 22528,
        },
      ],
    },
  },
};

export const LowUtilization: Story = {
  args: {
    gpu: {
      ...mockGpu,
      name: "NVIDIA RTX 4090",
      mem_total_mb: 24576,
      mem_used_mb: 2048,
      util_pct: 12.3,
      temp_c: 42,
      processes: [],
    },
  },
};

export const A100: Story = {
  args: {
    gpu: {
      name: "NVIDIA A100 80GB",
      mem_total_mb: 81920,
      mem_used_mb: 65536,
      util_pct: 88.1,
      temp_c: 71,
      processes: [
        {
          pid: 23456,
          name: "torchrun",
          user: "ml-team",
          gpu_mem_mb: 61440,
        },
      ],
    },
  },
};

export const MultipleCards: Story = {
  render: () => {
    const gpus: GPU[] = [
      {
        name: "NVIDIA RTX 4090",
        mem_total_mb: 24576,
        mem_used_mb: 18432,
        util_pct: 76.5,
        temp_c: 68,
        processes: [
          {
            pid: 12345,
            name: "python",
            user: "zhangxuanning",
            gpu_mem_mb: 16384,
          },
        ],
      },
      {
        name: "NVIDIA RTX 4090",
        mem_total_mb: 24576,
        mem_used_mb: 23040,
        util_pct: 95.2,
        temp_c: 82,
        processes: [
          {
            pid: 12346,
            name: "train.py",
            user: "zhangxuanning",
            gpu_mem_mb: 22528,
          },
        ],
      },
      {
        name: "NVIDIA A100 80GB",
        mem_total_mb: 81920,
        mem_used_mb: 65536,
        util_pct: 88.1,
        temp_c: 71,
        processes: [
          {
            pid: 23456,
            name: "torchrun",
            user: "ml-team",
            gpu_mem_mb: 61440,
          },
        ],
      },
      {
        name: "NVIDIA A100 80GB",
        mem_total_mb: 81920,
        mem_used_mb: 4096,
        util_pct: 5.0,
        temp_c: 38,
        processes: [],
      },
    ];

    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {gpus.map((gpu, i) => (
          <GpuCard key={i} gpu={gpu} />
        ))}
      </div>
    );
  },
};
