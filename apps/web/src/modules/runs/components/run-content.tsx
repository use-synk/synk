import type { getRunDetail, runDetailSchema } from "@/api/endpoints";
import type z from "zod";

function RunContent({ run }: { run: z.infer<typeof runDetailSchema> }) {

}