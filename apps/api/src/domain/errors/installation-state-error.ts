export class InstallationStateError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InstallationStateError";
	}
}
