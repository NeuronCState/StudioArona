import type { Meta, StoryObj } from "@storybook/react";
import { XTermTerminal } from "./XTermTerminal";

const meta: Meta<typeof XTermTerminal> = {
  title: "Components/XTermTerminal",
  component: XTermTerminal,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const MockMode: Story = {
  args: {
    mockMode: true,
    host: "localhost",
    port: 2222,
  },
};
