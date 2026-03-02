import { suspenseQuery } from "./client";
import { getOrganizationSetupStatus } from "./endpoints";
import { prefetchQuery } from "./server";

// on the server
void prefetchQuery(getOrganizationSetupStatus({ slugOrId: "123" }));

// on the client
// "use client"

const { data: response } = suspenseQuery(getOrganizationSetupStatus({ slugOrId: "123" }));
response.data.hasInstallations;
