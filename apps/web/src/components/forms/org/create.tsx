"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/server/better-auth/client";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import z from "zod";

const formSchema = z.object({
	name: z.string().min(1),
	slug: z.string().min(1),
});

type Organization = typeof authClient.$Infer.Organization;

export function CreateOrganizationForm({
	onSuccess,
	...props
}: React.ComponentProps<"form"> & { onSuccess?: (org: Organization) => void }) {
	const form = useForm({
		defaultValues: {
			name: "",
			slug: "",
		},
		validators: {
			onSubmit: formSchema,
		},
		onSubmit: async ({ value }) => {
			const res = await authClient.organization.create({
				name: value.name,
				slug: value.slug,
			});

			if (res.error || !res.data) {
				toast.error("Failed to create organization", {
					description: res.error.message ?? "Unknown error occurred",
				});
				return;
			}

			toast.success("Organization created successfully");
			onSuccess?.(res.data);
		},
	});

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				form.handleSubmit();
			}}
			{...props}
		>
			<FieldGroup>
				<form.Field name="name">
					{(field) => {
						const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
						return (
							<Field data-invalid={isInvalid}>
								<FieldLabel htmlFor={field.name}>Organization Name</FieldLabel>
								<Input
									id={field.name}
									name={field.name}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={isInvalid}
									placeholder="My Organization"
									autoComplete="off"
								/>
								<FieldDescription>Provide a concise name for your organization.</FieldDescription>
								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				</form.Field>
				<form.Field name="slug">
					{(field) => {
						const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
						return (
							<Field data-invalid={isInvalid}>
								<FieldLabel htmlFor={field.name}>Organization Slug</FieldLabel>
								<Input
									id={field.name}
									name={field.name}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={isInvalid}
									placeholder="my-org"
									autoComplete="off"
								/>
								<FieldDescription>Provide a concise slug for your organization.</FieldDescription>
								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				</form.Field>
				<form.Subscribe selector={(state) => state.isSubmitting}>
					{(isSubmitting) => (
						<Button type="submit" disabled={isSubmitting}>
							Submit
						</Button>
					)}
				</form.Subscribe>
			</FieldGroup>
		</form>
	);
}
