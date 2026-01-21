import { Button } from "../../../components/ui/Button";
import { Check } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

interface SuccessScreenProps {
	onFinish(): void;
	title?: string;
	message?: string;
}

export function SuccessScreen({ onFinish, title, message }: SuccessScreenProps): ReactElement {
	const content = useIntlayer("integration-setup");

	return (
		<div className="flex h-screen items-center justify-center bg-background">
			<div className="w-full max-w-2xl p-8">
				<div className="bg-card rounded-lg border p-8">
					<div className="flex flex-col items-center text-center">
						<div className="mb-6 rounded-full bg-green-500/10 p-4">
							<Check className="h-12 w-12 text-green-500" />
						</div>
						<h2 className="mb-4 text-3xl font-bold">{title ?? content.successTitle}</h2>
						<p className="mb-8 text-lg text-muted-foreground max-w-lg">
							{message ?? content.successMessage}
						</p>

						<Button onClick={onFinish} className="w-full max-w-md" size="lg">
							{content.goToDashboard}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
