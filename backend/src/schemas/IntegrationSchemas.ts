import type { GithubRepoAccessErrorKey, IntegrationStatus, IntegrationType } from "jolli-common";
import { z } from "zod";

export const IntegrationTypeSchema = z.string().transform(s => s as IntegrationType);
export const IntegrationStatusSchema = z.string().transform(s => s as IntegrationStatus);
export const GithubRepoAccessErrorKeySchema = z.string().transform(s => s as GithubRepoAccessErrorKey);

export const GithubIntegrationMetadataScheam = z.object({
	repo: z.string(),
	branch: z.string(),
	features: z.array(z.string()),
	githubAppId: z.number().optional(),
	installationId: z.number().optional(),
	lastAccessCheck: z.string().optional(),
	accessError: GithubRepoAccessErrorKeySchema.optional(),
});

export const IntegrationBaseSchema = z.object({
	id: z.number(),
	type: IntegrationTypeSchema,
	name: z.string(),
	status: IntegrationStatusSchema,
});

//noinspection JSVoidFunctionReturnValueUsed
export const GithubIntegrationSchema = IntegrationBaseSchema.extend({
	type: z.literal("github"),
	metadata: GithubIntegrationMetadataScheam,
});

export const IntegrationSchema = z.discriminatedUnion("type", [GithubIntegrationSchema]);

export type IntegrationSchemaParams = z.infer<typeof IntegrationSchema>;

export type GithubIntegrationSchemaParams = z.infer<typeof GithubIntegrationSchema>;
