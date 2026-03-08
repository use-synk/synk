import { redirect } from "next/navigation";
import { getAuthSession } from "./endpoints";
import { RequestError } from "./errors";
import { fetchQuery } from "./server";

export async function getRequiredSession() {
	try {
		const { data } = await fetchQuery(getAuthSession());
		if (!data) {
			redirect("/auth");
		}
		return data;
	} catch (error) {
		if (error instanceof RequestError && error.status === 401) {
			redirect("/auth");
		}
		throw error;
	}
}

export async function getOptionalSession() {
	try {
		const { data } = await fetchQuery(getAuthSession());
		return data;
	} catch (error) {
		if (error instanceof RequestError && error.status === 401) {
			return null;
		}
		throw error;
	}
}
