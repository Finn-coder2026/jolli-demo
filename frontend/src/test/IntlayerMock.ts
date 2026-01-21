// AUTO-GENERATED FILE - DO NOT EDIT
// Generated from .intlayer/dictionary/*.json files
// Run 'npm run generate:intlayer-mock' to regenerate

/**
 * Mock content map for testing
 * Contains English translations from all intlayer content files
 */
export const CONTENT_MAP: Record<string, Record<string, unknown>> = {
	"active-jobs": {
		"loading": "Loading active jobs...",
		"dashboard": "Dashboard",
		"title": "Active Jobs",
		"subtitle": "Currently running job executions",
		"refresh": "Refresh",
		"noActiveJobs": "No active jobs",
		"errors": {
			"cancelJob": "Failed to cancel job",
			"loadJobs": "Failed to load active jobs"
		}
	},
	"analytics": {
		"title": "Analytics",
		"subtitle": "View your documentation analytics"
	},
	"app-layout": {
		"navigation": "Navigation",
		"tabDashboard": "Dashboard",
		"tabArticles": "Articles",
		"tabSites": "Sites",
		"tabAnalytics": "Analytics",
		"tabIntegrations": "Sources",
		"tabSettings": "Settings",
		"tabDevTools": "Dev Tools",
		"searchPlaceholder": "Search articles...",
		"noNotifications": "No new notifications",
		"viewAllNotifications": "View all notifications",
		"myProfile": "My Profile",
		"settings": "Settings",
		"signOut": "Sign Out",
		"askAiAssistant": "Ask AI Assistant"
	},
	"article-draft": {
		"aiAssistant": "AI Assistant",
		"aiTyping": "AI is working",
		"articleContent": "Article Content",
		"close": "Close",
		"errorLoading": "Error loading draft",
		"errorSaving": "Error saving draft",
		"errorSending": "Error sending message",
		"startConversation": "Start a conversation with the AI to edit your article",
		"typeMessage": "Type a message",
		"untitledDraft": "Untitled Draft",
		"save": "Save Article",
		"saveChanges": "Save Changes",
		"saving": "Saving",
		"editingArticle": "Editing:",
		"preview": "Preview",
		"edit": "Edit",
		"contentPlaceholder": "# Start writing your article",
		"lastEdited": "Last Edited:",
		"noEditsYet": "No edits yet",
		"toolExecuting": "Working",
		"toolCall": {
			"fields": [
				"toolName",
				"args"
			],
			"nodeType": "insertion",
			"insertion": "Running {{toolName}}({{args}})"
		},
		"toolCallRunning": {
			"fields": [
				"toolName"
			],
			"nodeType": "insertion",
			"insertion": "Running the {{toolName}} tool"
		},
		"toolCallCompleted": {
			"fields": [
				"toolName"
			],
			"nodeType": "insertion",
			"insertion": "Running the {{toolName}} tool: completed"
		},
		"showDetails": "Show details",
		"hideDetails": "Hide details",
		"writingArticle": "Writing article",
		"connected": "Connected",
		"reconnecting": "Reconnecting...",
		"disconnected": "Disconnected",
		"suggestedEdits": "Suggested Edits",
		"validating": "Validating...",
		"validationErrors": "Validation Errors",
		"share": "Share",
		"sharing": "Sharing...",
		"shared": "Shared",
		"shareSuccess": "Draft shared successfully",
		"shareError": "Error sharing draft",
		"versionHistory": "Version History",
		"imageUploadHint": "Upload images (PNG, JPEG, GIF, WebP - max 10MB)",
		"deleteImageTitle": "Delete Image",
		"deleteImageDescription": "This will permanently delete the image from storage and remove all references to it from this article. This action cannot be undone.",
		"deleteImageConfirm": "Delete Image",
		"deleteImageCancel": "Cancel",
		"deleteImageError": "Failed to delete image",
		"invalidFileType": "Invalid file type. Please upload a PNG, JPEG, GIF, or WebP image.",
		"fileTooLarge": "File size exceeds maximum allowed size (10 MB)",
		"uploadFailed": "Failed to upload image",
		"versionHistory": "Version History"
	},
	"article-drafts": {
		"editDraft": "Edit",
		"lastEdited": "Last edited",
		"loadingDrafts": "Loading drafts...",
		"noDrafts": "No drafts yet",
		"noDraftsDesc": "Create your first collaborative article draft"
	},
	"article-picker": {
		"includeAllArticles": "Include all articles",
		"selectSpecificArticles": "Select specific articles",
		"articlesSelected": "articles selected",
		"articlesOf": "of",
		"selectAll": "Select all",
		"deselectAll": "Deselect all",
		"searchArticles": "Search articles...",
		"noArticlesFound": "No articles found",
		"noArticlesMatchSearch": "No articles match your search",
		"loadingArticles": "Loading articles...",
		"allArticlesInfo": "All articles will be included in this site"
	},
	"article": {
		"statusUpToDate": "Up to Date",
		"statusUpToDateTitle": "Article is Up to Date",
		"statusUpToDateDesc": "No changes needed. This article is current with the latest codebase.",
		"statusNeedsUpdate": "Needs Update",
		"statusNeedsUpdateTitle": "Article Needs Update",
		"statusNeedsUpdateDesc": "Changes detected in the codebase. This article should be reviewed and updated.",
		"statusUnderReview": "Under Review",
		"statusUnderReviewTitle": "Article Under Review",
		"statusUnderReviewDesc": "This article is currently being reviewed for accuracy and completeness.",
		"statusUnknown": "Unknown",
		"statusUnknownTitle": "Unknown Status",
		"statusUnknownDesc": "Status information not available.",
		"loading": "Loading article...",
		"notFound": "Article not found",
		"backToArticles": "Back to Articles",
		"viewArticle": "View Article",
		"viewOriginal": "View Original",
		"editButton": "Edit",
		"untitled": "Untitled",
		"unknownSource": "Unknown Source",
		"unknown": "Unknown",
		"lastUpdated": "Last updated",
		"qualityScoreLabel": "Quality Score:",
		"qualityAssessmentTitle": "Quality Assessment",
		"qualityAccurate": "Content is accurate and up-to-date",
		"qualityExamplesVerified": "All code examples are verified",
		"qualityNoChanges": "No related code changes detected",
		"qualityPositiveFeedback": "Positive customer feedback",
		"articleContentTitle": "Article Content",
		"rendered": "Rendered",
		"sourceCode": "Source",
		"recentActivityTitle": "Recent Activity",
		"recentActivityDesc": "Recent reviews and verifications",
		"recentCodeReview": "Recent code review",
		"lowImpact": "Low Impact",
		"reviewedDesc": "Article was reviewed and verified to be accurate with current codebase",
		"byDocTeam": "by Documentation Team • 1 week ago",
		"customerFeedbackAnalysis": "Customer feedback analysis",
		"feedbackAnalysisDesc": "Analyzed 50+ customer interactions. No common issues or confusion points identified.",
		"bySupportTeam": "by Support Team • 2 weeks ago",
		"articleInfoTitle": "Article Info",
		"sourceLabel": "Source",
		"statusLabel": "Status",
		"qualityScoreInfoLabel": "Quality Score",
		"contentTypeLabel": "Content Type",
		"updateInstruction": "Update Instruction",
		"updateInstructionPlaceholder": "Enter update instructions for JolliScript",
		"save": "Save",
		"saving": "Saving...",
		"updateDoc": "Update Doc",
		"updatingDoc": "Updating...",
		"sourceDocBadge": "Source",
		"permissionsLabel": "Permissions",
		"permissionRead": "Read",
		"permissionWrite": "Write",
		"permissionExecute": "Execute",
		"sourceDocReadOnly": "Source documents are read-only"
	},
	"articles-suggested-updates": {
		"title": "Articles with Suggested Updates",
		"subtitle": "Review and apply suggested edits to your articles",
		"back": "Back to Dashboard",
		"loading": "Loading articles...",
		"noArticles": "No articles with suggested updates",
		"suggestions": "suggestions"
	},
	"articles": {
		"newDraft": "New Article",
		"title": "Articles",
		"subtitle": "Manage and review your documentation across all sources",
		"searchPlaceholder": "Search articles...",
		"filtersAllArticles": "All Articles",
		"filtersUpToDate": "Up to Date",
		"filtersNeedsUpdate": "Needs Update",
		"filtersUnderReview": "Under Review",
		"statusUpToDate": "Up to Date",
		"statusNeedsUpdate": "Needs Update",
		"statusNeedsUpdateWithCommits": {
			"fields": [
				"count"
			],
			"nodeType": "insertion",
			"insertion": "Needs Update ({{count}} commits)"
		},
		"statusUnderReview": "Under Review",
		"loading": "Loading articles...",
		"noResults": "No articles match your filters",
		"noArticles": "No articles found",
		"untitled": "Untitled",
		"unknownSource": "Unknown Source",
		"lastUpdated": "Last updated",
		"qualityScore": "Quality Score:",
		"editButton": "Edit",
		"reviewButton": "Review",
		"typeMarkdown": "Markdown",
		"typeJson": "JSON",
		"typeYaml": "YAML",
		"confirmDeleteArticle": {
			"fields": [
				"title"
			],
			"nodeType": "insertion",
			"insertion": "Are you sure you want to delete '{{title}}'? This action cannot be undone."
		},
		"spaceFilterPlaceholder": "Space",
		"spaceFilterDefault": "Default",
		"spaceFilterRoot": "/root",
		"sourceDocBadge": "Source",
		"permissionRead": "R",
		"permissionWrite": "W",
		"permissionExecute": "X",
		"permissionEnabled": "Enabled",
		"permissionDisabled": "Disabled",
		"permissionDisabledSourceDoc": "Disabled for source documents",
		"filterAllArticles": "All Articles",
		"filterMyNewDrafts": "My New Drafts",
		"filterSharedWithMe": "New Drafts Shared with me",
		"filterSuggestedUpdates": "Articles with Suggested Updates",
		"draft": "Draft",
		"shared": "Shared",
		"aiDraft": "AI Draft",
		"editing": "Editing",
		"hasSuggestedUpdates": "Suggested Updates",
		"confirmDeleteDraft": {
			"fields": [
				"title"
			],
			"nodeType": "insertion",
			"insertion": "Are you sure you want to delete draft '{{title}}'? This action cannot be undone."
		}
	},
	"auth": {
		"selectEmailTitle": "Select Email",
		"selectEmailPrompt": "Choose which email to use for your account:",
		"selectEmailError": "Failed to select email. Please try again.",
		"loginError": "Login failed. Please try again."
	},
	"chatbot": {
		"conversation": "Conversation",
		"newConversation": "New Conversation",
		"conversations": "Conversations",
		"close": "Close",
		"delete": "Delete",
		"noConversationsYet": "No conversations yet",
		"howCanIHelp": "How can I help you today?",
		"messagePlaceholder": "Type your message... (Shift+Enter for new line)",
		"sending": "Sending...",
		"send": "Send"
	},
	"create-site-dialog": {
		"title": "Create new site",
		"subtitle": "Generate a documentation site from all your articles",
		"siteNameLabel": "Site Name",
		"siteNamePlaceholder": "my-docs-site",
		"siteNameHelp": "Lowercase letters, numbers, and hyphens only. Used as a unique identifier for your site.",
		"displayNameLabel": "Display Name",
		"displayNamePlaceholder": "My Documentation Site",
		"displayNameHelp": "The title that will appear on your documentation site",
		"siteStyleLabel": "Site Type",
		"siteStyleHelp": "Choose the type of site you want to create",
		"settingsLabel": "Settings",
		"enableAuthLabel": "Enable Authentication",
		"enableAuthDescription": "Require users to authenticate before accessing this site",
		"authMethodLabel": "Authentication Method",
		"authMethodJolli": "Jolli",
		"authMethodJolliDescription": "Requires authentication to access your site.",
		"articlesInfoTitle": "Articles",
		"articlesInfoDescription": "Select which articles to include in this site",
		"articlesCount": "articles available",
		"loadingArticles": "Loading articles...",
		"noArticlesAvailable": "No articles available. Create some articles first.",
		"selectArticlesRequired": "Please select at least one article",
		"siteTypeDocumentSite": "Document site",
		"siteTypeWikiSite": "Wiki site",
		"frameworkLabel": "Framework",
		"frameworkHelp": "Choose the framework to build your site",
		"frameworkNextra": "Nextra",
		"frameworkDocusaurus": "Docusaurus",
		"cancelButton": "Cancel",
		"backButton": "Back",
		"nextButton": "Next",
		"createButton": "Create Site",
		"creatingButton": "Creating...",
		"creatingMessage": "This will take a few moments. We're setting up and building your site...",
		"errorNameRequired": "Site name is required",
		"errorNameInvalid": "Site name must be lowercase alphanumeric with hyphens only",
		"errorNameTaken": "A site with this name already exists",
		"errorDisplayNameRequired": "Display name is required",
		"errorNameTooShort": "Site name must be at least 3 characters",
		"errorSubdomainTooShort": "Subdomain must be at least 3 characters",
		"errorSubdomainTooLong": "Subdomain must be 63 characters or less",
		"errorSubdomainInvalidChars": "Subdomain can only contain lowercase letters, numbers, and hyphens",
		"errorSubdomainInvalidFormat": "Subdomain cannot start or end with a hyphen",
		"errorCreationFailed": "Failed to create site. Please try again.",
		"errorLoadingArticles": "Failed to load article information"
	},
	"custom-domain-manager": {
		"title": "Custom Domain",
		"addDomain": "Add",
		"addDomainTitle": "Connect Your Domain",
		"addDomainDescription": "Enter a domain you own (e.g., docs.yourcompany.com). We'll guide you through the DNS setup.",
		"domainPlaceholder": "docs.yourcompany.com",
		"add": "Continue",
		"adding": "Adding...",
		"cancel": "Cancel",
		"remove": "Remove",
		"noDomains": "Point your own domain to this site for a branded experience.",
		"checkStatus": "Verify",
		"refreshAll": "Refresh",
		"lastChecked": "Last checked",
		"confirmRemove": "Remove this domain? Your site will only be accessible via the default URL.",
		"invalidDomain": "Enter a valid domain (e.g., docs.example.com)",
		"addFailed": "Couldn't add domain. Please try again.",
		"removeFailed": "Couldn't remove domain. Please try again.",
		"verifyFailed": "Verification failed. Check your DNS settings and try again.",
		"refreshFailed": "Couldn't refresh status. Please try again.",
		"recordType": "Record Type",
		"recordName": "Host / Name",
		"recordValue": "Points to / Value",
		"pendingStatus": "Awaiting DNS",
		"verifiedStatus": "Connected",
		"failedStatus": "Check DNS",
		"autoChecking": "Auto-checking...",
		"step1Title": "Step 1: Point your domain to our servers",
		"step1Description": "Add this record to route traffic to your site.",
		"step2Title": "Step 2: Verify domain ownership",
		"step2Description": "Add this record to prove you own the domain.",
		"waitingForVerification": "After adding the record above, click Verify to continue."
	},
	"dashboard": {
		"title": "Dashboard",
		"subtitle": "Overview of your system status and running jobs",
		"jobsTitle": "Jobs",
		"loadingStats": "Loading stats...",
		"noStats": "No stats available",
		"statRunning": "Running",
		"statCompleted": "Completed",
		"statFailed": "Failed",
		"statRetries": "Retries",
		"viewRunningJobs": "View Running Jobs",
		"viewHistory": "View History",
		"justStarted": "Just started",
		"view": "View",
		"pinJob": "Pin job",
		"unpinJob": "Unpin job",
		"dismissJob": "Dismiss job"
	},
	"date-time": {
		"justNow": "Just now",
		"minutesAgo": {
			"fields": [
				"m"
			],
			"nodeType": "insertion",
			"insertion": "{{m}} m ago"
		},
		"hoursAgo": {
			"fields": [
				"h"
			],
			"nodeType": "insertion",
			"insertion": "{{h}} h ago"
		},
		"daysAgo": {
			"fields": [
				"d"
			],
			"nodeType": "insertion",
			"insertion": "{{d}} d ago"
		},
		"now": "now",
		"aMinuteAgo": "a minute ago",
		"aFewMinutesAgo": "a few minutes ago",
		"minutesAgoLong": {
			"fields": [
				"m"
			],
			"nodeType": "insertion",
			"insertion": "{{m}} minutes ago"
		},
		"oneHourAgo": "1 hour ago",
		"hoursAgoLong": {
			"fields": [
				"h"
			],
			"nodeType": "insertion",
			"insertion": "{{h}} hours ago"
		},
		"oneDayAgo": "1 day ago",
		"daysAgoLong": {
			"fields": [
				"d"
			],
			"nodeType": "insertion",
			"insertion": "{{d}} days ago"
		},
		"oneWeekAgo": "1 week ago",
		"weeksAgo": {
			"fields": [
				"w"
			],
			"nodeType": "insertion",
			"insertion": "{{w}} weeks ago"
		},
		"oneMonthAgo": "1 month ago",
		"monthsAgo": {
			"fields": [
				"m"
			],
			"nodeType": "insertion",
			"insertion": "{{m}} months ago"
		}
	},
	"devtools": {
		"title": "Developer Tools",
		"subtitle": "Tools for local development and testing",
		"demoJobs": {
			"title": "Demo Jobs",
			"subtitle": "Test dashboard widgets with demo jobs that update stats in real-time",
			"quickStats": "Quick Stats",
			"quickStatsDesc": "Simple counter demo (5-10 seconds)",
			"multiStatProgress": "Multi-Stat Progress",
			"multiStatProgressDesc": "Multiple stats updating (15-20 seconds)",
			"articlesLink": "Articles Link",
			"articlesLinkDesc": "Demo with link to Articles page (10-15 seconds)",
			"slowProcessing": "Slow Processing",
			"slowProcessingDesc": "Long-running job with phases (30-40 seconds)",
			"runEnd2End": "Run End2End Flow",
			"runEnd2EndDesc": "Sample job that prints hello world",
			"running": "Running...",
			"runDemo": "Run Demo",
			"integration": "Integration",
			"noActiveIntegrations": "No active integrations found",
			"tipLabel": "Tip:",
			"tipMessage": "Navigate to the Dashboard page to see the demo jobs running with live stat updates.",
			"failedToTrigger": "Failed to trigger demo job"
		},
		"dataClearer": {
			"title": "Data Clearer",
			"subtitle": "Clear various types of data for development and testing purposes",
			"clearArticles": "Clear Articles",
			"clearArticlesDesc": "Remove all articles and their chunks",
			"clearArticlesConfirm": "Are you sure you want to clear all articles? This will delete all articles and their associated chunks. This action cannot be undone.",
			"clearSites": "Clear Sites",
			"clearSitesDesc": "Remove all sites",
			"clearSitesConfirm": "Are you sure you want to clear all sites? This will delete all sites. This action cannot be undone.",
			"clearJobs": "Clear Jobs",
			"clearJobsDesc": "Remove all job execution history",
			"clearJobsConfirm": "Are you sure you want to clear all job executions? This will delete all job execution history. This action cannot be undone.",
			"clearGitHub": "Clear GitHub Integrations",
			"clearGitHubDesc": "Remove all GitHub integrations and installations",
			"clearGitHubConfirm": "Are you sure you want to clear all GitHub integrations and installations? This will delete all GitHub integrations and installations. This action cannot be undone.",
			"clearSync": "Clear Sync Data",
			"clearSyncDesc": "Remove all sync cursor data for CLI sync",
			"clearSyncConfirm": "Are you sure you want to clear all sync data? This will reset the sync cursor and remove all sync article tracking. CLI clients will need to re-sync. This action cannot be undone.",
			"clearing": "Clearing...",
			"clear": "Clear",
			"warningLabel": "Warning:",
			"warningMessage": "These operations cannot be undone. Only use in development environments.",
			"failedToClear": "Failed to clear data"
		},
		"draftGenerator": {
			"title": "Draft Generator",
			"subtitle": "Generate draft with mock section edit suggestions for testing section changes on existing articles",
			"docJrnLabel": "Article JRN",
			"docJrnPlaceholder": "jrn:jolli:doc:article-name",
			"docJrnRequired": "Article JRN is required",
			"numEditsLabel": "Number of Section Edits",
			"numEditsDesc": "Generate 1-5 mock section edit suggestions",
			"generate": "Generate Draft",
			"generating": "Generating...",
			"viewDraft": "View Draft",
			"failedToGenerate": "Failed to generate draft",
			"tipLabel": "Tip:",
			"tipMessage": "Generated drafts will have highlighted sections that you can click to view and apply mock edit suggestions."
		},
		"configReloader": {
			"title": "Config Reloader",
			"subtitle": "Reload configuration from AWS Parameter Store and clear tenant caches",
			"reloadButton": "Reload Configuration",
			"reloading": "Reloading...",
			"success": "Configuration reloaded successfully",
			"failedToReload": "Failed to reload configuration",
			"tipLabel": "Note:",
			"tipMessage": "This reloads config values from AWS Parameter Store and clears tenant-specific config caches. New config values will take effect immediately."
		},
		"githubApp": {
			"title": "Create a GitHub App",
			"loading": "Loading...",
			"subtitle": "Generate a new GitHub App for local development and get the configuration JSON.",
			"orgLabel": "GitHub Organization",
			"manifestLabel": "App Manifest (edit if needed)",
			"createButton": "Create GitHub App",
			"successTitle": "GitHub App Created Successfully!",
			"successMessage": "Your GitHub App",
			"hasBeenCreated": "has been created.",
			"viewOnGitHub": "View on GitHub",
			"configLabel": "Configuration JSON",
			"configInstructions": "Copy this JSON and save it to your",
			"fileAsValue": "file as the value for",
			"orSaveToAws": ", or save it to AWS Parameter Store.",
			"copied": "Copied!",
			"createAnother": "Create Another App",
			"failedToComplete": "Failed to complete GitHub App setup",
			"failedToCopy": "Failed to copy to clipboard"
		}
	},
	"diff-dialog": {
		"cancel": "Cancel",
		"confirm": "Restore",
		"noDiff": "No differences to display"
	},
	"draft-articles": {
		"allDraftsTitle": "All Drafts",
		"allDraftsSubtitle": "Manage your collaborative article drafts",
		"confirmDeleteDraft": {
			"fields": [
				"title"
			],
			"nodeType": "insertion",
			"insertion": "Are you sure you want to delete '{{title}}'?"
		},
		"searchDraftsPlaceholder": "Search drafts...",
		"noDraftsFound": "No drafts found",
		"tryDifferentSearch": "Try a different search",
		"noDraftsDesc": "Create your first collaborative article draft"
	},
	"draft-conflict-dialog": {
		"title": "Draft Already Exists",
		"description": {
			"fields": [
				"title"
			],
			"nodeType": "insertion",
			"insertion": "A draft named \"{{title}}\" already exists. To maintain collaboration, please join the existing draft instead of creating a new one."
		},
		"existingDraft": "Existing Draft",
		"createdBy": "Created by",
		"lastUpdated": "Last updated",
		"joinCollaboration": "Join Collaboration",
		"cancel": "Cancel"
	},
	"draft-list-section": {
		"confirmDelete": "Are you sure you want to delete this draft?",
		"draftsTitle": "Article Drafts",
		"draftsSubtitle": "Collaborative AI-powered article drafts",
		"viewAllDrafts": "View all drafts",
		"editing": "Editing:",
		"suggestedEdits": "Suggested Edits",
		"typeMarkdown": "Markdown",
		"typeJson": "JSON",
		"typeYaml": "YAML",
		"shared": "Shared",
		"aiDraft": "AI Draft"
	},
	"draft-selection-dialog": {
		"title": "Unsaved Drafts Found",
		"subtitle": "You have unsaved drafts. Would you like to continue editing one of them or start a new article?",
		"lastEdited": "Last edited",
		"createNew": "Start New Article",
		"deleteButton": "Delete draft",
		"confirmDelete": "Are you sure you want to delete this draft? This action cannot be undone."
	},
	"duplicate-title-dialog": {
		"title": "Similar Titles Found",
		"subtitle": {
			"fields": [
				"count",
				"title"
			],
			"nodeType": "insertion",
			"insertion": "Found {{count}} existing article(s) or draft(s) with a similar title to \"{{title}}\". Would you like to edit one of these instead?"
		},
		"existingArticles": "Existing Articles",
		"existingDrafts": "Existing Drafts",
		"lastUpdated": "Last updated",
		"cancel": "Cancel",
		"createAnyway": "Create New Anyway"
	},
	"edit-history-dropdown": {
		"history": "History",
		"noHistoryYet": "No edit history yet"
	},
	"edit-history-item": {
		"editTypeContent": "Content edited",
		"editTypeTitle": "Title changed",
		"editTypeSectionApply": "Applied suggestion",
		"editTypeSectionDismiss": "Dismissed suggestion"
	},
	"filter-card": {
		"allArticles": "All Articles",
		"myNewDrafts": "My New Drafts",
		"sharedWithMe": "New Drafts Shared with me",
		"suggestedUpdates": "Articles with Suggested Updates"
	},
	"github-integration-flow": {
		"loading": "Checking for available installations...",
		"selectInstallation": "Connect GitHub Installation",
		"selectInstallationDesc": "Select an existing GitHub App installation to connect, or install on a new organization.",
		"organization": "Organization",
		"user": "User",
		"repositories": "repositories",
		"connect": "Connect",
		"installNewOrganization": "Install on new organization",
		"connecting": "Connecting installation...",
		"redirecting": "Redirecting to GitHub...",
		"failedInstallationUrl": "Failed to get installation URL",
		"failedSetup": "Failed to setup GitHub integration",
		"goBack": "Go Back"
	},
	"github-org-user-list": {
		"breadcrumbs": {
			"integrations": "Sources",
			"github": "GitHub"
		},
		"title": "GitHub Installations",
		"subtitle": "Select an organization or user to manage repository access",
		"installing": "Installing...",
		"installGitHubApp": "Install GitHub App",
		"loadingInstallations": "Loading installations...",
		"noInstallationsFound": "No GitHub installations found",
		"installToGetStarted": "Install the GitHub App on your organization or user account to get started",
		"organizations": "Organizations",
		"users": "Users",
		"needsAttention": "Needs Attention",
		"repository": "repository",
		"repositories": "repositories",
		"failedLoadInstallations": "Failed to load GitHub installations",
		"failedStartInstallation": "Failed to start installation",
		"failedRemoveInstallation": "Failed to remove installation",
		"removeButton": "Remove from Jolli",
		"removeModal": {
			"titleOrg": "Remove Organization",
			"titleUser": "Remove User",
			"warningMessage": "This will remove the installation and all associated repository integrations from Jolli. This action cannot be undone.",
			"cancel": "Cancel",
			"confirm": "Remove",
			"removing": "Removing..."
		},
		"removeSuccess": {
			"title": "Installation Removed",
			"message": "was successfully removed from Jolli.",
			"uninstallFromGitHub": "Uninstall from GitHub"
		}
	},
	"github-page-header": {
		"organization": "Organization",
		"user": "User",
		"repositoriesTitle": {
			"fields": [
				"name"
			],
			"nodeType": "insertion",
			"insertion": "{{name}} Repositories"
		},
		"enableRepositories": "Enable repositories for Jolli to interact with",
		"manageInstallation": "Manage installation on GitHub",
		"removeFromJolli": "Remove from Jolli",
		"sync": "Sync"
	},
	"github-repo-item": {
		"failedToggle": "Failed to toggle repository",
		"statusLabels": {
			"needsAttention": "Needs Attention",
			"error": "Error",
			"enabled": "Enabled",
			"available": "Available"
		},
		"accessErrors": {
			"repoNotAccessibleByApp": "Repository is not accessible by the GitHub App",
			"repoRemovedFromInstallation": "Repository was removed from GitHub App installation",
			"appInstallationUninstalled": "GitHub App installation was uninstalled",
			"repoNotAccessibleViaInstallation": "Repository is not accessible via GitHub App installation"
		},
		"lastChecked": {
			"fields": [
				"date"
			],
			"nodeType": "insertion",
			"insertion": "Last checked: {{date}}"
		},
		"notAccessible": {
			"title": "Repository not accessible",
			"message": "This repository is no longer included in your GitHub App installation. To restore access:",
			"step1": "Click \"Manage installation on GitHub\" above",
			"step2": "Add this repository to the installation",
			"step3": "Return here and click \"Sync\" to refresh"
		}
	},
	"github-repo-list": {
		"loading": "Loading...",
		"searchPlaceholder": "Search repositories...",
		"uninstalledWarning": {
			"title": "GitHub App Not Installed",
			"messageOrg": "The GitHub App is no longer installed on this organization. To restore access to repositories, you'll need to reinstall the app.",
			"messageUser": "The GitHub App is no longer installed on this user account. To restore access to repositories, you'll need to reinstall the app.",
			"reinstallOnGitHub": "Reinstall on GitHub",
			"viewInstallations": "View Installations on GitHub",
			"deleteFromJolli": "Delete from Jolli"
		},
		"deleteModal": {
			"titleOrg": "Delete Organization",
			"titleUser": "Delete User",
			"confirmMessage": "Are you sure you want to delete {name} from Jolli?",
			"warningMessage": "This will remove all associated repository integrations from Jolli. This action cannot be undone.",
			"cancel": "Cancel",
			"deleting": "Deleting...",
			"deleteButton": "Delete from Jolli"
		}
	},
	"github-welcome-banner": {
		"title": "GitHub App Installed Successfully!",
		"messageSingular": "To get started, enable the repository below so Jolli can start generating documentation for your code.",
		"messagePlural": "To get started, enable one or more repositories below so Jolli can start generating documentation for your code.",
		"dismiss": "Dismiss"
	},
	"image-insert": {
		"insertImage": "Images",
		"uploadNew": "Upload new image",
		"uploadHint": "PNG, JPEG, GIF, WebP (max 10MB)",
		"reuseExisting": "Assets in this article",
		"pasteHint": "Tip: You can also paste or drag images into the editor",
		"addAltText": "Add Image Description",
		"altTextLabel": "Description (Alt Text)",
		"altTextPlaceholder": "Describe the image...",
		"altTextHelp": "A brief description of the image for accessibility and SEO.",
		"cancel": "Cancel",
		"upload": "Upload",
		"invalidFileType": "Invalid file type. Please upload a PNG, JPEG, GIF, or WebP image.",
		"fileTooLarge": "File size exceeds maximum allowed size (10 MB)",
		"uploadFailed": "Failed to upload image",
		"clickToInsert": "Click to insert",
		"deleteImage": "Remove from article"
	},
	"infinite-scroll": {
		"empty": "No data available",
		"noMore": "No more data",
		"error": "Failed to load data"
	},
	"integration-card": {
		"lastSynced": {
			"fields": [
				"date"
			],
			"nodeType": "insertion",
			"insertion": "Last synced: {{date}}"
		},
		"organizationsCount": {
			"fields": [
				"count",
				"organizations"
			],
			"nodeType": "insertion",
			"insertion": "{{count}} {{organizations}}"
		},
		"organizations": {
			"nodeType": "enumeration",
			"enumeration": {
				"0": "organizations",
				"1": "organization",
				"fallback": "organizations"
			}
		},
		"reposEnabledOutOf": {
			"fields": [
				"enabled",
				"total",
				"repositories"
			],
			"nodeType": "insertion",
			"insertion": "{{enabled}} enabled out of {{total}} {{repositories}}"
		},
		"repositories": {
			"nodeType": "enumeration",
			"enumeration": {
				"0": "repositories",
				"1": "repository",
				"fallback": "repositories"
			}
		},
		"reposNeedAttentionCount": {
			"fields": [
				"count",
				"needAttention"
			],
			"nodeType": "insertion",
			"insertion": "{{count}} {{needAttention}}"
		},
		"reposNeedAttention": {
			"nodeType": "enumeration",
			"enumeration": {
				"0": "repos need attention",
				"1": "repo needs attention",
				"fallback": "repos need attention"
			}
		}
	},
	"integration-setup": {
		"notSupported": "Integration type not yet supported",
		"welcomeTitle": "Welcome to Jolli!",
		"addIntegrationTitle": "Add a Source",
		"welcomeMessage": "Choose a source type to connect. This allows Jolli to index your content and provide intelligent assistance.",
		"addIntegrationMessage": "Choose another source to help Jolli increase its understanding of your software product.",
		"skipForNow": "Skip for now",
		"githubOption": "GitHub",
		"githubDescription": "Connect a repository",
		"staticFileOption": "Static Files",
		"staticFileDescription": "Upload documents directly",
		"successTitle": "All Set!",
		"successMessage": "Your source has been successfully connected. Jolli will now index your content and be ready to help you.",
		"goToDashboard": "Go to Dashboard"
	},
	"integrations": {
		"title": "Sources",
		"subtitle": "Connect with external services",
		"addIntegration": "Add Source",
		"loading": "Loading sources...",
		"errorFallback": "Failed to load source summary",
		"noIntegrations": "No sources connected yet",
		"connectFirstRepo": "Connect Your First Source",
		"githubTitle": "GitHub",
		"staticFilesTitle": "Static Files",
		"staticFilesDescription": "files uploaded",
		"confirmDeleteIntegration": {
			"fields": [
				"name"
			],
			"nodeType": "insertion",
			"insertion": "Are you sure you want to delete '{{name}}'? This will also delete all associated documents. This action cannot be undone."
		}
	},
	"job-detail": {
		"tabs": {
			"overview": "Overview",
			"params": "Params",
			"logs": "Logs",
			"errors": "Errors",
			"metadata": "Metadata"
		},
		"fields": {
			"status": "Status",
			"duration": "Duration",
			"startedAt": "Started At",
			"completedAt": "Completed At",
			"retryCount": "Retry Count",
			"jobId": "Job ID",
			"createdAt": "Created At"
		},
		"buttons": {
			"cancelJob": "Cancel Job",
			"retryJob": "Retry Job"
		},
		"messages": {
			"noLogsAvailable": "No logs available",
			"noErrors": "No errors",
			"retries": {
				"fields": [
					"count"
				],
				"nodeType": "insertion",
				"insertion": "{{count}} retries"
			},
			"retry": {
				"fields": [
					"count"
				],
				"nodeType": "insertion",
				"insertion": "{{count}} retry"
			}
		},
		"errors": {
			"errorMessage": "Error Message",
			"stackTrace": "Stack Trace"
		}
	},
	"job-history": {
		"loading": "Loading job history...",
		"dashboard": "Dashboard",
		"title": "Job History",
		"subtitle": "View past job executions and their details",
		"statusFilters": {
			"all": "All Statuses",
			"completed": "Completed",
			"failed": "Failed",
			"cancelled": "Cancelled",
			"active": "Active",
			"queued": "Queued"
		},
		"refresh": "Refresh",
		"noJobs": "No jobs found",
		"error": "Failed to load job history"
	},
	"jobs": {
		"core:cleanup-old-jobs": {
			"title": "Cleanup Old Jobs",
			"description": "Remove old job execution records",
			"logs": {
				"starting": "Starting cleanup of old jobs...",
				"processing-records": {
					"fields": [
						"count"
					],
					"nodeType": "insertion",
					"insertion": "Processing {{count}} old job records"
				},
				"cleanup-complete": {
					"fields": [
						"count"
					],
					"nodeType": "insertion",
					"insertion": "Cleanup completed. Removed {{count}} old jobs"
				}
			},
			"completion": {
				"success": "Successfully cleaned up old job records"
			}
		},
		"core:health-check": {
			"title": "Health Check",
			"description": "Performs system health checks",
			"logs": {
				"starting": "Running health check..."
			},
			"completion": {
				"success": "Health check completed successfully"
			}
		},
		"demo:quick-stats": {
			"title": "Quick Stats Demo",
			"description": "Quick demo job showing simple stat updates (5-10 seconds)",
			"logs": {
				"starting": "Starting quick stats demo",
				"processed-progress": {
					"fields": [
						"processed"
					],
					"nodeType": "insertion",
					"insertion": "Processed: {{processed}}%"
				},
				"completed": "Quick stats demo completed"
			},
			"completion": {
				"success": "Quick stats demo completed successfully"
			}
		},
		"demo:multi-stat-progress": {
			"title": "Multi-Stat Progress Demo",
			"description": "Demo job showing multiple stats updating (15-20 seconds)",
			"logs": {
				"starting": "Starting multi-stat progress demo",
				"progress": {
					"fields": [
						"filesProcessed",
						"errors",
						"warnings"
					],
					"nodeType": "insertion",
					"insertion": "Progress: {{filesProcessed}} files, {{errors}} errors, {{warnings}} warnings"
				},
				"completed": "Multi-stat progress demo completed"
			},
			"completion": {
				"success": "Multi-stat progress demo completed successfully"
			}
		},
		"demo:articles-link": {
			"title": "Articles Processing Demo",
			"description": "Demo job with completion link to Articles page (10-15 seconds)",
			"logs": {
				"starting": "Starting articles link demo",
				"processed-articles": {
					"fields": [
						"processed",
						"total"
					],
					"nodeType": "insertion",
					"insertion": "Processed {{processed}} of {{total}} articles"
				},
				"completed": "Articles link demo completed"
			},
			"completion": {
				"success": "Article processing complete. Click to view articles."
			}
		},
		"demo:slow-processing": {
			"title": "Slow Processing Demo",
			"description": "Long-running demo job with multiple phases (30-40 seconds)",
			"logs": {
				"starting": "Starting slow processing demo",
				"phase-progress": {
					"fields": [
						"phase",
						"progress",
						"itemsProcessed"
					],
					"nodeType": "insertion",
					"insertion": "{{phase}}: {{progress}}% ({{itemsProcessed}} items)"
				},
				"completed": "Slow processing demo completed"
			},
			"completion": {
				"success": "Slow processing demo completed. All items processed successfully."
			}
		},
		"demo:run-end2end-flow": {
			"title": "Run End2End Flow",
			"description": "Sample job that prints hello world",
			"logs": {
				"selected-integration": {
					"fields": [
						"integrationId"
					],
					"nodeType": "insertion",
					"insertion": "Selected integrationId: {{integrationId}}"
				},
				"hello-world": "hello world"
			}
		},
		"knowledge-graph:architecture": {
			"title": "Knowledge Graph Build",
			"description": "Process a GitHub integration to generate knowledge graph data",
			"logs": {
				"starting": {
					"fields": [
						"integrationId"
					],
					"nodeType": "insertion",
					"insertion": "Starting knowledge graph processing for integration {{integrationId}}"
				},
				"fetching-token": {
					"fields": [
						"integrationId"
					],
					"nodeType": "insertion",
					"insertion": "Fetching access token for integration {{integrationId}}"
				},
				"token-obtained": {
					"fields": [
						"integrationId"
					],
					"nodeType": "insertion",
					"insertion": "Successfully obtained access token for integration {{integrationId}}"
				},
				"using-repo": {
					"fields": [
						"repo"
					],
					"nodeType": "insertion",
					"insertion": "Using repo from integration: {{repo}}"
				},
				"using-first-repo": {
					"fields": [
						"repo"
					],
					"nodeType": "insertion",
					"insertion": "Using first repo from installation: {{repo}}"
				},
				"running-workflow": {
					"fields": [
						"githubUrl"
					],
					"nodeType": "insertion",
					"insertion": "Running code-docs workflow for {{githubUrl}}"
				},
				"workflow-complete": "Workflow completed successfully",
				"assistant-output": {
					"fields": [
						"length"
					],
					"nodeType": "insertion",
					"insertion": "Assistant output length: {{length}} characters"
				},
				"files-generated": {
					"fields": [
						"count"
					],
					"nodeType": "insertion",
					"insertion": "Generated {{count}} output file(s)"
				},
				"completed": {
					"fields": [
						"integrationId"
					],
					"nodeType": "insertion",
					"insertion": "Knowledge graph processing completed for integration {{integrationId}}"
				},
				"error": {
					"fields": [
						"integrationId",
						"error"
					],
					"nodeType": "insertion",
					"insertion": "Error processing integration {{integrationId}}: {{error}}"
				}
			},
			"completion": {
				"success": "Knowledge graph processing completed successfully"
			}
		},
		"knowledge-graph:code-to-api-articles": {
			"title": "Code to API Articles",
			"description": "Generate API articles from code (code2docusaurus), persist to Doc DB",
			"logs": {
				"starting": {
					"fields": [
						"integrationId"
					],
					"nodeType": "insertion",
					"insertion": "Starting code-to-api-articles for integration {{integrationId}}"
				},
				"fetching-token": {
					"fields": [
						"integrationId"
					],
					"nodeType": "insertion",
					"insertion": "Fetching access token for integration {{integrationId}}"
				},
				"token-obtained": {
					"fields": [
						"integrationId"
					],
					"nodeType": "insertion",
					"insertion": "Successfully obtained access token for integration {{integrationId}}"
				},
				"using-repo": {
					"fields": [
						"repo"
					],
					"nodeType": "insertion",
					"insertion": "Using repo from integration: {{repo}}"
				},
				"running-workflow": {
					"fields": [
						"githubUrl"
					],
					"nodeType": "insertion",
					"insertion": "Running code-to-api-docs workflow for {{githubUrl}}"
				},
				"sandbox-id-captured": {
					"fields": [
						"sandboxId"
					],
					"nodeType": "insertion",
					"insertion": "Captured sandbox ID: {{sandboxId}}"
				},
				"scanning-files": {
					"fields": [
						"count",
						"root"
					],
					"nodeType": "insertion",
					"insertion": "[syncIt] Scanning {{count}} file(s) under {{root}}"
				},
				"file-persisted": {
					"fields": [
						"jrn",
						"bytes"
					],
					"nodeType": "insertion",
					"insertion": "[syncIt] persisted {{jrn}} ({{bytes}} bytes)"
				},
				"file-failed": {
					"fields": [
						"filename",
						"error"
					],
					"nodeType": "insertion",
					"insertion": "[syncIt] failed for {{filename}}: {{error}}"
				},
				"post-sync-failed": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "[syncIt] post-sync failed: {{error}}"
				},
				"completed": {
					"fields": [
						"integrationId"
					],
					"nodeType": "insertion",
					"insertion": "Code 2 API Articles completed for integration {{integrationId}}"
				},
				"error": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "Error process integration for code-to-api-articles: {{error}}"
				}
			},
			"completion": {
				"success": "API articles generated successfully"
			}
		},
		"knowledge-graph:docs-to-docusaurus": {
			"title": "Docs to Docusaurus",
			"description": "Convert documentation from GitHub repository to Docusaurus format",
			"logs": {
				"starting": {
					"fields": [
						"integrationId"
					],
					"nodeType": "insertion",
					"insertion": "Starting docs-to-docusaurus processing for integration {{integrationId}}"
				},
				"fetching-token": {
					"fields": [
						"integrationId"
					],
					"nodeType": "insertion",
					"insertion": "Fetching access token for integration {{integrationId}}"
				},
				"token-obtained": {
					"fields": [
						"integrationId"
					],
					"nodeType": "insertion",
					"insertion": "Successfully obtained access token for integration {{integrationId}}"
				},
				"using-repo": {
					"fields": [
						"repo"
					],
					"nodeType": "insertion",
					"insertion": "Using repo from integration: {{repo}}"
				},
				"running-workflow": {
					"fields": [
						"githubUrl"
					],
					"nodeType": "insertion",
					"insertion": "Running docs-to-site workflow for {{githubUrl}}"
				},
				"sandbox-id-captured": {
					"fields": [
						"sandboxId"
					],
					"nodeType": "insertion",
					"insertion": "Captured sandbox ID: {{sandboxId}}"
				},
				"sync-starting": "[syncIt] Starting sync from /home/space-1 to api-docs/docs/",
				"no-documents": "[syncIt] No documents found in /home/space-1",
				"found-documents": {
					"fields": [
						"count"
					],
					"nodeType": "insertion",
					"insertion": "[syncIt] Found {{count}} documents to sync"
				},
				"writing-file": {
					"fields": [
						"jrn",
						"targetPath",
						"bytes"
					],
					"nodeType": "insertion",
					"insertion": "[syncIt] Writing {{jrn}} to {{targetPath}} ({{bytes}} bytes)"
				},
				"sync-failed": {
					"fields": [
						"jrn",
						"error"
					],
					"nodeType": "insertion",
					"insertion": "[syncIt] Failed to sync {{jrn}}: {{error}}"
				},
				"sync-completed": "[syncIt] Sync completed successfully",
				"sync-error": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "[syncIt] Sync failed: {{error}}"
				},
				"completed": {
					"fields": [
						"integrationId"
					],
					"nodeType": "insertion",
					"insertion": "Docs-to-docusaurus processing completed for integration {{integrationId}}"
				},
				"error": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "Error process integration for docs-to-docusaurus: {{error}}"
				}
			},
			"completion": {
				"success": "Documentation converted to Docusaurus successfully"
			}
		},
		"knowledge-graph:run-jolliscript": {
			"title": "Run JolliScript Workflow",
			"description": "Execute the run-jolliscript workflow for stored DocDao markdown content",
			"logs": {
				"starting": {
					"fields": [
						"docJrn"
					],
					"nodeType": "insertion",
					"insertion": "Starting run-jolliscript workflow for {{docJrn}}"
				},
				"doc-not-found": {
					"fields": [
						"docJrn"
					],
					"nodeType": "insertion",
					"insertion": "Document {{docJrn}} not found"
				},
				"doc-no-content": {
					"fields": [
						"docJrn"
					],
					"nodeType": "insertion",
					"insertion": "Document {{docJrn}} has no content to process"
				},
				"sandbox-id-captured": {
					"fields": [
						"sandboxId"
					],
					"nodeType": "insertion",
					"insertion": "Captured sandbox ID: {{sandboxId}}"
				},
				"scanning-files": {
					"fields": [
						"count",
						"root"
					],
					"nodeType": "insertion",
					"insertion": "[syncIt] Scanning {{count}} file(s) under {{root}}"
				},
				"file-persisted": {
					"fields": [
						"jrn",
						"bytes"
					],
					"nodeType": "insertion",
					"insertion": "[syncIt] persisted {{jrn}} ({{bytes}} bytes)"
				},
				"file-failed": {
					"fields": [
						"filename",
						"error"
					],
					"nodeType": "insertion",
					"insertion": "[syncIt] failed for {{filename}}: {{error}}"
				},
				"sync-failed": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "[syncIt] sync failed: {{error}}"
				},
				"completed": {
					"fields": [
						"docJrn"
					],
					"nodeType": "insertion",
					"insertion": "run-jolliscript workflow completed for {{docJrn}}"
				},
				"error": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "Error run-jolliscript workflow: {{error}}"
				}
			},
			"completion": {
				"success": "JolliScript workflow completed successfully"
			}
		},
		"knowledge-graph:process-git-push": {
			"title": "Process Git Push",
			"description": "Processes Git Push events from github",
			"logs": {
				"git-push": {
					"fields": [
						"ref",
						"before",
						"after"
					],
					"nodeType": "insertion",
					"insertion": "Git push received: ref={{ref}}, before={{before}}, after={{after}}"
				},
				"files-added": {
					"fields": [
						"files"
					],
					"nodeType": "insertion",
					"insertion": "Files added: {{files}}"
				},
				"files-modified": {
					"fields": [
						"files"
					],
					"nodeType": "insertion",
					"insertion": "Files modified: {{files}}"
				},
				"files-removed": {
					"fields": [
						"files"
					],
					"nodeType": "insertion",
					"insertion": "Files removed: {{files}}"
				}
			}
		},
		"handle-installation-created": {
			"title": "GitHub App Installed",
			"description": "Handles GitHub App installation created event - creates installation tracking and heals broken integrations",
			"logs": {
				"missing-installation-info": {
					"fields": [
						"eventType"
					],
					"nodeType": "insertion",
					"insertion": "Missing installation ID or app ID in {{eventType}} event"
				},
				"integration-healed": {
					"fields": [
						"integrationId",
						"repo"
					],
					"nodeType": "insertion",
					"insertion": "Healed integration {{integrationId}} for repo {{repo}}"
				},
				"processing-complete": {
					"fields": [
						"installationId",
						"appId",
						"repoCount",
						"healedCount"
					],
					"nodeType": "insertion",
					"insertion": "Installation created event processed: installationId={{installationId}}, appId={{appId}}, repoCount={{repoCount}}, healedCount={{healedCount}}"
				}
			}
		},
		"github:handle-installation-deleted": {
			"title": "GitHub App Uninstalled",
			"description": "Handles GitHub App installation deleted event - marks installation as uninstalled and disables affected integrations",
			"logs": {
				"missing-installation-info": {
					"fields": [
						"eventType"
					],
					"nodeType": "insertion",
					"insertion": "Missing installation ID or app ID in {{eventType}} event"
				},
				"installation-marked-uninstalled": {
					"fields": [
						"name",
						"installationId"
					],
					"nodeType": "insertion",
					"insertion": "Marked installation {{name}} ({{installationId}}) as uninstalled"
				},
				"installation-not-found": {
					"fields": [
						"installationId"
					],
					"nodeType": "insertion",
					"insertion": "Installation {{installationId}} not found when processing uninstall"
				},
				"integration-disabled": {
					"fields": [
						"integrationId",
						"repo",
						"reason"
					],
					"nodeType": "insertion",
					"insertion": "Disabled integration {{integrationId}} for repo {{repo}} (reason: {{reason}})"
				},
				"installation-deleted-complete": {
					"fields": [
						"installationId",
						"appId",
						"affectedCount"
					],
					"nodeType": "insertion",
					"insertion": "Installation deleted event processed: installationId={{installationId}}, appId={{appId}}, affectedCount={{affectedCount}}"
				}
			}
		},
		"github:handle-repositories-added": {
			"title": "GitHub Repos Added to App Install",
			"description": "Handles repositories added to GitHub App installation event - updates installation tracking",
			"logs": {
				"missing-installation-info": {
					"fields": [
						"eventType"
					],
					"nodeType": "insertion",
					"insertion": "Missing installation ID or app ID in {{eventType}} event"
				},
				"repos-added-complete": {
					"fields": [
						"installationId",
						"appId",
						"addedCount"
					],
					"nodeType": "insertion",
					"insertion": "Repositories added event processed: installationId={{installationId}}, appId={{appId}}, addedCount={{addedCount}}"
				}
			}
		},
		"github:handle-repositories-removed": {
			"title": "GitHub Repos Removed from App Install",
			"description": "Handles repositories removed from GitHub App installation event - updates installation tracking and disables affected integrations",
			"logs": {
				"missing-installation-info": {
					"fields": [
						"eventType"
					],
					"nodeType": "insertion",
					"insertion": "Missing installation ID or app ID in {{eventType}} event"
				},
				"no-integration-found": {
					"fields": [
						"repo"
					],
					"nodeType": "insertion",
					"insertion": "No integration found for repository {{repo}}"
				},
				"integration-disabled": {
					"fields": [
						"integrationId",
						"repo",
						"reason"
					],
					"nodeType": "insertion",
					"insertion": "Disabled integration {{integrationId}} for repo {{repo}} (reason: {{reason}})"
				},
				"repos-removed-complete": {
					"fields": [
						"installationId",
						"appId",
						"removedCount"
					],
					"nodeType": "insertion",
					"insertion": "Repositories removed event processed: installationId={{installationId}}, appId={{appId}}, removedCount={{removedCount}}"
				}
			}
		},
		"integration": {
			"sync": {
				"title": {
					"fields": [
						"integrationName"
					],
					"nodeType": "insertion",
					"insertion": "Sync {{integrationName}}"
				},
				"description": {
					"fields": [
						"integrationName"
					],
					"nodeType": "insertion",
					"insertion": "Synchronize data from {{integrationName}} integration"
				},
				"logs": {
					"starting": {
						"fields": [
							"integrationName"
						],
						"nodeType": "insertion",
						"insertion": "Starting {{integrationName}} sync..."
					},
					"sync-complete": {
						"fields": [
							"integrationName"
						],
						"nodeType": "insertion",
						"insertion": "{{integrationName}} sync completed"
					}
				},
				"completion": {
					"success": {
						"fields": [
							"integrationName"
						],
						"nodeType": "insertion",
						"insertion": "{{integrationName}} synchronized successfully"
					}
				}
			},
			"process": {
				"title": {
					"fields": [
						"integrationName"
					],
					"nodeType": "insertion",
					"insertion": "Process {{integrationName}} Event"
				},
				"description": {
					"fields": [
						"integrationName"
					],
					"nodeType": "insertion",
					"insertion": "Process event from {{integrationName}} integration"
				},
				"logs": {
					"starting": {
						"fields": [
							"integrationName"
						],
						"nodeType": "insertion",
						"insertion": "Processing {{integrationName}} event..."
					},
					"event-processed": {
						"fields": [
							"integrationName"
						],
						"nodeType": "insertion",
						"insertion": "{{integrationName}} event processed"
					},
					"processing-event": {
						"fields": [
							"eventName",
							"repo",
							"branch"
						],
						"nodeType": "insertion",
						"insertion": "Processing {{eventName}} for repo {{repo}} and branch {{branch}}"
					}
				},
				"completion": {
					"success": {
						"fields": [
							"integrationName"
						],
						"nodeType": "insertion",
						"insertion": "{{integrationName}} event processed successfully"
					}
				}
			}
		},
		"errors": {
			"invalid-params": {
				"fields": [
					"error"
				],
				"nodeType": "insertion",
				"insertion": "Invalid job parameters: {{error}}"
			},
			"job-failed": {
				"fields": [
					"error"
				],
				"nodeType": "insertion",
				"insertion": "Job failed: {{error}}"
			},
			"timeout": {
				"fields": [
					"duration"
				],
				"nodeType": "insertion",
				"insertion": "Job timed out after {{duration}}s"
			},
			"cancelled": "Job was cancelled",
			"loop-prevented": {
				"fields": [
					"reason"
				],
				"nodeType": "insertion",
				"insertion": "Infinite loop prevented: {{reason}}"
			}
		},
		"status": {
			"queued": "Queued",
			"active": "Running",
			"completed": "Completed",
			"failed": "Failed",
			"cancelled": "Cancelled"
		},
		"stats": {
			"activeCount": "Running",
			"completedCount": "Completed",
			"failedCount": "Failed",
			"totalRetries": "Retries"
		},
		"scheduler": {
			"logs": {
				"job-starting": {
					"fields": [
						"jobName"
					],
					"nodeType": "insertion",
					"insertion": "Starting job: {{jobName}}"
				},
				"job-completed": {
					"fields": [
						"jobName"
					],
					"nodeType": "insertion",
					"insertion": "Completed job: {{jobName}}"
				},
				"job-failed": {
					"fields": [
						"jobName",
						"errorMessage"
					],
					"nodeType": "insertion",
					"insertion": "Failed job: {{jobName}} - {{errorMessage}}"
				},
				"created-from-event": {
					"fields": [
						"eventName"
					],
					"nodeType": "insertion",
					"insertion": "Created from event: {{eventName}}"
				}
			},
			"messages": {
				"job-queued-successfully": "Job queued successfully",
				"job-scheduled-with-cron": {
					"fields": [
						"cron"
					],
					"nodeType": "insertion",
					"insertion": "Job scheduled with cron: {{cron}}"
				}
			}
		},
		"workflows": {
			"logs": {
				"sandbox-created": {
					"fields": [
						"sandboxId"
					],
					"nodeType": "insertion",
					"insertion": "Created sandbox: {{sandboxId}}"
				},
				"syncit-write-error": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "[syncIt] writeFile error: {{error}}"
				},
				"syncit-write-success": {
					"fields": [
						"result"
					],
					"nodeType": "insertion",
					"insertion": "[syncIt] {{result}}"
				},
				"syncit-list-error": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "[syncIt] listFiles error: {{error}}"
				},
				"syncit-read-error": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "[syncIt] readFile error: {{error}}"
				},
				"syncit-before-start": "[workflow] Found syncIt(before), executing now",
				"syncit-before-complete": "[workflow] syncIt(before) completed successfully",
				"syncit-before-failed": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "[workflow] syncIt(before) failed: {{error}}"
				},
				"tool-call": {
					"fields": [
						"name",
						"arguments"
					],
					"nodeType": "insertion",
					"insertion": "Tool call: {{name}}({{arguments}})"
				},
				"docs-dir-detected": {
					"fields": [
						"docsDir"
					],
					"nodeType": "insertion",
					"insertion": "Detected DOCS_DIR from tool output: {{docsDir}}"
				},
				"tool-completed": {
					"fields": [
						"name"
					],
					"nodeType": "insertion",
					"insertion": "Tool result: {{name}} completed"
				},
				"finalizer-failed": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "Finalizer failed: {{error}}"
				},
				"post-sync-docs-root": {
					"fields": [
						"docsRoot"
					],
					"nodeType": "insertion",
					"insertion": "[workflow] Using docsRoot={{docsRoot}} for post-sync"
				},
				"syncit-after-start": "[workflow] Found syncIt(after), executing now",
				"syncit-after-complete": "[workflow] syncIt(after) completed successfully",
				"syncit-after-failed": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "[workflow] syncIt(after) failed: {{error}}"
				},
				"sandbox-kill-proactive": "Killing sandbox as requested (proactive cleanup)",
				"sandbox-kill-proactive-failed": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "Failed to kill sandbox during proactive cleanup: {{error}}"
				},
				"workflow-fatal-error": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "Workflow fatal error: {{error}}"
				},
				"workflow-starting": {
					"fields": [
						"workflowType"
					],
					"nodeType": "insertion",
					"insertion": "Starting {{workflowType}} workflow in E2B mode"
				},
				"workflow-complete": "Workflow completed successfully",
				"workflow-files-generated": {
					"fields": [
						"fileCount"
					],
					"nodeType": "insertion",
					"insertion": "Generated {{fileCount}} output file(s)"
				},
				"workflow-failed": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "Workflow failed: {{error}}"
				},
				"workflow-execution-error": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "Workflow execution error: {{error}}"
				},
				"sandbox-kill-requested": "Killing sandbox as requested",
				"sandbox-left-running": "Sandbox left running (killSandbox=false)",
				"sandbox-cleanup-failed": {
					"fields": [
						"error"
					],
					"nodeType": "insertion",
					"insertion": "Failed to clean up sandbox: {{error}}"
				},
				"code-to-api-docs-complete": {
					"fields": [
						"docsDir"
					],
					"nodeType": "insertion",
					"insertion": "[direct] code-to-api-docs finished. DOCS_DIR={{docsDir}}"
				}
			}
		}
	},
	"language-switcher": {
		"label": "Language",
		"english": "English",
		"spanish": "Spanish"
	},
	"loading-state": {
		"loading": "Loading..."
	},
	"misc": {
		"progress": "Progress",
		"branch": {
			"fields": [
				"branch"
			],
			"nodeType": "insertion",
			"insertion": "Branch: {{branch}}"
		},
		"repoBranch": {
			"fields": [
				"repo",
				"branch"
			],
			"nodeType": "insertion",
			"insertion": "{{repo}} ({{branch}})"
		},
		"breadcrumbAriaLabel": "Breadcrumb",
		"statLabels": {
			"itemsProcessed": "Items Processed",
			"filesProcessed": "Files Processed",
			"totalItems": "Total Items",
			"totalFiles": "Total Files",
			"completed": "Completed",
			"processed": "Processed",
			"total": "Total",
			"count": "Count",
			"items": "Items",
			"files": "Files",
			"phase": "Phase",
			"errors": "Errors",
			"warnings": "Warnings",
			"sandboxId": "Sandbox ID",
			"githubUrl": "GitHub URL",
			"docJrn": "Document JRN"
		},
		"phases": {
			"initializing": "Initializing",
			"preparing-workflow": "Preparing workflow",
			"starting-sandbox": "Starting sandbox",
			"sandbox-running": "Sandbox running",
			"loading-data": "Loading data",
			"processing-batch-1": "Processing batch 1",
			"processing-batch-2": "Processing batch 2",
			"processing-batch-3": "Processing batch 3",
			"finalizing": "Finalizing",
			"complete": "Complete"
		}
	},
	"new-article-title-dialog": {
		"title": "New Article",
		"subtitle": "Enter a title for your new article",
		"titlePlaceholder": "Article title...",
		"typeLabel": "Document Type",
		"typeMarkdown": "Markdown / MDX",
		"typeJson": "OpenAPI Specification (JSON)",
		"typeYaml": "OpenAPI Specification (YAML)",
		"typeDescription": "Choose Markdown for documentation articles, or OpenAPI format for API specifications.",
		"cancel": "Cancel",
		"create": "Create"
	},
	"pagination": {
		"ariaLabel": "Pagination",
		"previousPage": "Previous page",
		"nextPage": "Next page",
		"page": "Page"
	},
	"preview": {
		"loadingPreview": {
			"fields": [
				"jrn"
			],
			"nodeType": "insertion",
			"insertion": "Loading preview for {{jrn}}..."
		},
		"articleNotFound": "Article Not Found",
		"couldNotLoadArticle": {
			"fields": [
				"jrn"
			],
			"nodeType": "insertion",
			"insertion": "Could not load article with JRN: {{jrn}}"
		},
		"untitled": "Untitled",
		"source": "Source:",
		"unknown": "Unknown",
		"lastUpdated": {
			"fields": [
				"date"
			],
			"nodeType": "insertion",
			"insertion": "Last updated: {{date}}"
		},
		"version": {
			"fields": [
				"version"
			],
			"nodeType": "insertion",
			"insertion": "Version {{version}}"
		},
		"rendered": "Rendered",
		"sourceView": "Source"
	},
	"repository-empty-state": {
		"noRepositoriesFound": "No repositories found",
		"noEnabledRepositories": "No enabled repositories",
		"noAccess": "This installation doesn't have access to any repositories.",
		"enableToStart": "Enable repositories to start generating documentation.",
		"viewAll": "View All Repositories"
	},
	"repository-filter-buttons": {
		"allRepos": "All Repos",
		"enabledOnly": {
			"fields": [
				"count"
			],
			"nodeType": "insertion",
			"insertion": "Enabled Only ({{count}})"
		}
	},
	"repository-viewer": {
		"title": "Repository Contents",
		"branch": "Branch",
		"lastSynced": "Last synced",
		"syncNow": "Sync Now",
		"loading": "Loading repository contents...",
		"noFiles": "No files found",
		"error": "Failed to load repository contents",
		"selectFile": "Select a file to view its contents",
		"bytes": "bytes",
		"folder": "Folder",
		"file": "File",
		"editFile": "Edit File",
		"saveFile": "Save File",
		"cancel": "Cancel",
		"saving": "Saving...",
		"saveSuccess": "File saved successfully",
		"saveError": "Failed to save file",
		"readOnlyFile": "Read only - managed by Jolli",
		"syntaxError": "Syntax Error",
		"orphanedEntryMsg": "Entry in _meta.ts has no matching article file",
		"missingEntryMsg": "Article file not listed in _meta.ts",
		"issuesTitle": "Issues",
		"errorCount": "error(s)",
		"warningCount": "warning(s)",
		"formatCode": "Format",
		"formatting": "Formatting...",
		"formatSuccess": "File formatted",
		"formatError": "Failed to format file",
		"newFolder": "New Folder",
		"renameFolder": "Rename Folder",
		"deleteFolder": "Delete Folder",
		"newFolderTitle": "Create New Folder",
		"newFolderPlaceholder": "Folder name",
		"renameFolderTitle": "Rename Folder",
		"deleteFolderTitle": "Delete Folder",
		"deleteFolderConfirm": "Are you sure you want to delete this folder? This action cannot be undone.",
		"deleteFolderNonEmpty": "This folder contains files. Deleting it will also delete all files inside.",
		"create": "Create",
		"rename": "Rename",
		"delete": "Delete",
		"folderCreated": "Folder created successfully",
		"folderRenamed": "Folder renamed successfully",
		"folderDeleted": "Folder deleted successfully",
		"folderCreateError": "Failed to create folder",
		"folderRenameError": "Failed to rename folder",
		"folderDeleteError": "Failed to delete folder",
		"folderCreationRestricted": "Cannot create folders in this directory",
		"fileCreationRestricted": "Cannot create files in this directory",
		"newFile": "New File",
		"newFileTitle": "Create New File",
		"newFilePlaceholder": "File name (without extension)",
		"fileCreated": "File created successfully",
		"fileCreateError": "Failed to create file",
		"moveFile": "Move to...",
		"moveFileTitle": "Move File",
		"selectDestination": "Select destination folder",
		"currentLocation": "Current location",
		"moveTo": "Move",
		"fileMoved": "File moved successfully",
		"moveFileError": "Failed to move file",
		"creatingAtRootConfig": "Only Nextra config files can be created at root level",
		"selectConfigFile": "Select a config file...",
		"allConfigFilesExist": "All available config files already exist",
		"selectMetaFile": "Select a _meta file...",
		"allMetaFilesExist": "A _meta file already exists in this folder"
	},
	"session-expired": {
		"title": "Session Expired",
		"message": "Your session has expired due to inactivity. Please log in again to continue.",
		"loginButton": "Log In Again"
	},
	"settings": {
		"title": "Settings",
		"subtitle": "Configure your preferences and account settings",
		"appearanceTitle": "Appearance",
		"appearanceDescription": "Customize the look and feel of the application",
		"themeLabel": "Theme",
		"themeDescription": "Choose between light and dark mode",
		"themeLight": "Light",
		"themeDark": "Dark",
		"languageTitle": "Language",
		"languageDescription": "Select your preferred language for the interface",
		"interfaceTitle": "Interface",
		"interfaceDescription": "Adjust interface layout and behavior",
		"sidebarLabel": "Sidebar default state",
		"sidebarDescription": "Choose whether the sidebar starts expanded or collapsed",
		"sidebarExpanded": "Expanded",
		"sidebarCollapsed": "Collapsed",
		"chatWidthLabel": "Chat panel width",
		"chatWidthDescription": "Set the default width of the chat panel (300-800 pixels)",
		"articlesTitle": "Articles",
		"articlesDescription": "Configure article-related preferences",
		"draftFilterLabel": "Default draft filter",
		"draftFilterDescription": "Choose which drafts to show by default",
		"draftFilterAll": "All",
		"draftFilterMyNew": "My New Drafts",
		"draftFilterShared": "Shared With Me",
		"draftFilterSuggested": "Suggested Updates",
		"showToolDetailsLabel": "Show AI tool details",
		"showToolDetailsDescription": "Display detailed information about AI tool usage in article drafts"
	},
	"site-articles-tab": {
		"title": "Articles",
		"loadingArticles": "Loading articles...",
		"allArticlesIncluded": "All articles included",
		"selectedArticlesMode": "articles selected",
		"saveArticleChanges": "Save Changes",
		"savingArticleChanges": "Saving...",
		"noChangesToSave": "No changes to save",
		"articleChangesSaved": "Article selection saved successfully",
		"articleChangesFailed": "Failed to save article selection"
	},
	"site-content-tab": {
		"title": "Content",
		"tabArticles": "Articles",
		"tabNavigation": "Navigation",
		"articlesDescription": "Select which articles to include in your documentation site",
		"includeAllArticles": "Include All Articles",
		"includeAllDescription": "Automatically include all published articles",
		"selectedCount": "selected",
		"saveSelection": "Save Selection",
		"saving": "Saving...",
		"noChanges": "No changes",
		"selectionSaved": "Selection saved successfully",
		"selectionFailed": "Failed to save selection",
		"loadingArticles": "Loading articles...",
		"navigationDescription": "Edit the sidebar navigation structure for your documentation",
		"editNavigation": "Edit Navigation",
		"navigationFile": "Navigation File",
		"noNavigationFile": "No navigation file found. Create one to customize your sidebar.",
		"createNavigationFile": "Create Navigation File",
		"unsavedChanges": "Unsaved changes",
		"rebuildNote": "Changes will be applied when you rebuild the site"
	},
	"site-detail": {
		"backButton": "Back to Sites",
		"rebuildButton": "Rebuild Site",
		"rebuildingButton": "Rebuilding...",
		"deleteButton": "Delete Site",
		"cancelBuildButton": "Cancel Build",
		"updateAvailable": "Update Available",
		"updateAvailableDescription": "Articles have been modified since the last build",
		"changeReasonContent": "Content Changed",
		"changeReasonSelection": "Selection Changed",
		"selectionChangesDescription": "Article selection has changed since the last build",
		"contentChangesDescription": "Article content has been modified since the last build",
		"mixedChangesDescription": "Articles have been modified and selection has changed since the last build",
		"configChangesDescription": "Configuration files have been manually edited since the last build",
		"configAndContentChangesDescription": "Articles and configuration files have been modified since the last build",
		"authChangesDescription": "Authentication settings have been changed since the last build",
		"authAndOtherChangesDescription": "Authentication settings and other content have been modified since the last build",
		"authSettingsTitle": "Authentication Settings",
		"authSettingLabel": "Site Authentication",
		"authEnabled": "Enabled",
		"authDisabled": "Disabled",
		"changedConfigFilesTitle": "Changed Config Files",
		"changedFilesTitle": "Changed Files",
		"changeTypeNew": "New",
		"changeTypeUpdated": "Updated",
		"changeTypeDeleted": "Deleted",
		"upToDate": "Up to Date",
		"checkingConfigFiles": "Checking for config file changes...",
		"deploymentInfoTitle": "Deployment Information",
		"deploymentStatusTitle": "Deployment Status",
		"repositoryInfoTitle": "Repository & Content",
		"githubRepository": "GitHub Repository",
		"vercelDeployment": "Vercel Deployment",
		"previewUrl": "Preview URL",
		"productionUrl": "Production URL",
		"framework": "Framework",
		"lastDeployed": "Last Deployed",
		"lastPublished": "Last Published",
		"lastBuilt": "Last Built",
		"statusTitle": "Status",
		"statusPending": "Pending",
		"statusBuilding": "Building",
		"statusActive": "Active",
		"statusError": "Error",
		"buildError": "Build Error",
		"buildInProgress": "Build in Progress",
		"articlesTitle": "Articles Included",
		"articlesCount": "articles",
		"mdxCompilationTitle": "MDX Compilation",
		"mdxCompliant": "MDX Compliant",
		"mdxNonCompliant": "Needs Fix",
		"fixMdxButton": "Fix MDX",
		"loadingArticles": "Loading articles...",
		"visibilityTitle": "Visibility",
		"visibilityInternal": "Internal",
		"visibilityExternal": "External",
		"protectionTitle": "Site Protection",
		"protectionStatus": "Protection Status",
		"protectionProtected": "Protected",
		"protectionPublic": "Public",
		"protectionType": "Protection Type",
		"protectionLastChecked": "Last Checked",
		"protectionRefresh": "Refresh Status",
		"protectionMakePublic": "Make Public",
		"protectionMakeProtected": "Make Protected",
		"protectionDescription": "Protected sites require authentication to access. Public sites can be accessed by anyone on the internet.",
		"allowedDomainTitle": "Allowed Domain",
		"publishButton": "Publish Site",
		"unpublishButton": "Unpublish Site",
		"publishingButton": "Publishing...",
		"unpublishingButton": "Unpublishing...",
		"publishStatusTitle": "Publication Status",
		"publishedStatus": "Published",
		"unpublishedStatus": "Unpublished",
		"internalSiteDescription": "Internal sites require users to log in with an email from the allowed domain. Authentication is handled at the application level.",
		"externalSiteDescription": "External sites can be published to make them publicly accessible, or unpublished to restrict access.",
		"deleteConfirmTitle": "Delete Site?",
		"deleteConfirmDescription": "This will permanently delete the site and all associated resources. This action cannot be undone.",
		"deleteConfirmButton": "Delete",
		"cancelButton": "Cancel",
		"viewSite": "View Site",
		"viewRepository": "View Repository",
		"loading": "Loading...",
		"notFound": "Site not found",
		"articlesTabTitle": "Articles",
		"allArticlesIncluded": "All articles are included in this site",
		"selectedArticlesMode": "specific articles selected",
		"selectSpecificArticles": "Switch to specific article selection",
		"includeAllArticles": "Include all articles",
		"saveArticleChanges": "Save Changes",
		"savingArticleChanges": "Saving...",
		"noChangesToSave": "No changes to save",
		"articleChangesSaved": "Article selection saved successfully",
		"articleChangesFailed": "Failed to save article selection",
		"loadingArticlesForTab": "Loading articles...",
		"tabOverview": "Overview",
		"tabContent": "Content",
		"tabSettings": "Settings",
		"tabLogs": "Logs",
		"tabStatus": "Status",
		"tabRepository": "Repository",
		"tabArticles": "Articles",
		"consistencyWarningTitle": "Navigation Consistency Issues",
		"consistencyWarningDescription": "The _meta.ts file has inconsistencies with the content folder. These will be auto-corrected during rebuild.",
		"orphanedEntriesLabel": "Entries in _meta.ts without matching articles:",
		"missingEntriesLabel": "Articles not listed in _meta.ts:",
		"proceedAnywayButton": "Proceed Anyway"
	},
	"site-logs-tab": {
		"title": "Build Logs",
		"description": "View build history and deployment logs",
		"currentBuild": "Current Build",
		"buildInProgress": "Build in Progress",
		"waitingForBuild": "Waiting for build to start...",
		"buildComplete": "Build Complete",
		"buildFailed": "Build Failed",
		"noBuildHistory": "No build history available",
		"showFullLogs": "Show Full Logs",
		"hideLogs": "Hide Logs",
		"expandLogs": "Expand",
		"collapseLogs": "Collapse",
		"buildSummary": "Build Summary",
		"step": "Step",
		"duration": "Duration",
		"buildErrors": "Build Errors",
		"lastBuildError": "Last Build Error",
		"noErrors": "No errors",
		"startedAt": "Started",
		"completedAt": "Completed",
		"connected": "Live",
		"disconnected": "Disconnected"
	},
	"site-overview-tab": {
		"title": "Overview",
		"articlesCount": "Articles",
		"lastBuilt": "Last Built",
		"created": "Created",
		"buildStatus": "Build Status",
		"statusPending": "Pending",
		"statusBuilding": "Building",
		"statusActive": "Active",
		"statusError": "Error",
		"buildInProgress": "Build in Progress",
		"deploymentBuilding": "Deployment Building",
		"deploymentBuildingDescription": "Vercel is building your site...",
		"previewUnavailable": "Preview Unavailable",
		"previewRequiresAuth": "Site requires authentication",
		"siteUrl": "Site URL",
		"openSite": "Open Site",
		"copiedToClipboard": "Copied!",
		"quickActions": "Quick Actions",
		"viewLogs": "View Build Logs",
		"editContent": "Edit Content",
		"configureSettings": "Configure Settings",
		"recentActivity": "Recent Activity",
		"noRecentActivity": "No recent activity"
	},
	"site-repository-tab": {
		"title": "Repository & Content",
		"noRepository": "No repository information available"
	},
	"site-settings-tab": {
		"title": "Settings",
		"authenticationTitle": "Authentication",
		"authenticationDescription": "Control who can access your documentation site",
		"enableAuthLabel": "Require Authentication",
		"enableAuthDescription": "Users must sign in before viewing this site",
		"authMethodLabel": "Authentication Provider",
		"authMethodJolli": "Jolli",
		"authMethodJolliDescription": "Authenticate users through your Jolli organization",
		"loginUrl": "Login URL",
		"saving": "Saving...",
		"authRebuildNote": "Authentication changes require a site rebuild to take effect.",
		"domainTitle": "Custom Domain",
		"domainDescription": "Connect your own domain to this documentation site",
		"currentDomain": "Current Domain",
		"defaultDomain": "Default Domain",
		"hideDomainManager": "Hide",
		"manageDomain": "Manage",
		"addDomain": "Add Domain",
		"dangerZoneTitle": "Danger Zone",
		"deleteSiteButton": "Delete Site",
		"deleteSiteDescription": "Permanently delete this site and all associated resources. This action cannot be undone.",
		"sectionGeneral": "General",
		"sectionAccess": "Access Control",
		"unsavedChanges": "You have unsaved changes",
		"saveChanges": "Save Changes",
		"changesSaved": "Changes saved"
	},
	"site-status-tab": {
		"title": "Status & Preview",
		"buildStatus": "Build Status",
		"statusPending": "Pending",
		"statusBuilding": "Building",
		"statusActive": "Active",
		"statusError": "Error",
		"buildInProgress": "Build in Progress",
		"visibility": "Visibility",
		"visibilityInternal": "Internal",
		"visibilityExternal": "External",
		"framework": "Framework",
		"allowedDomain": "Allowed Domain",
		"protectionType": "Protection Type",
		"siteUrl": "Site URL",
		"manageCustomDomain": "Connect custom domain →",
		"customDomainSettings": "Custom domain settings →",
		"hideCustomDomain": "← Hide",
		"lastBuilt": "Last Built",
		"lastDeployed": "Last Deployed",
		"protectionLastChecked": "Last Checked",
		"protectionRefresh": "Refresh Status",
		"internalSiteDescription": "Internal sites require users to log in with an email from the allowed domain. Authentication is handled at the application level.",
		"externalSiteDescription": "External sites can be published to make them publicly accessible, or unpublished to restrict access.",
		"buildErrors": "Build Errors",
		"lastBuildError": "Last Build Error",
		"jwtAuthTitle": "Authentication",
		"enableAuthLabel": "Enable Auth Mode",
		"enableAuthDescription": "Require users to authenticate before accessing this site",
		"authMethodLabel": "Authentication Method",
		"authMethodJolli": "Jolli",
		"authMethodJolliDescription": "Jolli will authenticate users and ensure they belong to your tenant",
		"jwtAuthLoginUrl": "Login URL",
		"jwtAuthSaving": "Saving...",
		"deploymentBuilding": "Deployment Building",
		"deploymentBuildingDescription": "Vercel is building your site...",
		"previewUnavailable": "Preview Unavailable",
		"previewRequiresAuth": "Site requires authentication",
		"redeployRequired": "Redeploy required for changes to take effect",
		"authEnabledNote": "If you just created this site with authentication enabled, you will need to rebuild for it to take effect."
	},
	"sites": {
		"title": "Sites",
		"createButton": "Create New Site",
		"emptyStateTitle": "No sites yet",
		"emptyStateDescription": "Create your first documentation site from your articles",
		"siteName": "Site Name",
		"displayName": "Display Name",
		"status": "Status",
		"visibility": "Visibility",
		"githubRepo": "GitHub Repository",
		"vercelUrl": "Vercel URL",
		"lastUpdated": "Last Updated",
		"articleCount": "Articles",
		"updateAvailable": "Update Available",
		"statusPending": "Pending",
		"statusBuilding": "Building",
		"statusActive": "Active",
		"statusError": "Error",
		"visibilityInternal": "Internal",
		"visibilityExternal": "External",
		"protectionProtected": "Protected",
		"protectionPublic": "Public",
		"viewDetails": "View Details",
		"viewSite": "View Site",
		"viewRepo": "View Repository",
		"loading": "Loading sites..."
	},
	"source-view": {
		"loadingSource": {
			"fields": [
				"jrn"
			],
			"nodeType": "insertion",
			"insertion": "Loading original source for {{jrn}}..."
		},
		"sourceNotAvailable": "Original Source Not Available",
		"couldNotLoadArticle": {
			"fields": [
				"jrn"
			],
			"nodeType": "insertion",
			"insertion": "Could not load article with JRN: {{jrn}}"
		},
		"noSourceContent": "This article does not have original source content available.",
		"originalSource": "Original Source",
		"sourceMetadata": "Source Metadata",
		"sourceContent": "Source Content",
		"created": {
			"fields": [
				"date"
			],
			"nodeType": "insertion",
			"insertion": "Created: {{date}}"
		},
		"updated": {
			"fields": [
				"date"
			],
			"nodeType": "insertion",
			"insertion": "Updated: {{date}}"
		}
	},
	"space-tree-nav": {
		"createFolder": "New Folder",
		"createDoc": "New Article",
		"newFolderTitle": "New Folder",
		"newDocTitle": "New Article",
		"newFolderSubtitle": "Enter a name for your new folder",
		"newArticleSubtitle": "Enter a name for your new article",
		"folderNamePlaceholder": "Folder name...",
		"docNamePlaceholder": "Article title...",
		"parentFolderLabel": "Parent Folder",
		"rootFolder": "(Root)",
		"typeLabel": "Document Type",
		"typeMarkdown": "Markdown / MDX",
		"typeJson": "OpenAPI Specification (JSON)",
		"typeYaml": "OpenAPI Specification (YAML)",
		"typeDescription": "Choose Markdown for documentation articles, or OpenAPI format for API specifications.",
		"cancel": "Cancel",
		"create": "Create",
		"delete": "Delete",
		"trash": "Trash",
		"deletedItems": "Deleted Items",
		"trashEmpty": "Trash is empty",
		"loading": "Loading...",
		"empty": "No documents yet",
		"emptyTreeDescription": "Create your first folder or document to get started.",
		"trashEmptyDescription": "Deleted items will appear here.",
		"restore": "Restore",
		"deleteConfirmTitle": {
			"fields": [
				"name"
			],
			"nodeType": "insertion",
			"insertion": "Delete \"{{name}}\"?"
		},
		"deleteDocDescription": "This will move the document to trash. You can restore it later.",
		"deleteEmptyFolderDescription": "This will move the folder to trash. You can restore it later.",
		"deleteFolderWithContentsDescription": {
			"fields": [
				"count"
			],
			"nodeType": "insertion",
			"insertion": "This will move the folder and all {{count}} items to trash. You can restore them later."
		},
		"confirmDelete": "Delete",
		"rename": "Rename",
		"renameFolderTitle": "Rename Folder",
		"renameDocTitle": "Rename Article",
		"renameFolderSubtitle": "Enter a new name for the folder",
		"renameDocSubtitle": "Enter a new name for the article",
		"nameLabel": "Name",
		"save": "Save",
		"nameEmptyError": "Name cannot be empty",
		"nameInvalidCharsError": "Name cannot contain: / \\ : * ? \" < > |"
	},
	"spaces": {
		"selectDocument": "No document selected",
		"selectDocumentDescription": "Select a document from the tree to view and edit its content."
	},
	"static-file-integration-flow": {
		"title": "Create Static File Source",
		"description": "Upload documents directly to Jolli for AI-powered documentation.",
		"nameLabel": "Source Name",
		"namePlaceholder": "e.g., Product Documentation",
		"nameRequired": "Please enter a name for this source",
		"continue": "Continue",
		"cancel": "Cancel",
		"failedCreate": "Failed to create source",
		"uploadTitle": "Upload Your First File",
		"uploadDescription": "Upload a markdown, text, JSON, or YAML file to get started.",
		"dropzoneText": "Click to select a file or drag and drop",
		"fileRequired": "Please select a file to upload",
		"uploading": "Uploading...",
		"skipForNow": "Skip for now",
		"failedUpload": "Failed to upload file",
		"successTitle": "Source Created!",
		"successMessage": "Your static file source has been created. You can upload more files at any time.",
		"done": "Done"
	},
	"static-file-manage": {
		"loading": "Loading...",
		"errorLoading": "Failed to load integration",
		"notFound": "Integration not found",
		"backToIntegrations": "Back to Sources",
		"subtitle": "Upload files to this source",
		"uploadTitle": "Upload a File",
		"dropzoneText": "Click to select a file or drag and drop",
		"fileRequired": "Please select a file to upload",
		"uploading": "Uploading...",
		"failedUpload": "Failed to upload file",
		"uploadSuccess": "File uploaded successfully!"
	},
	"subdomain-input": {
		"label": "Subdomain",
		"placeholder": "my-docs",
		"help": "Your site will be available at this address. Letters, numbers, and hyphens only.",
		"checking": "Checking availability...",
		"available": "This subdomain is available!",
		"taken": "This subdomain is already taken.",
		"trySuggestion": "Try this instead",
		"checkFailed": "Failed to check availability. Please try again.",
		"tooShort": "Subdomain must be at least 3 characters.",
		"tooLong": "Subdomain must be 63 characters or less.",
		"invalidFormat": "Subdomain can only contain letters, numbers, and hyphens. Cannot start or end with a hyphen.",
		"invalidCharacters": "Only lowercase letters, numbers, and hyphens are allowed.",
		"consecutiveHyphens": "Consecutive hyphens are not allowed."
	},
	"suggested-updates-card": {
		"title": "Suggested Updates",
		"viewAll": "View All",
		"loading": "Loading...",
		"suggestions": "suggestions"
	},
	"tenant-not-found": {
		"title": "Page Not Found",
		"notFoundMessage": "The workspace you're looking for doesn't exist or has been removed.",
		"inactiveMessage": "This workspace is currently inactive. Please contact your administrator.",
		"genericMessage": "We couldn't find what you're looking for.",
		"goToMain": "Go to main site"
	},
	"tenant-switcher": {
		"switchTenant": "Switch Tenant",
		"openInNewTab": "Open in new tab",
		"noTenantsAvailable": "No other tenants available",
		"currentTenant": "Current Tenant"
	},
	"version-history-dialog": {
		"title": "Version History",
		"loading": "Loading...",
		"restoring": "Restoring...",
		"confirmRestoreTitle": "Confirm Restore",
		"confirmRestoreMessage": "Are you sure you want to restore this version? This will create a new version based on the historical content.",
		"confirmRestoreCancel": "Cancel",
		"confirmRestoreConfirm": "Confirm",
		"restoreSuccess": "Version restored successfully",
		"restoreError": "Failed to restore version",
		"currentVersion": "Current"
	}
};
