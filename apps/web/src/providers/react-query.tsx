"use client";

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createQueryClient } from "@/lib/query-client";

let clientQueryClientSingleton: QueryClient | undefined = undefined;

const getQueryClient = (): QueryClient => {
	if (typeof window === "undefined") {
		return createQueryClient();
	}
	clientQueryClientSingleton ??= createQueryClient();
	return clientQueryClientSingleton;
};

export function ReactQueryProvider({ children }: { children: React.ReactNode }): React.ReactElement {
	const [queryClient] = useState(getQueryClient);
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
