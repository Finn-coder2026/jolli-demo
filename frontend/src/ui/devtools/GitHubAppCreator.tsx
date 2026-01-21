import { Button } from "../../components/ui/Button";
import { useClient } from "../../contexts/ClientContext";
import { useDevTools } from "../../contexts/DevToolsContext";
import { useLocation } from "../../contexts/RouterContext";
import { Copy, ExternalLink } from "lucide-react";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

export function GitHubAppCreator(): ReactElement {
	const content = useIntlayer("devtools");
	const client = useClient();
	const location = useLocation();
	const { devToolsInfo, isLoading: devToolsLoading, error: devToolsError } = useDevTools();
	const [error, setError] = useState<string | undefined>();

	const [org, setOrg] = useState(devToolsInfo?.githubApp?.defaultOrg || "jolliai");
	const [manifestJson, setManifestJson] = useState(
		devToolsInfo?.githubApp ? JSON.stringify(devToolsInfo.githubApp.defaultManifest, null, 2) : "",
	);
	const [showResult, setShowResult] = useState(false);
	const [resultConfig, setResultConfig] = useState("");
	const [appName, setAppName] = useState("");
	const [appUrl, setAppUrl] = useState("");
	const [copied, setCopied] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const formRef = useRef<HTMLFormElement>(null);

	// Update state when devToolsInfo becomes available
	useEffect(() => {
		if (devToolsInfo?.githubApp) {
			setOrg(devToolsInfo.githubApp.defaultOrg);
			setManifestJson(JSON.stringify(devToolsInfo.githubApp.defaultManifest, null, 2));
		}
	}, [devToolsInfo]);

	// Check for callback code in URL params
	useEffect(() => {
		const urlParams = new URLSearchParams(location.search);
		const code = urlParams.get("code");
		const view = urlParams.get("view");

		if (code && view === "github-app-callback") {
			handleGitHubCallback(code).then();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [location.search]);

	async function handleGitHubCallback(code: string) {
		try {
			setIsProcessing(true);
			const result = await client.devTools().completeGitHubAppSetup(code);
			setResultConfig(result.config);
			setAppName(result.appInfo.name);
			setAppUrl(result.appInfo.htmlUrl);
			setShowResult(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : content.githubApp.failedToComplete.value);
		} finally {
			setIsProcessing(false);
		}
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (formRef.current) {
			formRef.current.submit();
		}
	}

	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(resultConfig);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setError(content.githubApp.failedToCopy.value);
		}
	}

	function resetForm() {
		setShowResult(false);
		setResultConfig("");
		setAppName("");
		setAppUrl("");
		if (devToolsInfo?.githubApp) {
			setOrg(devToolsInfo.githubApp.defaultOrg);
		}
		setError(undefined);
	}

	if (devToolsLoading || isProcessing) {
		return (
			<div className="bg-card rounded-lg p-6 border">
				<h2 className="text-lg font-semibold mb-2">{content.githubApp.title}</h2>
				<p className="text-sm text-muted-foreground">{content.githubApp.loading}</p>
			</div>
		);
	}

	if (devToolsError || error) {
		return (
			<div className="bg-card rounded-lg p-6 border">
				<h2 className="text-lg font-semibold mb-2">{content.githubApp.title}</h2>
				<p className="text-sm text-red-500">{devToolsError || error}</p>
			</div>
		);
	}

	if (showResult) {
		return (
			<div className="bg-card rounded-lg p-6 border col-span-full">
				<h2 className="text-lg font-semibold mb-4">{content.githubApp.successTitle}</h2>
				<div className="space-y-4">
					<div>
						<p className="text-sm mb-2">
							{content.githubApp.successMessage} <strong>{appName}</strong>{" "}
							{content.githubApp.hasBeenCreated}
						</p>
						<a
							href={appUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-sm text-blue-500 hover:underline inline-flex items-center gap-1"
						>
							{content.githubApp.viewOnGitHub}
							<ExternalLink className="h-3 w-3" />
						</a>
					</div>

					<div>
						<label className="block text-sm font-medium mb-2">{content.githubApp.configLabel}</label>
						<p className="text-xs text-muted-foreground mb-2">
							{content.githubApp.configInstructions}{" "}
							<code className="bg-muted px-1 py-0.5 rounded">.env.local</code>{" "}
							{content.githubApp.fileAsValue}{" "}
							<code className="bg-muted px-1 py-0.5 rounded">GITHUB_APPS_INFO</code>
							{content.githubApp.orSaveToAws}
						</p>
						<div className="relative">
							<textarea
								value={resultConfig}
								readOnly
								className="w-full p-3 font-mono text-xs border rounded bg-muted/50 h-24 resize-none"
							/>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={copyToClipboard}
								className="absolute top-2 right-2"
							>
								{copied ? content.githubApp.copied : <Copy className="h-4 w-4" />}
							</Button>
						</div>
					</div>

					<div className="flex gap-2">
						<Button type="button" onClick={resetForm}>
							{content.githubApp.createAnother}
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="bg-card rounded-lg p-6 border">
			<h2 className="text-lg font-semibold mb-4">{content.githubApp.title}</h2>
			<p className="text-sm text-muted-foreground mb-4">{content.githubApp.subtitle}</p>

			<form
				ref={formRef}
				action={`https://github.com/organizations/${org}/settings/apps/new`}
				method="POST"
				onSubmit={handleSubmit}
				className="space-y-4"
			>
				<div>
					<label htmlFor="org" className="block text-sm font-medium mb-2">
						{content.githubApp.orgLabel}
					</label>
					<input
						id="org"
						type="text"
						value={org}
						onChange={e => setOrg(e.target.value)}
						className="w-full p-2 border rounded"
						required
					/>
				</div>

				<div>
					<label htmlFor="manifest" className="block text-sm font-medium mb-2">
						{content.githubApp.manifestLabel}
					</label>
					<textarea
						id="manifest"
						name="manifest"
						value={manifestJson}
						onChange={e => setManifestJson(e.target.value)}
						className="w-full p-3 font-mono text-xs border rounded bg-muted/50 h-64 resize-none"
						required
					/>
				</div>

				<Button type="submit" className="w-full">
					{content.githubApp.createButton}
				</Button>
			</form>
		</div>
	);
}
