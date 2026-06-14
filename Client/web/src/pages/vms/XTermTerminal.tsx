import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';

interface XTermTerminalProps {
  host?: string;
  port?: number;
  mockMode?: boolean;
}

export function XTermTerminal({ host, port, mockMode = true }: XTermTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', monospace",
      theme: {
        background: '#18181B',
        foreground: '#4ADE80',
        cursor: '#D97757',
        selectionBackground: 'rgba(217,119,87,0.3)',
        black: '#27272A',
        red: '#EF4444',
        green: '#4ADE80',
        yellow: '#F59E0B',
        blue: '#3B82F6',
        magenta: '#A855F7',
        cyan: '#06B6D4',
        white: '#A1A1AA',
        brightBlack: '#3F3F46',
        brightRed: '#FCA5A5',
        brightGreen: '#86EFAC',
        brightYellow: '#FDE68A',
        brightBlue: '#93C5FD',
        brightMagenta: '#D8B4FE',
        brightCyan: '#67E8F9',
        brightWhite: '#FAFAFA',
      },
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    if (mockMode) {
      // Mock terminal with typing sim
      term.writeln('\x1b[1;37mWelcome to Arona OS VM Terminal\x1b[0m');
      term.writeln(`\x1b[2mHost: ${host ?? 'localhost'}:${port ?? 'N/A'}\x1b[0m`);
      term.writeln('');

      const mockCommands: Record<string, string | (() => void)> = {
        ls: 'Desktop  Documents  Downloads  Music  Pictures  Public  Templates  Videos  models/  checkpoints/',
        pwd: '/home/user',
        whoami: 'user',
        'uname -a': 'Linux studio-vm 5.15.0-generic #1 SMP x86_64 GNU/Linux',
        date: () => term.writeln(new Date().toLocaleString()),
        clear: () => term.clear(),
        'nvidia-smi': () => {
          term.writeln('+---------------------------------------------------------------------------------------+');
          term.writeln('| NVIDIA-SMI 550.90.07    Driver Version: 550.90.07    CUDA Version: 12.4               |');
          term.writeln('|-----------------------------------------+------------------------+----------------------+');
          term.writeln('| GPU  Name                 Persistence-M | Bus-Id          Disp.A | Volatile Uncorr. ECC |');
          term.writeln('| Fan  Temp   Perf          Pwr:Usage/Cap |           Memory-Usage | GPU-Util  Compute M. |');
          term.writeln('|                                         |                        |               MIG M. |');
          term.writeln('|=========================================+========================+======================|');
          term.writeln('|   0  NVIDIA V100 16GB               On  |   00000000:00:1E.0 Off |                    0 |');
          term.writeln('| N/A   72C    P0             95W / 250W |    8192MiB / 16384MiB |      85%      Default |');
          term.writeln('|                                         |                        |                  N/A |');
          term.writeln('+-----------------------------------------+------------------------+----------------------+');
        },
        python: () => {
          term.writeln('Python 3.12.4 (main, Jun 15 2026, 10:23:45) [GCC 11.4.0]');
          term.writeln('Type "exit()" to quit.');
          term.writeln('>>> ');
        },
        'pip list': () => {
          term.writeln('Package                  Version');
          term.writeln('------------------------ --------');
          term.writeln('torch                    2.4.1+cu121');
          term.writeln('transformers             4.44.0');
          term.writeln('numpy                    1.26.4');
          term.writeln('pandas                   2.2.2');
        },
      };

      let currentLine = '';

      term.onData((data) => {
        if (data === '\r') {
          // Enter pressed
          term.writeln('');
          const cmd = currentLine.trim();

          if (cmd === 'help') {
            term.writeln('\x1b[33mAvailable mock commands:\x1b[0m');
            Object.keys(mockCommands).forEach((c) => term.writeln(`  ${c}`));
          } else if (cmd in mockCommands) {
            const handler = mockCommands[cmd];
            if (typeof handler === 'function') {
              handler();
            } else {
              term.writeln(handler);
            }
          } else if (cmd.length > 0) {
            term.writeln(`\x1b[31mbash: ${cmd}: command not found\x1b[0m`);
          }

          currentLine = '';
          term.write('\x1b[32muser@studio-vm:~$\x1b[0m ');
        } else if (data === '\x7f') {
          // Backspace
          if (currentLine.length > 0) {
            currentLine = currentLine.slice(0, -1);
            term.write('\b \b');
          }
        } else {
          currentLine += data;
          term.write(data);
        }
      });

      term.write('\x1b[32muser@studio-vm:~$\x1b[0m ');
    }

    const handleResize = () => fit.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, [mockMode]);

  return (
    <div
      ref={containerRef}
      className="h-80 overflow-hidden rounded-lg"
      aria-label="终端"
    />
  );
}
