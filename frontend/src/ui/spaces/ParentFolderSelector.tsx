import { Label } from "../../components/ui/Label";
import { SelectBox } from "../../components/ui/SelectBox";
import type { FolderOption } from "./CreateItemDialog";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { useIntlayer } from "react-intlayer";

export interface ParentFolderSelectorProps {
	folders: Array<FolderOption>;
	value: string;
	onChange: (value: string) => void;
	excludedIds?: Set<number>;
}

export function ParentFolderSelector({
	folders,
	value,
	onChange,
	excludedIds,
}: ParentFolderSelectorProps): ReactElement {
	const content = useIntlayer("space-tree-nav");

	const folderOptions = useMemo(
		() => [
			{ value: "root", label: content.rootFolder.value },
			...folders
				.filter(folder => !excludedIds?.has(folder.id))
				.map(folder => ({
					value: String(folder.id),
					label: folder.depth > 0 ? "\u00A0\u00A0".repeat(folder.depth) + folder.name : folder.name,
				})),
		],
		[folders, excludedIds, content.rootFolder.value],
	);

	return (
		<div>
			<Label htmlFor="parent-folder">{content.parentFolderLabel}</Label>
			<SelectBox
				value={value}
				onValueChange={onChange}
				options={folderOptions}
				width="100%"
				data-testid="parent-folder-select"
			/>
		</div>
	);
}
