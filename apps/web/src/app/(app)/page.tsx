import { getRequiredSession } from "@/api/auth";
import { CreateOrganizationForm } from "@/components/forms/org/create";
import { SignOut } from "@/components/sign-out";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default async function ServerPage() {
	const session = await getRequiredSession();
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
				<CreateOrganizationForm />
			</div>
		</main>
	);
}
