import { cn } from "../../common/ClassNameUtils";
import { Bot, FileText, HelpCircle, Search, Sparkles } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface AgentWelcomeProps {
	/** Called when a suggestion card is clicked */
	onSuggestionClick: (text: string) => void;
}

interface SuggestionCard {
	readonly icon: typeof FileText;
	readonly titleKey: "suggestionDraft" | "suggestionSearch" | "suggestionSummarize" | "suggestionAnswer";
	readonly descKey:
		| "suggestionDraftDesc"
		| "suggestionSearchDesc"
		| "suggestionSummarizeDesc"
		| "suggestionAnswerDesc";
	readonly prompt: string;
}

const SUGGESTIONS: ReadonlyArray<SuggestionCard> = [
	{
		icon: FileText,
		titleKey: "suggestionDraft",
		descKey: "suggestionDraftDesc",
		prompt: "I'd like to draft a new article",
	},
	{
		icon: Search,
		titleKey: "suggestionSearch",
		descKey: "suggestionSearchDesc",
		prompt: "Search my knowledge base for ",
	},
	{
		icon: Sparkles,
		titleKey: "suggestionSummarize",
		descKey: "suggestionSummarizeDesc",
		prompt: "Summarize the key points of ",
	},
	{
		icon: HelpCircle,
		titleKey: "suggestionAnswer",
		descKey: "suggestionAnswerDesc",
		prompt: "Answer this question: ",
	},
];

/**
 * Welcome screen shown when no conversation is active.
 * Displays a greeting and suggestion cards to help users get started.
 */
export function AgentWelcome({ onSuggestionClick }: AgentWelcomeProps): ReactElement {
	const content = useIntlayer("agent-page");

	return (
		<div className="flex flex-1 flex-col items-center justify-center px-4 py-8" data-testid="agent-welcome">
			<div className="flex flex-col items-center gap-4 mb-8">
				<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
					<Bot className="h-7 w-7 text-primary" />
				</div>
				<h1 className="text-2xl font-semibold text-foreground">{content.welcomeTitle}</h1>
			</div>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 w-full max-w-xl">
				{SUGGESTIONS.map(suggestion => (
					<button
						key={suggestion.titleKey}
						type="button"
						onClick={() => onSuggestionClick(suggestion.prompt)}
						className={cn(
							"agent-suggestion-card flex flex-col gap-1 rounded-xl border border-border bg-background p-4 text-left",
							"hover:border-primary/30",
						)}
						data-testid={`suggestion-${suggestion.titleKey}`}
					>
						<div className="flex items-center gap-2">
							<suggestion.icon className="h-4 w-4 text-primary" />
							<span className="text-sm font-medium text-foreground">{content[suggestion.titleKey]}</span>
						</div>
						<span className="text-xs text-muted-foreground">{content[suggestion.descKey]}</span>
					</button>
				))}
			</div>
		</div>
	);
}
