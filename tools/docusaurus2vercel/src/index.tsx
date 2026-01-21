import { VercelDeployer } from "./core/deployment/VercelDeployer";
import * as path from "node:path";
import { program } from "commander";
import { Box, render, Text } from "ink";
import Spinner from "ink-spinner";
import type React from "react";
import { useEffect, useState } from "react";

interface Docusaurus2VercelProps {
	docsPath: string;
	options: {
		token?: string;
		subdomain?: string;
		domain?: string;
		projectName?: string;
		target?: "preview" | "production";
	};
}

const Docusaurus2Vercel: React.FC<Docusaurus2VercelProps> = ({ docsPath, options }) => {
	const [stage, setStage] = useState<"init" | "building" | "uploading" | "deploying" | "complete" | "error">("init");
	const [buildLog, setBuildLog] = useState<Array<string>>([]);
	const [deploymentUrl, setDeploymentUrl] = useState<string>("");
	const [error, setError] = useState<string>("");

	useEffect(() => {
		const runDeployment = async () => {
			try {
				// Get Vercel token from options or environment
				const token = options.token || process.env.VERCEL_TOKEN;

				if (!token) {
					setError(
						"Vercel token not found. Set VERCEL_TOKEN environment variable or use --token option.\n" +
							"Get your token at: https://vercel.com/account/tokens",
					);
					setStage("error");
					return;
				}

				// Initialize deployer
				const deployer = new VercelDeployer(token);

				// Set up event listeners
				deployer.on("phase", (phase: string) => {
					if (phase === "building") {
						setStage("building");
					} else if (phase === "uploading") {
						setStage("uploading");
					} else if (phase === "deploying") {
						setStage("deploying");
					} else if (phase === "complete") {
						setStage("complete");
					}
				});

				deployer.on("build-log", (log: string) => {
					setBuildLog(prev => [...prev, log]);
				});

				deployer.on("deploy-log", (log: string) => {
					setBuildLog(prev => [...prev, log]);
				});

				// Start deployment
				const result = await deployer.deploy({
					buildPath: path.resolve(docsPath),
					projectName: options.projectName || path.basename(docsPath),
					subdomain: options.subdomain || "",
					domain: options.domain || "vercel.app",
					token,
					...(options.target ? { target: options.target } : {}), // Only pass target if specified
				});

				if (result.status === "error") {
					setError(result.error || "Deployment failed");
					setStage("error");
				} else {
					setDeploymentUrl(result.url);
					setStage("complete");
				}
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				setError(message);
				setStage("error");
			}
		};

		runDeployment();
	}, [docsPath, options]);

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold color="cyan">
				🚀 Docusaurus to Vercel
			</Text>
			<Text dimColor>Deploying your documentation to Vercel...</Text>
			<Text> </Text>

			{/* Building stage */}
			{stage === "building" && (
				<Box>
					<Text color="green">
						<Spinner type="dots" />
					</Text>
					<Text> Building Docusaurus site...</Text>
				</Box>
			)}

			{/* Uploading stage */}
			{stage === "uploading" && (
				<Box>
					<Text color="green">
						<Spinner type="dots" />
					</Text>
					<Text> Preparing deployment...</Text>
				</Box>
			)}

			{/* Deploying stage */}
			{stage === "deploying" && (
				<Box>
					<Text color="green">
						<Spinner type="dots" />
					</Text>
					<Text> Deploying to Vercel...</Text>
				</Box>
			)}

			{/* Build logs */}
			{buildLog.length > 0 && stage !== "complete" && (
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>Recent logs:</Text>
					{buildLog.slice(-3).map((log, i) => (
						<Text key={i} dimColor>
							{" "}
							{log}
						</Text>
					))}
				</Box>
			)}

			{/* Complete */}
			{stage === "complete" && (
				<Box flexDirection="column">
					<Text color="green">✓ Deployment successful!</Text>
					<Text> </Text>
					<Text bold>Your documentation is live at:</Text>
					<Text color="cyan">{deploymentUrl}</Text>
					<Text> </Text>

					{options.subdomain && options.domain && (
						<>
							<Text bold>Custom domain (if configured):</Text>
							<Text color="cyan">
								https://{options.subdomain}.{options.domain}
							</Text>
							<Text> </Text>
						</>
					)}

					<Text dimColor>💡 Tip: You can configure custom domains in your Vercel dashboard</Text>
					<Text dimColor> Visit: https://vercel.com/dashboard</Text>
				</Box>
			)}

			{/* Error */}
			{stage === "error" && (
				<Box flexDirection="column">
					<Text color="red">✗ Deployment failed</Text>
					<Text> </Text>
					<Text color="red">{error}</Text>
					<Text> </Text>

					{error.includes("Vercel CLI not found") && (
						<>
							<Text bold>Quick Fix:</Text>
							<Text>Install Vercel CLI globally:</Text>
							<Text color="cyan"> npm install -g vercel</Text>
							<Text> </Text>
						</>
					)}

					{error.includes("token not found") && (
						<>
							<Text bold>How to get a Vercel token:</Text>
							<Text>1. Visit: https://vercel.com/account/tokens</Text>
							<Text>2. Create a new token</Text>
							<Text>3. Set it as environment variable:</Text>
							<Text color="cyan"> export VERCEL_TOKEN=your_token_here</Text>
							<Text> </Text>
							<Text>Or pass it directly:</Text>
							<Text color="cyan"> docusaurus2vercel ./docs --token your_token_here</Text>
						</>
					)}
				</Box>
			)}
		</Box>
	);
};

program
	.name("docusaurus2vercel")
	.description("Deploy Docusaurus documentation to Vercel")
	.version("1.0.0")
	.argument("<docs-path>", "Path to documentation folder")
	.option("-t, --token <token>", "Vercel API token (or set VERCEL_TOKEN env var)")
	.option("-s, --subdomain <name>", "Custom subdomain")
	.option("-d, --domain <domain>", "Custom domain", "vercel.app")
	.option("-p, --project-name <name>", "Project name")
	.option("--target <target>", "Deployment target: preview or production", "production")
	.option("--json", "Output JSON instead of interactive UI")
	.action(async (docsPath, options) => {
		if (options.json) {
			// JSON output mode - for programmatic use
			try {
				const token = options.token || process.env.VERCEL_TOKEN;
				if (!token) {
					console.error(
						JSON.stringify({
							status: "error",
							error: "Vercel token not found. Set VERCEL_TOKEN environment variable or use --token option.",
						}),
					);
					process.exit(1);
				}

				const deployer = new VercelDeployer(token);
				const result = await deployer.deploy({
					buildPath: path.resolve(docsPath),
					projectName: options.projectName || path.basename(docsPath),
					subdomain: options.subdomain || "",
					domain: options.domain || "vercel.app",
					token,
					target: options.target, // NEW: Pass target to deployer
				});

				console.log(JSON.stringify(result));
				process.exit(result.status === "error" ? 1 : 0);
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				console.error(
					JSON.stringify({
						status: "error",
						error: message,
					}),
				);
				process.exit(1);
			}
		} else {
			// Interactive UI mode
			render(<Docusaurus2Vercel docsPath={docsPath} options={options} />);
		}
	});

program.parse();
