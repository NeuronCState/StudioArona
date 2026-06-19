import { useState, useRef, useEffect } from "react";

const WELCOME = `Welcome to Ubuntu 22.04 LTS (GNU/Linux 5.15.0-generic x86_64)

Last login: ${new Date().toLocaleString()}
user@studio-vm:~$ `;

export function MockTerminal() {
  const [lines, setLines] = useState(WELCOME);
  const [input, setInput] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [lines]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const cmd = input.trim();
      let response = "";

      if (cmd === "ls") {
        response =
          "Desktop  Documents  Downloads  Music  Pictures  Public  Templates  Videos";
      } else if (cmd === "whoami") {
        response = "user";
      } else if (cmd === "uname -a") {
        response = "Linux studio-vm 5.15.0-generic #1 SMP x86_64 GNU/Linux";
      } else if (cmd === "date") {
        response = new Date().toLocaleString();
      } else if (cmd === "clear") {
        setLines("");
        setInput("");
        return;
      } else if (cmd === "") {
        // empty enter
      } else {
        response = `bash: ${cmd}: command not found`;
      }

      setLines(
        (prev) =>
          prev +
          input +
          "\n" +
          (response ? response + "\n" : "") +
          "user@studio-vm:~$ ",
      );
      setInput("");
    }
  };

  return (
    <div
      ref={ref}
      className="h-64 overflow-y-auto bg-zinc-900 p-4 font-mono text-sm text-green-400 cursor-text"
      onClick={() => document.getElementById("mock-terminal-input")?.focus()}
    >
      <pre className="whitespace-pre-wrap break-all">{lines}</pre>
      <input
        id="mock-terminal-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full bg-transparent text-green-400 outline-none caret-green-400"
        autoFocus
        aria-label="终端输入"
      />
    </div>
  );
}
