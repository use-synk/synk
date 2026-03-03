"use client";

import { cn } from "@/lib/utils";
import { Tabs as TabsPrimitive } from "@base-ui/react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import React from "react";
import { Kbd, KbdGroup } from "./ui/kbd";

export type PageTabItem = {
	label: string;
	value: string | React.ReactNode;
	shortcutKey?: string;
	shortcutWithoutCommand?: boolean;
};

export function PageTabs({
	tabs,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & {
	tabs: PageTabItem[];
}) {
	const _values: string[] = React.useMemo(() => {
		return tabs.map((tab) => tab.value as string);
	}, [tabs]);

	const parsers = {
		tab: parseAsStringLiteral(_values).withDefault(_values[0] ?? ""),
	};

	const [value, setValue] = useQueryState("tab", parsers.tab);

	return <TabsPrimitive.Root {...props} value={value} onValueChange={(e) => setValue(e)} />;
}

export function PageTabList({
	tabs,
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { tabs: PageTabItem[] }) {
	return (
		<TabsPrimitive.List className={cn("flex gap-6", className)} {...props}>
			{tabs.map((tab) => (
				<PageTab key={tab.label} item={tab} />
			))}
		</TabsPrimitive.List>
	);
}

function PageTab({
	className,
	item,
	...props
}: Omit<React.ComponentProps<typeof TabsPrimitive.Tab>, "value"> & { item: PageTabItem }) {
	const [_value, setValue] = useQueryState("tab");

	React.useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (!item.shortcutKey) {
				return;
			}

			if (
				e.key === item.shortcutKey.toLowerCase() &&
				(e.metaKey || e.ctrlKey || item.shortcutWithoutCommand)
			) {
				setValue(item.value as string);
			}
		};
		window.addEventListener("keydown", down);
		return () => window.removeEventListener("keydown", down);
	}, [item.shortcutKey, item.shortcutWithoutCommand, item.value, setValue]);

	return (
		<TabsPrimitive.Tab
			className={cn(
				"h-10 text-sm font-medium translate-y-px border-b-2 border-transparent text-stone-800 flex justify-center items-center gap-2 py cursor-pointer",
				"data-active:border-lime-500 data-active:text-lime-900",
				className,
			)}
			value={item.value}
			{...props}
		>
			<span>{item.label}</span>
			{item.shortcutKey && (
				<KbdGroup>
					{!item.shortcutWithoutCommand && <Kbd>⌘</Kbd>}
					<Kbd>{item.shortcutKey}</Kbd>
				</KbdGroup>
			)}
		</TabsPrimitive.Tab>
	);
}

export function PageTabPanel({ ...props }: React.ComponentProps<typeof TabsPrimitive.Panel>) {
	return <TabsPrimitive.Panel {...props} />;
}
