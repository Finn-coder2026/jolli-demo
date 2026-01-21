import { Empty } from "../components/ui/Empty";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/Resizable";
import { useSpaceTree } from "../hooks/useSpaceTree";
import { Article } from "./Article";
import { SpaceTreeNav } from "./spaces/SpaceTreeNav";
import { FileQuestion } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export function Spaces(): ReactElement {
	const content = useIntlayer("spaces");
	const [treeState, treeActions] = useSpaceTree();

	// Get the selected document JRN for the right panel
	const selectedDoc = treeState.treeData
		.flatMap(function flattenNodes(node): Array<{ doc: typeof node.doc }> {
			return [{ doc: node.doc }, ...node.children.flatMap(flattenNodes)];
		})
		.find(item => item.doc.id === treeState.selectedDocId);

	const selectedJrn = selectedDoc?.doc.jrn;

	return (
		<ResizablePanelGroup direction="horizontal" className="h-full">
			{/* Left side: Tree navigation */}
			<ResizablePanel defaultSize={20} minSize={15} maxSize={33} className="border-r">
				<SpaceTreeNav state={treeState} actions={treeActions} />
			</ResizablePanel>

			{/* Resizable handle */}
			<ResizableHandle withHandle />

			{/* Right side: Content area */}
			<ResizablePanel defaultSize={80} minSize={67}>
				<div className="overflow-hidden p-5 h-full">
					{selectedJrn ? (
						<Article jrn={selectedJrn} />
					) : (
						<Empty
							icon={<FileQuestion className="h-12 w-12" />}
							title={content.selectDocument}
							description={content.selectDocumentDescription}
							className="h-full"
						/>
					)}
				</div>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
