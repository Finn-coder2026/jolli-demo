/**
 * Shared types for integration setup components
 */

export type IntegrationType = "github" | "static_file" | "linear" | "slack" | "jira";

export interface IntegrationSetupProps {
	onComplete(): void;
	initialSuccess?: boolean;
}

export interface BaseIntegrationFlowProps {
	onComplete(): void;
	onCancel?(): void;
}

export interface StepComponentProps {
	onNext(data?: unknown): void;
	onBack(): void;
	error?: string;
	isLoading?: boolean;
}
