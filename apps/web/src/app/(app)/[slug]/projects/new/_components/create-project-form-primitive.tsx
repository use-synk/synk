"use client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
	ComboboxTrigger,
	ComboboxValue,
} from "@/components/ui/combobox";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { useForm } from "@tanstack/react-form";
import React from "react";
import z from "zod";

const frameworks = [
	{
		label: "Auto-detect",
		description: "Automatically detect the framework used in the documentation repository.",
		value: "auto",
	},
	{
		label: "Plain",
		description: "Plain markdown files with no framework.",
		value: "plain",
	},
	{
		label: "Nextra",
		description:
			"Simple, powerful and flexible site generation framework with everything you love from Next.js.",
		value: "nextra",
	},
	{
		label: "Fumadocs",
		description:
			"React.js documentation framework for Developers, beautifully designed by Fuma Nama.",
		value: "fumadocs",
	},
	{
		label: "Docusaurus",
		description: "Easy to maintain open source documentation websites.",
		value: "docusaurus",
	},
];

type Repository = {
	id: string;
	installationId: string;
	fullName: string;
	defaultBranch: string;
	status: string;
	isActive: boolean;
	updatedAt: string;
};

type CreateProjectFormPrimitiveRender = (props: {
	Source: (props: React.ComponentProps<typeof FieldGroup>) => React.JSX.Element;
	Target: (props: React.ComponentProps<typeof FieldGroup>) => React.JSX.Element;
	Complete: (props: React.ComponentProps<typeof FieldGroup>) => React.JSX.Element;

	Form: (props: React.ComponentProps<"form">) => React.JSX.Element;
}) => React.ReactNode;

type CreateProjectFormPrimitiveProps = {
	repositories: Repository[];
	render: CreateProjectFormPrimitiveRender;
	onSubmit: (values: z.infer<typeof formSchema>) => void;
};

const formSchema = z.object({
	sourceRepository: z.string().min(1),
	sourceSameAsTarget: z.boolean(),
	targetRepository: z.string().min(1),
	framework: z.string().min(1),
	contentDirectory: z.string().min(1),
});

