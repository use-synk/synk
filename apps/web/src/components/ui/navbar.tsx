import { cn } from "@/lib/utils";

export function Navbar({ className, ...props }: React.ComponentProps<"nav">) {
	return (
		<nav
			className={cn(
				"bg-background border-b h-12 px-8 flex justify-start items-center gap-4 text-sm",
			)}
			{...props}
		/>
	);
}
