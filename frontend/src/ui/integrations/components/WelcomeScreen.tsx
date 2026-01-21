import { Button } from "../../../components/ui/Button";
import type { IntegrationType } from "../types";
import { FileUp, FolderGit2 } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

interface WelcomeScreenProps {
	hasExistingIntegrations: boolean;
	onSelectType(type: IntegrationType): void;
	onSkip(): void;
}

export function WelcomeScreen({ hasExistingIntegrations, onSelectType, onSkip }: WelcomeScreenProps): ReactElement {
	const content = useIntlayer("integration-setup");

	return (
		<div className="flex h-screen items-center justify-center bg-background">
			<div className="w-full max-w-2xl p-8">
				<div className="bg-card rounded-lg border p-8">
					<div className="flex flex-col items-center text-center">
						<h1 className="mb-4 text-3xl font-bold">
							{hasExistingIntegrations ? content.addIntegrationTitle : content.welcomeTitle}
						</h1>
						<p className="mb-8 text-lg text-muted-foreground max-w-lg">
							{hasExistingIntegrations ? content.addIntegrationMessage : content.welcomeMessage}
						</p>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg mb-6">
							<button
								type="button"
								onClick={() => onSelectType("github")}
								className="p-6 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer text-left"
							>
								<div className="flex items-center gap-4">
									<div className="rounded-full bg-primary/10 p-3">
										<FolderGit2 className="h-6 w-6 text-primary" />
									</div>
									<div>
										<h3 className="font-semibold">{content.githubOption}</h3>
										<p className="text-sm text-muted-foreground">{content.githubDescription}</p>
									</div>
								</div>
							</button>

							<button
								type="button"
								onClick={() => onSelectType("static_file")}
								className="p-6 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer text-left"
							>
								<div className="flex items-center gap-4">
									<div className="rounded-full bg-primary/10 p-3">
										<FileUp className="h-6 w-6 text-primary" />
									</div>
									<div>
										<h3 className="font-semibold">{content.staticFileOption}</h3>
										<p className="text-sm text-muted-foreground">{content.staticFileDescription}</p>
									</div>
								</div>
							</button>
						</div>

						<Button onClick={onSkip} variant="ghost" className="w-full max-w-md">
							{content.skipForNow}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
