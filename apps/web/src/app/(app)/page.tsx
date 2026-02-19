import { SignOut } from "@/components/sign-out";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { auth } from "@/server/better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function ServerPage() {
	const session = await auth.api.getSession({ headers: await headers() });

	if (!session) {
		redirect("/auth");
	}

	const { user } = session;

	return (
		<main className="w-full min-h-svh p-32">
			<h1>Hello world</h1>
			<div className="mt-12">
				<Avatar>
					<AvatarImage src={user.image ?? ""} alt={user.name} />
					<AvatarFallback>{user.name?.charAt(0) ?? ""}</AvatarFallback>
				</Avatar>
				<p>
					Logged in as {user.name} ({user.email})
				</p>
				<SignOut />
			</div>
		</main>
	);
}
