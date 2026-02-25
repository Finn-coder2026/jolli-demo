import { MarkdownContent } from "../components/MarkdownContent";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { TogglePill } from "../components/ui/TogglePill";
import { SpaceImageProvider } from "../context/SpaceImageContext";
import { useClient } from "../contexts/ClientContext";
import { useNavigation } from "../contexts/NavigationContext";
import { useLocation } from "../contexts/RouterContext";
import { formatTimestamp } from "../util/DateTimeUtil";
import { getLog } from "../util/Logger";
import type { Doc, DocContentMetadata } from "jolli-common";
import { Check, Code, Edit, ExternalLink, FileCode, FileText, FileUp, Play } from "lucide-react";

/**
 * Returns a user-friendly label for the content type
 */
function getContentTypeLabel(contentType: string | undefined): string {
	switch (contentType) {
		case "application/json":
			return "JSON";
		case "application/yaml":
			return "YAML";
		default:
			return "Markdown";
	}
}

/**
 * Checks if the content type is a non-markdown type (JSON or YAML)
 */
function isApiContentType(contentType: string | undefined): boolean {
	return contentType === "application/json" || contentType === "application/yaml";
}

import { type ReactElement, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

interface ArticleProps {
	jrn: string;
}

// biome-ignore lint/suspicious/noExplicitAny: Intlayer returns Proxy objects with unknown structure
function getStatusInfo(status: string, content: any) {
	switch (status) {
		case "upToDate":
			return {
				badge: (
					<Badge className="bg-green-500/10 text-green-700 dark:text-green-400">
						{content.statusUpToDate}
					</Badge>
				),
				title: content.statusUpToDateTitle,
				description: content.statusUpToDateDesc,
				color: "green",
			};
		case "needsUpdate":
			return {
				badge: (
					<Badge className="bg-red-500/10 text-red-700 dark:text-red-400">{content.statusNeedsUpdate}</Badge>
				),
				title: content.statusNeedsUpdateTitle,
				description: content.statusNeedsUpdateDesc,
				color: "red",
			};
		case "underReview":
			return {
				badge: (
					<Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
						{content.statusUnderReview}
					</Badge>
				),
				title: content.statusUnderReviewTitle,
				description: content.statusUnderReviewDesc,
				color: "yellow",
			};
		default:
			return {
				badge: <Badge>{content.statusUnknown}</Badge>,
				title: content.statusUnknownTitle,
				description: content.statusUnknownDesc,
				color: "gray",
			};
	}
}

export function Article({ jrn }: ArticleProps): ReactElement {
	const client = useClient();
	const content = useIntlayer("article");
	const dateTimeContent = useIntlayer("date-time");
	const { navigate, open } = useNavigation();
	const location = useLocation();
	const [doc, setDoc] = useState<Doc | null>(null);
	const [loading, setLoading] = useState(true);
	const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
	const [isRunningJolliScript, setIsRunningJolliScript] = useState(false);
	const [jolliScriptError, setJolliScriptError] = useState<string | null>(null);

	useEffect(() => {
		fetchArticle().then();
	}, [jrn]);

	async function fetchArticle() {
		try {
			const data = await client.docs().findDoc(jrn);
			setDoc(data ?? null);
		} catch (error) {
			log.error(error, "Failed to fetch article.");
		} finally {
			setLoading(false);
		}
	}

	/* v8 ignore next 17 - async navigation handler tested indirectly */
	async function handleEditArticle() {
		if (!doc) {
			return;
		}
		try {
			// Create or get existing draft from article
			const draft = await client.docs().createDraftFromArticle(doc.jrn);
			// Small delay to ensure draft is fully persisted before navigating
			await new Promise(resolve => setTimeout(resolve, 100));
			// Navigate with ?edit= query param to show inline editor without changing the path
			const params = new URLSearchParams(location.search);
			params.set("edit", String(draft.id));
			navigate(`/articles?${params.toString()}`);
		} catch (error) {
			log.error(error, "Failed to create draft from article.");
		}
	}

	function handleViewArticle() {
		if (!doc) {
			return;
		}
		open(`/articles/${encodeURIComponent(doc.jrn)}/preview`);
	}

	function handleViewOriginal() {
		if (!doc) {
			return;
		}
		open(`/articles/${encodeURIComponent(doc.jrn)}/source`);
	}

	async function handleRunJolliScript() {
		if (!doc) {
			return;
		}
		setJolliScriptError(null);
		setIsRunningJolliScript(true);
		try {
			// Always use updatePrompt (hardcoded to true)
			await client.devTools().triggerDemoJob("demo:run-jolliscript", {
				docJrn: doc.jrn,
				syncUp: false,
				syncDown: false,
				useUpdatePrompt: true, // Hardcoded to true
			});
		} /* v8 ignore next 4 - error path tested indirectly */ catch (error) {
			const message = error instanceof Error ? error.message : "Failed to run JolliScript";
			setJolliScriptError(message);
			log.error(error, "Failed to run JolliScript.");
		} finally {
			// Keep the button in running state for a short time
			setTimeout(() => {
				setIsRunningJolliScript(false);
			}, 2000);
		}
	}

	if (loading) {
		return (
			<div className="bg-card rounded-lg p-6 border h-full">
				<div className="text-center py-12 text-muted-foreground">{content.loading}</div>
			</div>
		);
	}

	if (!doc) {
		return (
			<div className="bg-card rounded-lg p-6 border h-full">
				<div className="text-center py-12 text-muted-foreground">{content.notFound}</div>
			</div>
		);
	}

	const metadata = (doc.contentMetadata as DocContentMetadata | undefined) ?? {};
	const statusInfo = getStatusInfo(metadata.status ?? "", content);

	return (
		<div className="bg-card rounded-lg border h-full overflow-hidden flex flex-col">
			{/* Top bar */}
			<div className="flex items-center justify-end p-6 border-b">
				<div className="flex gap-2">
					{!metadata.isSourceDoc && (
						<Button
							variant="outline"
							size="sm"
							onClick={handleEditArticle}
							className="gap-2"
							data-testid="edit-article-button"
						>
							<Edit className="h-4 w-4" />
							{content.editButton}
						</Button>
					)}
					<Button variant="outline" size="sm" onClick={handleViewArticle} className="gap-2">
						<ExternalLink className="h-4 w-4" />
						{content.viewArticle}
					</Button>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto scrollbar-thin">
				<div className="max-w-7xl mx-auto p-6">
					<div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
						{/* Main content */}
						<div className="space-y-6 min-w-0">
							{/* Article header */}
							<div>
								<div className="flex items-center gap-3 mb-2">
									<h1 className="text-3xl font-semibold">{metadata.title ?? "Untitled"}</h1>
									{metadata.isSourceDoc && (
										<Badge variant="outline" className="text-xs" data-testid="source-doc-badge">
											<FileUp className="h-3 w-3 mr-1" />
											{content.sourceDocBadge}
										</Badge>
									)}
								</div>
								<div className="text-sm text-muted-foreground/70 font-mono mb-2">{doc.jrn}</div>
								<div className="flex items-center gap-3 text-sm text-muted-foreground">
									<span>{metadata.sourceName ?? content.unknownSource}</span>
									<span>•</span>
									<span>
										{content.lastUpdated} {formatTimestamp(dateTimeContent, doc.updatedAt)}
									</span>
									{metadata.qualityScore !== undefined && (
										<>
											<span>•</span>
											<span>
												{content.qualityScoreLabel}{" "}
												<span
													className={`font-semibold ${
														metadata.qualityScore >= 70
															? "text-green-600 dark:text-green-400"
															: metadata.qualityScore >= 40
																? "text-yellow-600 dark:text-yellow-400"
																: "text-red-600 dark:text-red-400"
													}`}
												>
													{metadata.qualityScore}%
												</span>
											</span>
										</>
									)}
								</div>
							</div>

							{/* Status section */}
							{metadata.status && (
								<div className="rounded-lg border p-4 bg-muted/30">
									<div className="flex items-center gap-2 mb-2">
										<Check className={`h-5 w-5 text-${statusInfo.color}-600`} />
										<h2 className="font-medium">{statusInfo.title}</h2>
									</div>
									<p className="text-sm text-muted-foreground">{statusInfo.description}</p>
								</div>
							)}

							{/* Quality Assessment */}
							{metadata.status === "upToDate" && (
								<div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
									<h3 className="font-medium mb-3 text-green-700 dark:text-green-400">
										{content.qualityAssessmentTitle}
									</h3>
									<div className="space-y-2 text-sm">
										<div className="flex items-center gap-2 text-green-700 dark:text-green-400">
											<Check className="h-4 w-4" />
											<span>{content.qualityAccurate}</span>
										</div>
										<div className="flex items-center gap-2 text-green-700 dark:text-green-400">
											<Check className="h-4 w-4" />
											<span>{content.qualityExamplesVerified}</span>
										</div>
										<div className="flex items-center gap-2 text-green-700 dark:text-green-400">
											<Check className="h-4 w-4" />
											<span>{content.qualityNoChanges}</span>
										</div>
										<div className="flex items-center gap-2 text-green-700 dark:text-green-400">
											<Check className="h-4 w-4" />
											<span>{content.qualityPositiveFeedback}</span>
										</div>
									</div>
								</div>
							)}

							{/* Article Content */}
							<div className="rounded-lg border p-6">
								<div className="flex items-center justify-between mb-4">
									<h2 className="text-lg font-medium">{content.articleContentTitle}</h2>
									<TogglePill
										options={[
											{
												value: "rendered",
												label: content.rendered.value,
												icon: <FileText className="h-4 w-4" />,
											},
											{
												value: "raw",
												label: content.sourceCode.value,
												icon: <Code className="h-4 w-4" />,
											},
										]}
										value={viewMode}
										onChange={value => setViewMode(value as "rendered" | "raw")}
									/>
								</div>
								<div>
									{viewMode === "raw" ? (
										<pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm">
											<code>{doc.content}</code>
										</pre>
									) : (
										<SpaceImageProvider spaceId={doc.spaceId ?? undefined}>
											<MarkdownContent>{doc.content}</MarkdownContent>
										</SpaceImageProvider>
									)}
								</div>
							</div>
						</div>

						{/* Sidebar */}
						<div className="space-y-6">
							{/* Recent Activity */}
							<div className="rounded-lg border p-4">
								<h3 className="font-medium mb-4">{content.recentActivityTitle}</h3>
								<p className="text-sm text-muted-foreground">{content.recentActivityDesc}</p>

								<div className="mt-4 space-y-4">
									<div className="space-y-2">
										<div className="flex items-start gap-2">
											<div className="mt-1">
												<Check className="h-4 w-4 text-green-600" />
											</div>
											<div className="flex-1">
												<div className="flex items-center justify-between">
													<h4 className="text-sm font-medium">{content.recentCodeReview}</h4>
													<Badge variant="secondary" className="text-xs">
														{content.lowImpact}
													</Badge>
												</div>
												<p className="text-xs text-muted-foreground mt-1">
													{content.reviewedDesc}
												</p>
												<p className="text-xs text-muted-foreground mt-1">
													{content.byDocTeam}
												</p>
											</div>
										</div>
									</div>

									<div className="space-y-2">
										<div className="flex items-start gap-2">
											<div className="mt-1">
												<Check className="h-4 w-4 text-green-600" />
											</div>
											<div className="flex-1">
												<div className="flex items-center justify-between">
													<h4 className="text-sm font-medium">
														{content.customerFeedbackAnalysis}
													</h4>
													<Badge variant="secondary" className="text-xs">
														{content.lowImpact}
													</Badge>
												</div>
												<p className="text-xs text-muted-foreground mt-1">
													{content.feedbackAnalysisDesc}
												</p>
												<p className="text-xs text-muted-foreground mt-1">
													{content.bySupportTeam}
												</p>
											</div>
										</div>
									</div>
								</div>
							</div>

							{/* Article Info */}
							<div className="rounded-lg border p-4">
								<h3 className="font-medium mb-4">{content.articleInfoTitle}</h3>

								<div className="flex flex-col gap-4 text-sm">
									<div className="flex flex-col">
										<div className="text-muted-foreground mb-2">JRN</div>
										<div className="font-mono text-xs break-all">{doc.jrn}</div>
									</div>

									<div className="flex flex-col">
										<div className="text-muted-foreground mb-2">Source</div>
										<div className="font-medium">{metadata.sourceName ?? "Unknown"}</div>
									</div>

									<div className="flex flex-col">
										<div className="text-muted-foreground mb-2">{content.statusLabel}</div>
										<div>{statusInfo.badge}</div>
									</div>

									{metadata.qualityScore !== undefined && (
										<div className="flex flex-col">
											<div className="text-muted-foreground mb-2">
												{content.qualityScoreInfoLabel}
											</div>
											<div
												className={`font-semibold ${
													metadata.qualityScore >= 70
														? "text-green-600 dark:text-green-400"
														: metadata.qualityScore >= 40
															? "text-yellow-600 dark:text-yellow-400"
															: "text-red-600 dark:text-red-400"
												}`}
											>
												{metadata.qualityScore}%
											</div>
										</div>
									)}

									<div className="flex flex-col">
										<div className="text-muted-foreground mb-2">{content.contentTypeLabel}</div>
										<div className="flex items-center gap-2">
											{isApiContentType(doc.contentType) ? (
												<FileCode className="h-4 w-4 text-blue-500" />
											) : (
												<FileText className="h-4 w-4 text-muted-foreground" />
											)}
											<span className="font-medium">{getContentTypeLabel(doc.contentType)}</span>
											{isApiContentType(doc.contentType) && (
												<Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs">
													OpenAPI
												</Badge>
											)}
										</div>
									</div>

									<div className="pt-3 space-y-2">
										<Button
											variant="outline"
											className="w-full gap-2"
											size="sm"
											onClick={handleViewOriginal}
										>
											<ExternalLink className="h-4 w-4" />
											{content.viewOriginal}
										</Button>
										<Button
											variant="default"
											className="w-full gap-2"
											size="sm"
											onClick={handleRunJolliScript}
											disabled={isRunningJolliScript}
										>
											<Play className="h-4 w-4" />
											{isRunningJolliScript ? content.updatingDoc.value : content.updateDoc.value}
										</Button>
										{/* v8 ignore next 5 - error display tested indirectly */}
										{jolliScriptError && (
											<div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-800 dark:text-red-200">
												{jolliScriptError}
											</div>
										)}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
