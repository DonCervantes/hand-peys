import { Buffer } from "buffer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installGlobalReporters, reportError } from "./lib/report";
import { WalletProvider } from "./lib/wallet";
import { router } from "./router";
import "./index.css";

// stellar-sdk usa Buffer en el navegador.
(globalThis as any).Buffer ??= Buffer;

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

installGlobalReporters();

createRoot(document.getElementById("root")!, {
  onUncaughtError: (err, info) => reportError("react.uncaught", err, info.componentStack?.slice(0, 600)),
  onRecoverableError: (err) => reportError("react.recoverable", err),
}).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <RouterProvider router={router} />
        </WalletProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
