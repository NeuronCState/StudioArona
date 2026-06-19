import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentInput } from "./AgentInput";

describe("AgentInput attachments", () => {
  it("recursively expands a dropped folder and preserves its relative path", async () => {
    const file = new File(["hello"], "readme.txt", { type: "text/plain" });
    const fileEntry = {
      isFile: true,
      isDirectory: false,
      name: "readme.txt",
      file: (success: (value: File) => void) => success(file),
    };
    let readCount = 0;
    const folderEntry = {
      isFile: false,
      isDirectory: true,
      name: "notes",
      createReader: () => ({
        readEntries: (success: (entries: typeof fileEntry[]) => void) => {
          success(readCount++ === 0 ? [fileEntry] : []);
        },
      }),
    };
    const onAddAttachments = vi.fn();
    const { container } = render(
      <AgentInput
        attachments={[]}
        isStreaming={false}
        onSend={vi.fn().mockResolvedValue(true)}
        onCancel={() => {}}
        onAddAttachments={onAddAttachments}
        onRemoveAttachment={() => {}}
      />,
    );

    fireEvent.drop(container.querySelector("form")!, {
      dataTransfer: {
        items: [{ webkitGetAsEntry: () => folderEntry }],
        files: [],
        types: ["Files"],
      },
    });

    await waitFor(() => expect(onAddAttachments).toHaveBeenCalledOnce());
    expect(onAddAttachments.mock.calls[0][0][0]).toMatchObject({
      name: "readme.txt",
      relativePath: "notes/readme.txt",
      kind: "folder",
      file,
    });
  });

  it("keeps attachments when sending is rejected", async () => {
    const attachment = {
      id: "a-1",
      name: "large.txt",
      uri: "",
      size: 1,
      mimeType: "text/plain",
      kind: "file" as const,
      file: new File(["x"], "large.txt"),
    };
    render(
      <AgentInput
        attachments={[attachment]}
        isStreaming={false}
        onSend={vi.fn().mockResolvedValue(false)}
        onCancel={() => {}}
        onAddAttachments={() => {}}
        onRemoveAttachment={() => {}}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Message input" }), {
      target: { value: "请处理" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(screen.getByText("large.txt")).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Message input" })).toHaveValue("请处理");
  });
});
