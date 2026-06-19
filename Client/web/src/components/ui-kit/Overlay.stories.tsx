import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  Tooltip,
  Popover,
  Dropdown,
  Dialog,
  Drawer,
  Button,
} from "@javis/ui-kit";
import { Info, MoreHorizontal, Settings } from "lucide-react";

export default { title: "UI Kit/Overlay" } as Meta;

export const TooltipExample: StoryObj = {
  render: () => (
    <div className="flex gap-4 pt-8">
      <Tooltip content="This is a tooltip" side="top">
        <Button variant="ghost" size="sm">
          <Info size={16} />
        </Button>
      </Tooltip>
      <Tooltip content="Bottom tooltip" side="bottom">
        <Button variant="ghost" size="sm">
          <Info size={16} />
        </Button>
      </Tooltip>
    </div>
  ),
};

export const PopoverExample: StoryObj = {
  render: () => (
    <Popover
      trigger={
        <Button variant="secondary" size="sm">
          Open Popover
        </Button>
      }
    >
      <div className="p-3">
        <p className="text-sm font-medium">Popover Title</p>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          This is popover content.
        </p>
      </div>
    </Popover>
  ),
};

export const DropdownExample: StoryObj = {
  render: () => (
    <Dropdown
      items={[
        {
          label: "Settings",
          onClick: () => alert("Settings"),
          icon: <Settings size={14} />,
        },
        { label: "Rename", onClick: () => alert("Rename") },
        { label: "Delete", onClick: () => alert("Delete"), danger: true },
      ]}
    >
      <Button variant="ghost" size="sm">
        <MoreHorizontal size={16} />
      </Button>
    </Dropdown>
  ),
};

export const DialogExample: StoryObj = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Dialog</Button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Confirm Action"
          description="Are you sure you want to proceed? This action cannot be undone."
        >
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setOpen(false)}>
              Confirm
            </Button>
          </div>
        </Dialog>
      </>
    );
  },
};

export const DrawerExample: StoryObj = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Drawer</Button>
        <Drawer open={open} onClose={() => setOpen(false)} title="Settings">
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Drawer content goes here.
            </p>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </Drawer>
      </>
    );
  },
};
