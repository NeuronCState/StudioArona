import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useConnectionStatus } from "./hooks/useConnectionStatus";
import { createQueryClient } from "./lib/query-client";
import "./styles/globals.css";
import "./styles/studio-globals.css";
import "./registry";

async function enableMocking() {
  // MSW 启用条件 (任一满足即开):
  //   1. VITE_USE_MSW=1 — dev 调试强制 mock
  //   2. ?devbypass=1 — 离线浏览 / 截图模式, 没 server, 必须走 mock
  //      (技能商店、通知 SSE 这种纯前端 demo 场景直接走 mock 即可)
  const urlParams = new URLSearchParams(window.location.search);
  const devBypass = urlParams.get("devbypass") === "1";
  const useMsw = import.meta.env.VITE_USE_MSW === "1";
  if (useMsw || devBypass) {
    const { worker } = await import("./mocks/browser");
    return worker.start({ onUnhandledRequest: "bypass" });
  }
}

const queryClient = createQueryClient();

/**
 * Root wrapper — 装 useConnectionStatus 单例, 让全 App 知道 server 状态.
 * ping 8080/health 通了才 setServerStatus('online'), 各 page 才能决定 fetch / 走本地.
 */
function RootWithConnection() {
  useConnectionStatus();
  return (
    <ErrorBoundary scope="app">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

function renderApp() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <RootWithConnection />
    </React.StrictMode>,
  );
}

enableMocking().then(renderApp, renderApp);
