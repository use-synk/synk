export class OrganizationNotFoundError extends Error {
	constructor(message = "Organization not found") {
		super(message);
		this.name = "OrganizationNotFoundError";
	}
}
