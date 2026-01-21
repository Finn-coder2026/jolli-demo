declare module "jolli-agent/workflows" {
	export type WorkflowType = "architecture-doc" | "code-to-api-docs" | "docs-to-site" | "run-jolliscript";
	export interface WorkflowResult {
		success: boolean;
		assistantText?: string;
		error?: string;
		outputData?: Record<string, unknown>;
		outputFiles?: Record<string, string>;
	}
	export function runWorkflowForJob(
		workflowType: WorkflowType,
		config: unknown,
		workflowArgs?: unknown,
		jobLogger?: (message: string) => void,
	): Promise<WorkflowResult>;
}
