"use client";

import { getErrorMessage } from "@/api/errors";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import Link from "next/link";
import { Component, type ReactNode } from "react";

type Props = {
	children: ReactNode;
	fallbackHref?: string;
	fallbackLabel?: string;
};

type State = { hasError: false } | { hasError: true; error: unknown };

export class QueryErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError(error: unknown): State {
		return { hasError: true, error };
	}

	override render(): ReactNode {
		if (this.state.hasError) {
			const { fallbackHref = "/", fallbackLabel = "Return home" } = this.props;
			return (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Something went wrong</EmptyTitle>
						<EmptyDescription>{getErrorMessage(this.state.error)}</EmptyDescription>
					</EmptyHeader>
					<Link
						href={fallbackHref}
						className="text-primary hover:underline text-sm font-medium mt-4"
					>
						{fallbackLabel}
					</Link>
				</Empty>
			);
		}
		return this.props.children;
	}
}
