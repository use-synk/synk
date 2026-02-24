"use client";
import { getQueryClient } from "@/server/api/tanstack-query/make-query-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type * as React from "react";

export function Providers({ children }: { children: React.ReactNode }) {
	const queryClient = getQueryClient();

	return (
		<QueryClientProvider client={queryClient}>
			<NuqsAdapter>{children}</NuqsAdapter>
			<ReactQueryDevtools />
		</QueryClientProvider>
	);
}
