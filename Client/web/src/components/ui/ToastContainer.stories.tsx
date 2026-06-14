import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import { ToastContainer } from "./ToastContainer";
import { useUIStore } from "@/stores/ui";

const meta: Meta<typeof ToastContainer> = {
  title: "Components/UI/ToastContainer",
  component: ToastContainer,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Helper component that seeds the toast store with mock data on mount,
 * then renders the ToastContainer.
 */
function ToastDemo({
  toasts,
}: {
  toasts: { message: string; level: "info" | "warn" | "error" }[];
}) {
  useEffect(() => {
    // Clear any existing toasts
    useUIStore.setState({ toasts: [] });
    // Seed with demo toasts
    toasts.forEach((t, i) => {
      const id = `demo-toast-${i}`;
      useUIStore.setState((s) => ({
        toasts: [...s.toasts, { id, message: t.message, level: t.level }],
      }));
    });
    return () => {
      useUIStore.setState({ toasts: [] });
    };
  }, [toasts]);

  return <ToastContainer />;
}

export const AllLevels: Story = {
  render: () => (
    <ToastDemo
      toasts={[
        {
          message: "File uploaded successfully to the workspace.",
          level: "info",
        },
        {
          message: "GPU memory usage is above 85%. Consider freeing VRAM.",
          level: "warn",
        },
        {
          message: "Training job failed: CUDA out of memory.",
          level: "error",
        },
      ]}
    />
  ),
};

export const InfoOnly: Story = {
  render: () => (
    <ToastDemo
      toasts={[
        {
          message: "Model checkpoint saved to /checkpoints/latest.pt",
          level: "info",
        },
      ]}
    />
  ),
};

export const ErrorOnly: Story = {
  render: () => (
    <ToastDemo
      toasts={[
        {
          message: "Connection to inference server lost. Retrying...",
          level: "error",
        },
      ]}
    />
  ),
};

export const Empty: Story = {
  render: () => <ToastContainer />,
};
