export interface UserInfo {
	readonly email: string;
	readonly name: string;
	readonly picture: string | undefined;
	readonly userId: number;
	readonly tenantId?: string | undefined;
	readonly orgId?: string | undefined;
}
