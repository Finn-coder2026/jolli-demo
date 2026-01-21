export interface DeploymentOptions {
	buildPath: string;
	projectName: string;
	subdomain?: string;
	domain?: string;
	token: string;
	target?: "preview" | "production"; // NEW: Deployment target
}

export interface DeploymentResult {
	url: string; // The URL to use (stable for production, unique for preview)
	deploymentId: string;
	status: "ready" | "building" | "error";
	error?: string;
	productionDomain?: string; // NEW: Stable production domain (if target=production)
	previewUrl?: string; // NEW: Preview URL (if target=preview)
}

export interface BuildProgress {
	current: number;
	total: number;
	percentage: number;
}

export type DeploymentPhase = "building" | "uploading" | "configuring" | "deploying" | "complete";
