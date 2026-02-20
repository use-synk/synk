import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import Link from "next/link";

export default function NotFound(): React.ReactNode {
	return (
		<main className="flex min-h-svh flex-1 items-center justify-center p-8">
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Organization not found</EmptyTitle>
					<EmptyDescription>
						The organization you're looking for doesn't exist or you don't have access to it.
					</EmptyDescription>
				</EmptyHeader>
				<Link href="/" className="text-primary hover:underline text-sm font-medium mt-4">
					Return home
				</Link>
			</Empty>
		</main>
	);
}
