import type { RunState, ToolDef } from "../../Types";
import { cat_tool_def, catExecutor } from "./cat";
import { code2docusaurus_run_tool_def, code2docusaurusRunExecutor } from "./code2docusaurus_run";
import { docs2docusaurus_run_tool_def, docs2docusaurusRunExecutor } from "./docs2docusaurus_run";
import { docusaurus2vercel_run_tool_def, docusaurus2vercelRunExecutor } from "./docusaurus2vercel_run";
import { get_plan_tool_def, getPlanExecutor } from "./get_plan";
import { git_diff_tool_def, gitDiffExecutor } from "./git_diff";
import { git_history_tool_def, gitHistoryExecutor } from "./git_history";
import { github_checkout_tool_def, githubCheckoutExecutor } from "./github_checkout";
// Import all tool definitions and executors
import { ls_tool_def, lsExecutor } from "./ls";
import { markdown_sections_tool_def, markdownSectionsExecutor } from "./markdown_sections";
import { set_plan_tool_def, setPlanExecutor } from "./set_plan";
import { sync_up_article_tool_def } from "./sync_up_article";
import { web_extract_tool_def, webExtractExecutor } from "./web_extract";
import { web_search_tool_def, webSearchExecutor } from "./web_search";
import { write_file_tool_def, writeFileExecutor } from "./write_file";
import { write_file_chunk_tool_def, writeFileChunkExecutor } from "./write_file_chunk";
import { write_file_stream_tool_def, writeFileStreamExecutor } from "./write_file_stream";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

// Base tool set used by most workflows (excludes chunk writer)
export const toolDefinitions: Array<ToolDef> = [
	set_plan_tool_def,
	get_plan_tool_def,
	ls_tool_def,
	cat_tool_def,
	web_search_tool_def,
	web_extract_tool_def,
	write_file_tool_def,
	write_file_stream_tool_def,
	git_history_tool_def,
	git_diff_tool_def,
];

// Extended tool set for architecture workflow only (adds chunk writer)
export const architectureToolDefinitions: Array<ToolDef> = [...toolDefinitions, write_file_chunk_tool_def];

// E2B tool definitions (includes E2B-specific tools like github_checkout)
// Note: sync_up_article is NOT included here - it's added via additionalTools
// in KnowledgeGraphJobs.ts because it needs backend DocDao access
export const e2bToolDefinitions: Array<ToolDef> = [
	ls_tool_def,
	cat_tool_def,
	github_checkout_tool_def,
	git_diff_tool_def,
	git_history_tool_def,
	code2docusaurus_run_tool_def,
	docs2docusaurus_run_tool_def,
	docusaurus2vercel_run_tool_def,
	web_search_tool_def,
	web_extract_tool_def,
	write_file_tool_def,
	write_file_stream_tool_def,
	write_file_chunk_tool_def,
];

// Map of tool names to their execution functions
export const localToolExecutors: Record<string, ToolExecutor> = {
	ls: lsExecutor,
	cat: catExecutor,
	web_search: webSearchExecutor,
	web_extract: webExtractExecutor,
	write_file: writeFileExecutor,
	write_file_chunk: writeFileChunkExecutor,
	write_file_stream: writeFileStreamExecutor,
	set_plan: setPlanExecutor,
	get_plan: getPlanExecutor,
	git_history: gitHistoryExecutor,
	git_diff: gitDiffExecutor,
	markdown_sections: markdownSectionsExecutor,
};

// E2B tool executors (reuses most local executors, but overrides with E2B-specific ones where needed)
// Note: sync_up_article executor is NOT included here - it's handled in KnowledgeGraphJobs.ts
export const e2bToolExecutors: Record<string, ToolExecutor> = {
	ls: lsExecutor, // Will use E2B implementation when e2bsandbox is present
	cat: catExecutor, // Will use E2B implementation when e2bsandbox is present
	github_checkout: githubCheckoutExecutor,
	git_diff: gitDiffExecutor, // Will use E2B implementation when e2bsandbox is present
	git_history: gitHistoryExecutor, // Will use E2B implementation when e2bsandbox is present
	code2docusaurus_run: code2docusaurusRunExecutor,
	docs2docusaurus_run: docs2docusaurusRunExecutor,
	docusaurus2vercel_run: docusaurus2vercelRunExecutor,
	web_search: webSearchExecutor,
	web_extract: webExtractExecutor,
	write_file: writeFileExecutor,
	write_file_stream: writeFileStreamExecutor,
	write_file_chunk: writeFileChunkExecutor,
};

// Export individual tool definitions and executors for direct access
export {
	ls_tool_def,
	lsExecutor,
	cat_tool_def,
	catExecutor,
	web_search_tool_def,
	webSearchExecutor,
	web_extract_tool_def,
	webExtractExecutor,
	write_file_tool_def,
	writeFileExecutor,
	write_file_chunk_tool_def,
	writeFileChunkExecutor,
	write_file_stream_tool_def,
	writeFileStreamExecutor,
	set_plan_tool_def,
	setPlanExecutor,
	get_plan_tool_def,
	getPlanExecutor,
	git_diff_tool_def,
	gitDiffExecutor,
	git_history_tool_def,
	gitHistoryExecutor,
	github_checkout_tool_def,
	githubCheckoutExecutor,
	markdown_sections_tool_def,
	markdownSectionsExecutor,
	code2docusaurus_run_tool_def,
	code2docusaurusRunExecutor,
	docs2docusaurus_run_tool_def,
	docs2docusaurusRunExecutor,
	docusaurus2vercel_run_tool_def,
	docusaurus2vercelRunExecutor,
	sync_up_article_tool_def,
};
