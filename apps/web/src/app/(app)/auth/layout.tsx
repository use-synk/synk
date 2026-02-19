import { auth } from "@/server/better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function ServerLayout({ children }: LayoutProps<"/auth">) {
	const session = await auth.api.getSession({ headers: await headers() });

	if (session) {
		redirect("/");
	}

	return <main className="min-h-svh flex items-center justify-center w-full">{children}</main>;
}
