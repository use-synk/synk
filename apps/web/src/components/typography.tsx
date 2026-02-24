import { cn } from "@/lib/utils";

export function PageTitle({ className, ...props }: React.ComponentProps<"h1">) {
	return <h1 className={cn("text-2xl font-medium text-foreground", className)} {...props} />;
}

export function PageDescription({ className, ...props }: React.ComponentProps<"p">) {
	return (
		<p className={cn("text-sm/relaxed text-muted-foreground max-w-prose", className)} {...props} />
	);
}
