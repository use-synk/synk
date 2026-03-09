import type { triggerTypeSchema } from "@synk-ai/shared";
import { BugPlayIcon, GitBranchIcon, GitMergeIcon } from "lucide-react";
import type React from "react";
import type z from "zod";

function RunTriggerIcon({
	triggerType,
}: React.ComponentProps<"svg"> & { triggerType: z.infer<typeof triggerTypeSchema> }) {
	switch (triggerType) {
		case "push":
			return <GitBranchIcon />;
		case "merge":
			return <GitMergeIcon />;
		case "manual":
			return <BugPlayIcon />;
	}
}

export { RunTriggerIcon };
