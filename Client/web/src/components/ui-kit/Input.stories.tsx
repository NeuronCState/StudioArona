import type { Meta, StoryObj } from "@storybook/react";
import { Input, Textarea } from "@javis/ui-kit";

const meta: Meta<typeof Input> = {
  title: "UI Kit/Input",
  component: Input,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = { args: { placeholder: "Type something..." } };
export const WithLabel: Story = {
  args: { label: "Email", placeholder: "you@example.com", type: "email" },
};
export const WithError: Story = {
  args: { label: "Email", value: "invalid", error: "Invalid email address" },
};
export const Disabled: Story = {
  args: { placeholder: "Disabled input", disabled: true },
};

export const TextareaDefault: StoryObj<typeof Textarea> = {
  render: () => <Textarea placeholder="Write a message..." rows={3} />,
  name: "Textarea",
};

export const TextareaWithLabel: StoryObj<typeof Textarea> = {
  render: () => (
    <Textarea
      label="Bio"
      placeholder="Tell us about yourself..."
      rows={4}
      hint="Max 500 characters"
    />
  ),
  name: "Textarea with hint",
};