export function CreateProjectFormPrimitive({
	onSubmit,
	render,
	repositories,
}: CreateProjectFormPrimitiveProps) {
	const form = useForm({
		defaultValues: {
			sourceRepository: "",
			targetRepository: "",
			sourceSameAsTarget: true,
			framework: "auto",
			contentDirectory: "",
		},
		validators: {
			onSubmit: formSchema,
		},
		onSubmit: ({ value }) => {
			onSubmit(value);
		},
	});

	// When source repository changes and "target same as source" is checked, sync target to source.
	// When "target same as source" is turned on, copy source to target.
	const syncSourceFromTarget = React.useCallback(
		(targetId: string) => {
			const same = form.getFieldValue("sourceSameAsTarget");
			if (same) {
				form.setFieldValue("sourceRepository", targetId);
			}
		},
		[form],
	);

	const targetComponent = React.useMemo(
		() =>
			({ ...props }: React.ComponentProps<typeof FieldGroup>) => (
				<FieldGroup {...props}>
					<form.Field
						name="targetRepository"
						listeners={{
							onChange: ({ value }) => syncSourceFromTarget(value),
						}}
					>
						{(field) => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
							const selectedRepository =
								repositories.find((r) => r.id === field.state.value) ?? null;

							return (
								<Field>
									<FieldLabel htmlFor={field.name}>Select target repository</FieldLabel>
									<Combobox<Repository>
										items={repositories}
										itemToStringLabel={(item) => item.fullName}
										value={selectedRepository}
										onValueChange={(item) => field.handleChange(item?.id ?? "")}
										onOpenChange={(open) => {
											if (!open) field.handleBlur();
										}}
										id={field.name}
									>
										<ComboboxTrigger
											render={
												<Button
													aria-invalid={isInvalid}
													data-invalid={isInvalid}
													variant="outline"
													className={
														"w-full justify-start font-normal data-placeholder:text-zinc-500"
													}
												>
													<ComboboxValue placeholder="Select target repository" />
												</Button>
											}
										/>
										<ComboboxContent>
											<ComboboxInput
												showTrigger={false}
												placeholder="Select documentation repository"
												aria-invalid={isInvalid}
											/>
											<ComboboxEmpty>No repository found.</ComboboxEmpty>
											<ComboboxList>
												{(item) => (
													<ComboboxItem key={item.id} value={item}>
														{item.fullName}
													</ComboboxItem>
												)}
											</ComboboxList>
										</ComboboxContent>
									</Combobox>

									<FieldDescription>
										Documentation updates will be created in this repository.
									</FieldDescription>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							);
						}}
					</form.Field>
					<form.Field name="framework">
						{(field) => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
							const selectedFramework =
								frameworks.find((f) => f.value === field.state.value) ?? null;

							return (
								<Field>
									<FieldLabel htmlFor={field.name}>Select framework</FieldLabel>
									<Combobox<{
										label: string;
										description: string;
										value: string;
									}>
										items={frameworks}
										itemToStringLabel={(framework) => framework.label}
										value={selectedFramework}
										onValueChange={(item) => field.handleChange(item?.value ?? "")}
										onOpenChange={(open) => {
											if (!open) field.handleBlur();
										}}
										id={field.name}
									>
										<ComboboxTrigger
											render={
												<Button
													aria-invalid={isInvalid}
													data-invalid={isInvalid}
													variant="outline"
													className={
														"w-full justify-start font-normal data-placeholder:text-zinc-500"
													}
												>
													<ComboboxValue placeholder="Select framework" />
												</Button>
											}
										/>
										<ComboboxContent>
											<ComboboxInput
												showTrigger={false}
												placeholder="Select framework"
												aria-invalid={isInvalid}
											/>
											<ComboboxEmpty>No framework found.</ComboboxEmpty>
											<ComboboxList className={"mt-2"}>
												{(item) => (
													<ComboboxItem key={item.value} value={item}>
														<Item size={"xs"} className="p-1">
															<ItemContent>
																<ItemTitle className="whitespace-nowrap">{item.label}</ItemTitle>
																<ItemDescription>{item.description}</ItemDescription>
															</ItemContent>
														</Item>
													</ComboboxItem>
												)}
											</ComboboxList>
										</ComboboxContent>
									</Combobox>

									<FieldDescription>Select which documentation you are using.</FieldDescription>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							);
						}}
					</form.Field>
					<form.Field name="contentDirectory">
						{(field) => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

							return (
								<Field data-invalid={isInvalid}>
									<FieldLabel htmlFor={field.name}>Content directory</FieldLabel>
									<Input
										id={field.name}
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										aria-invalid={isInvalid}
										onBlur={field.handleBlur}
										placeholder="./docs/content"
									/>
									<FieldDescription>
										Relative path to the directory where your documentation lives.
									</FieldDescription>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							);
						}}
					</form.Field>
				</FieldGroup>
			),
		[repositories, form, syncSourceFromTarget],
	);

	const sourceComponent = React.useMemo(
		() =>
			({ ...props }: React.ComponentProps<typeof FieldGroup>) => (
				<FieldGroup {...props}>
					<form.Subscribe selector={(state) => state.values.sourceSameAsTarget}>
						{(sourceSameAsTarget) => (
							<>
								<form.Field
									name="sourceSameAsTarget"
									listeners={{
										onChange: ({ value }) => {
											if (value) {
												form.setFieldValue(
													"sourceRepository",
													form.getFieldValue("targetRepository"),
												);
											}
										},
									}}
								>
									{(field) => (
										<Field orientation={"horizontal"}>
											<Checkbox
												id={field.name}
												checked={field.state.value}
												onCheckedChange={field.handleChange}
											/>
											<FieldContent>
												<FieldLabel htmlFor={field.name}>Source same as target</FieldLabel>
												<FieldDescription>
													When enabled, the source repository will be the same as the target
													repository.
												</FieldDescription>
											</FieldContent>
										</Field>
									)}
								</form.Field>
								<form.Field name="sourceRepository">
									{(field) => {
										const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
										const selectedRepository =
											repositories.find((r) => r.id === field.state.value) ?? null;

										return (
											<Field className="pl-6">
												<FieldLabel htmlFor={field.name}>Select source repository</FieldLabel>
												<Combobox<Repository>
													items={repositories}
													itemToStringLabel={(item) => item.fullName}
													value={selectedRepository}
													onValueChange={(item) => field.handleChange(item?.id ?? "")}
													onOpenChange={(open) => {
														if (!open) field.handleBlur();
													}}
													id={field.name}
													disabled={sourceSameAsTarget}
												>
													<ComboboxTrigger
														render={
															<Button
																aria-invalid={isInvalid}
																data-invalid={isInvalid}
																variant="outline"
																className={
																	"w-full justify-start font-normal data-placeholder:text-zinc-500"
																}
																disabled={sourceSameAsTarget}
															>
																<ComboboxValue placeholder="Select source repository" />
															</Button>
														}
													/>
													<ComboboxContent>
														<ComboboxInput
															showTrigger={false}
															placeholder="Select source repository"
															aria-invalid={isInvalid}
															disabled={sourceSameAsTarget}
														/>
														<ComboboxEmpty>No repository found.</ComboboxEmpty>
														<ComboboxList>
															{(item) => (
																<ComboboxItem key={item.id} value={item}>
																	{item.fullName}
																</ComboboxItem>
															)}
														</ComboboxList>
													</ComboboxContent>
												</Combobox>

												<FieldDescription>
													Merging PRs in this repository will trigger documentation updates in the
													source repository.
												</FieldDescription>
												{isInvalid && <FieldError errors={field.state.meta.errors} />}
											</Field>
										);
									}}
								</form.Field>
							</>
						)}
					</form.Subscribe>
				</FieldGroup>
			),
		[repositories, form],
	);

	const completeComponent = React.useMemo(
		() =>
			({ ...props }: React.ComponentProps<typeof FieldGroup>) => (
				<FieldGroup {...props}>
					<Button type="submit">Complete</Button>
				</FieldGroup>
			),
		[],
	);

	const formComponent = React.useMemo(
		() =>
			({ onSubmit, ...props }: React.ComponentProps<"form">) => (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();

						onSubmit?.(e);
					}}
					{...props}
				/>
			),
		[form],
	);

	return render({
		Source: sourceComponent,
		Target: targetComponent,
		Complete: completeComponent,
		Form: formComponent,
	});
}
