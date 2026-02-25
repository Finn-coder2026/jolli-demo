import { cn } from "../../common/ClassNameUtils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/ui/DropdownMenu";
import type { ConvoDateGroup } from "../../util/ConvoDateGroupUtil";
import { AgentPlanSection } from "./AgentPlanSection";
import type { AgentHubConvoSummary, AgentPlanPhase } from "jolli-common";
import { MoreHorizontal, Plus, Sparkles, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface AgentSidebarProps {
	/** Grouped conversations for display */
	groups: ReadonlyArray<ConvoDateGroup>;
	/** Currently active conversation ID */
	activeConvoId: number | undefined;
	/** Current plan phase */
	planPhase: AgentPlanPhase | undefined;
	/** Plan markdown content */
	plan: string | undefined;
	/** Called when user clicks "New Chat" */
	onNewChat: () => void;
	/** Called when user selects a conversation */
	onSelectConvo: (id: number) => void;
	/** Called when user deletes a conversation */
	onDeleteConvo: (id: number) => void;
	/** Called when user wants to view the full plan dialog */
	onOpenPlan: () => void;
}

/**
 * Sidebar showing conversation history grouped by date.
 * Includes "New Chat" button and per-conversation action menus.
 */
export function AgentSidebar({
	groups,
	activeConvoId,
	planPhase,
	plan,
	onNewChat,
	onSelectConvo,
	onDeleteConvo,
	onOpenPlan,
}: AgentSidebarProps): ReactElement {
	const content = useIntlayer("agent-page");

	return (
		<div
			className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-background/50"
			data-testid="agent-sidebar"
		>
			{/* New Chat Button */}
			<div className="p-3 shrink-0">
				<button
					type="button"
					onClick={onNewChat}
					className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
					data-testid="new-chat-button"
				>
					<Plus className="h-4 w-4" />
					<span>{content.newChat}</span>
				</button>
			</div>

			{/* Conversation List */}
			<div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-2 pb-2 agent-sidebar-fade">
				{groups.map(group => (
					<div key={group.label} className="mb-2">
						<h3 className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
							{group.label}
						</h3>
						<div className="space-y-0.5">
							{group.convos.map(convo => (
								<ConvoItem
									key={convo.id}
									convo={convo}
									isActive={convo.id === activeConvoId}
									untitledLabel={content.untitledConvo.value}
									deleteLabel={content.deleteConvo.value}
									onSelect={onSelectConvo}
									onDelete={onDeleteConvo}
								/>
							))}
						</div>
					</div>
				))}
			</div>

			{/* Plan Section */}
			<AgentPlanSection phase={planPhase} plan={plan} onOpenPlan={onOpenPlan} />
		</div>
	);
}

interface ConvoItemProps {
	convo: AgentHubConvoSummary;
	isActive: boolean;
	untitledLabel: string;
	deleteLabel: string;
	onSelect: (id: number) => void;
	onDelete: (id: number) => void;
}

/** A single conversation item in the sidebar list */
function ConvoItem({ convo, isActive, untitledLabel, deleteLabel, onSelect, onDelete }: ConvoItemProps): ReactElement {
	return (
		<div
			className={cn(
				"group/item flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm cursor-pointer transition-colors",
				isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
			)}
			data-testid="convo-item"
			data-active={isActive}
		>
			<button
				type="button"
				onClick={() => onSelect(convo.id)}
				className="flex-1 truncate text-left"
				data-testid="convo-item-button"
			>
				<span className="flex items-center gap-1.5">
					{convo.convoKind === "getting_started" && (
						<Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
					)}
					<span className="truncate">{convo.title || untitledLabel}</span>
				</span>
			</button>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="shrink-0 rounded p-0.5 opacity-0 group-hover/item:opacity-100 hover:bg-muted-foreground/10 transition-opacity"
						data-testid="convo-menu-trigger"
						aria-label="Conversation actions"
					>
						<MoreHorizontal className="h-4 w-4" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-36">
					<DropdownMenuItem
						onClick={() => onDelete(convo.id)}
						className="text-destructive focus:text-destructive"
						data-testid="convo-delete-action"
					>
						<Trash2 className="mr-2 h-4 w-4" />
						{deleteLabel}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
