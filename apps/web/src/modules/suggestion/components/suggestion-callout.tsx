import { cn } from "@/lib/utils";
import { type VariantProps, cva } from "class-variance-authority";

const statusCalloutVariants = cva(
	"rounded-lg ring-1 ring-stone-700/10 shadow-sm p-4 flex justify-start items-start gap-4 group/status-callout",
	{
		variants: {
			variant: {
				stone:
					"[--icon-bg:var(--color-stone-200)] [--icon-text:var(--color-stone-700)] [--link-text:var(--color-stone-500)]",
				violet:
					"[--icon-bg:var(--color-violet-600)] [--icon-text:var(--color-violet-50)] [--link-text:var(--color-violet-600)]",
				green:
					"[--icon-bg:var(--color-green-600)] [--icon-text:var(--color-green-50)] [--link-text:var(--color-green-600)]",
				red: "[--icon-bg:var(--color-red-500)] [--icon-text:var(--color-red-50)] [--link-text:var(--color-red-500)]",
				orange:
					"[--icon-bg:var(--color-orange-500)] [--icon-text:var(--color-orange-50)] [--link-text:var(--color-orange-600)]",
			},
		},
		defaultVariants: {
			variant: "stone",
		},
	},
);

function StatusCallout({
	variant,
	className,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof statusCalloutVariants>) {
	return (
		<div
			data-variant={variant}
			className={cn(statusCalloutVariants({ variant }), className)}
			{...props}
		/>
	);
}

function StatusCalloutIcon({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex justify-center items-center size-7 rounded-sm shrink-0",
				"bg-(--icon-bg) [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-(--icon-text)",
				className,
			)}
			{...props}
		/>
	);
}

function StatusCalloutContent({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("", className)} {...props} />;
}

function StatusCalloutTitle({ className, ...props }: React.ComponentProps<"p">) {
	return (
		<p
			className={cn(
				"text-sm font-medium text-stone-800",
				"[&_a]:underline [&_a]:underline-offset-2 [&_a:not([class*='text-'])]:text-(--link-text)",
				className,
			)}
			{...props}
		/>
	);
}

function StatusCalloutDescription({ className, ...props }: React.ComponentProps<"p">) {
	return <p className={cn("text-sm text-stone-500", className)} {...props} />;
}

export {
	StatusCallout,
	StatusCalloutIcon,
	StatusCalloutContent,
	StatusCalloutTitle,
	StatusCalloutDescription,
};
