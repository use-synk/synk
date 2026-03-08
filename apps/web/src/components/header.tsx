import { cn } from "@/lib/utils";

function Header({ className, ...props }: React.ComponentProps<"nav">) {
	return (
		<nav
			className={cn(
				"bg-background border-b h-header px-8 flex justify-start items-center gap-4 text-sm sticky top-0",
			)}
			{...props}
		/>
	);
}
export { Header };
