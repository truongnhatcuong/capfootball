"use client";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";
import { toast } from "@/stores/toast.store";
import { Toaster } from "./toaster";
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 15000, retry: 1 } },
    mutationCache: new MutationCache({
      onError: (error) => { toast.error(error.message || "Không thể thực hiện thao tác. Vui lòng thử lại."); },
      onSuccess: (_data, _variables, _context, mutation) => {
        if (typeof mutation.meta?.successMessage === "string") toast.success(mutation.meta.successMessage);
      },
    }),
  }));
  return <SessionProvider><QueryClientProvider client={client}>{children}<Toaster /></QueryClientProvider></SessionProvider>;
}
