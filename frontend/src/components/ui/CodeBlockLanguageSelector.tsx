import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./Command";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { Check, ChevronDown } from "lucide-react";
import * as React from "react";
import { useIntlayer } from "react-intlayer";
import { cn } from "@/common/ClassNameUtils";

/** Supported languages for the code block language selector (lowlight `common` bundle). */
const LANGUAGES: Array<{ value: string; label: string }> = [
	{ value: "arduino", label: "Arduino" },
	{ value: "bash", label: "Bash" },
	{ value: "c", label: "C" },
	{ value: "cpp", label: "C++" },
	{ value: "csharp", label: "C#" },
	{ value: "css", label: "CSS" },
	{ value: "diff", label: "Diff" },
	{ value: "go", label: "Go" },
	{ value: "graphql", label: "GraphQL" },
	{ value: "ini", label: "INI" },
	{ value: "java", label: "Java" },
	{ value: "javascript", label: "JavaScript" },
	{ value: "json", label: "JSON" },
	{ value: "kotlin", label: "Kotlin" },
	{ value: "less", label: "Less" },
	{ value: "lua", label: "Lua" },
	{ value: "makefile", label: "Makefile" },
	{ value: "markdown", label: "Markdown" },
	{ value: "objectivec", label: "Objective-C" },
	{ value: "perl", label: "Perl" },
	{ value: "php", label: "PHP" },
	{ value: "php-template", label: "PHP Template" },
	{ value: "plaintext", label: "Plain Text" },
	{ value: "python", label: "Python" },
	{ value: "python-repl", label: "Python REPL" },
	{ value: "r", label: "R" },
	{ value: "ruby", label: "Ruby" },
	{ value: "rust", label: "Rust" },
	{ value: "scss", label: "SCSS" },
	{ value: "shell", label: "Shell" },
	{ value: "sql", label: "SQL" },
	{ value: "swift", label: "Swift" },
	{ value: "typescript", label: "TypeScript" },
	{ value: "vbnet", label: "VB.NET" },
	{ value: "wasm", label: "WebAssembly" },
	{ value: "xml", label: "XML" },
	{ value: "yaml", label: "YAML" },
];

interface CodeBlockLanguageSelectorProps {
	language: string;
	onLanguageChange: (language: string) => void;
}

export function CodeBlockLanguageSelector({
	language,
	onLanguageChange,
}: CodeBlockLanguageSelectorProps): React.ReactElement {
	const [open, setOpen] = React.useState(false);
	// biome-ignore lint/suspicious/noExplicitAny: Intlayer types need to be regenerated after adding new keys
	const i18n = useIntlayer("tiptap-edit") as any;

	const selectedLabel = LANGUAGES.find(l => l.value === language)?.label ?? language ?? "";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					role="combobox"
					aria-expanded={open}
					data-testid="code-block-language-selector"
					className={cn(
						"flex items-center gap-1 rounded px-2 py-0.5 text-xs",
						"text-neutral-400 hover:text-neutral-200 hover:bg-white/10",
						"transition-colors cursor-pointer border-none bg-transparent",
						"outline-none focus-visible:ring-1 focus-visible:ring-neutral-500",
					)}
				>
					<span className="max-w-[100px] truncate">{selectedLabel || i18n.codeBlock?.language?.value}</span>
					<ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[200px] p-0"
				align="end"
				sideOffset={4}
				/* v8 ignore next 3 - Radix auto-focus event does not fire in jsdom */
				onOpenAutoFocus={e => {
					e.preventDefault();
				}}
			>
				<Command>
					<CommandInput
						placeholder={i18n.codeBlock?.searchLanguage?.value ?? "Search..."}
						data-testid="code-block-language-search"
					/>
					<CommandList>
						<CommandEmpty>{i18n.codeBlock?.noLanguageFound?.value ?? "No language found."}</CommandEmpty>
						<CommandGroup>
							{LANGUAGES.map(lang => (
								<CommandItem
									key={lang.value}
									value={lang.value}
									keywords={[lang.label]}
									onSelect={value => {
										onLanguageChange(value);
										setOpen(false);
									}}
									data-testid={`language-option-${lang.value}`}
								>
									<Check
										className={cn(
											"mr-2 h-4 w-4",
											language === lang.value ? "opacity-100" : "opacity-0",
										)}
									/>
									{lang.label}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
