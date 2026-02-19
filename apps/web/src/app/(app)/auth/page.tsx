import { LoginForm } from "@/components/forms/auth/login";
import { BookOpenIcon } from "lucide-react";
import Link from "next/link";

export default async function ServerPage() {
	return (
		<div className="w-full min-h-svh flex items-start justify-start">
			<aside className="max-w-xl w-full shrink-0 border-r border-border self-stretch flex justify-center items-center py-12">
				<div className="w-full px-8 max-w-md">
					<div className="mb-12">
						<BookOpenIcon className="size-6 text-emerald-500 fill-emerald-500/15" />
					</div>
					<h1 className="text-2xl font-medium">Welcome to Synk AI</h1>
					<p className="text-sm text-muted-foreground mt-2 max-w-prose">
						We're glad to have you here. Please login to your account to continue using Synk AI.
					</p>
					<div className="mt-12">
						<LoginForm />
					</div>
					<div className="mt-12">
						<span className="text-xs text-muted-foreground block">
							By signing in, you agree to our <Link href="/terms">Terms of Service</Link> and{" "}
							<Link href="/privacy">Privacy Policy</Link>.
						</span>
					</div>
				</div>
			</aside>
			<div className="min-h-svh grow bg-zinc-50" />
		</div>
	);
}
