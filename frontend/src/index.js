import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import { bootObservability } from "@/lib/observability";
import App from "@/App";

// Boot Sentry + Mixpanel + Crisp BEFORE App mounts so the SDKs can hook
// into the React lifecycle. All three are no-ops when their env vars are
// absent — see lib/observability.js.
bootObservability();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
