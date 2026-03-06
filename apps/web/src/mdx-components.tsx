import type { MDXComponents } from "mdx/types";
import { cn } from "./lib/utils";

const components: MDXComponents = {
	p: ({ className, ...props }) => (
		<p
			className={cn("text-stone-500 text/relaxed mb-4 mt-6 first:mt-0 last:mb-0", className)}
			{...props}
		/>
	),
	ul: ({ className, ...props }) => (
		<ul
			className={cn("list-disc list-outside text-stone-500 text/relaxed mb-4 pl-6", className)}
			{...props}
		/>
	),
	ol: ({ className, ...props }) => (
		<ol
			className={cn("list-decimal list-outside text-stone-500 text/relaxed mb-4 pl-6", className)}
			{...props}
		/>
	),
	li: ({ className, ...props }) => (
		<li
			className={cn(
				"relative text-stone-500 text/relaxed mb-1 pl-2 last:mb-0 marker:text-stone-300", // Change marker color here
				className,
			)}
			{...props}
		/>
	),
};

export function useMDXComponents(): MDXComponents {
	return components;
}
