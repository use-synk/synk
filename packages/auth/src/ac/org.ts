/**
 * Access control for the organization plugin.
 *
 * Currently only a placeholder implementing the default statements for future use.
 */
import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";

const statement = {
	...defaultStatements,
} as const;

const ac = createAccessControl(statement);

const member = ac.newRole({
	...memberAc.statements,
});

const admin = ac.newRole({
	...adminAc.statements,
});

const owner = ac.newRole({
	...ownerAc.statements,
});

export const roles = {
	member,
	admin,
	owner,
};
