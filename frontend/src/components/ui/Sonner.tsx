import { Toaster as SonnerToaster, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

/**
 * Toaster component that renders toast notifications using Sonner.
 * Add this component once at the root of your app (e.g., in App.tsx or MainElement.tsx).
 */
function Toaster({ ...props }: ToasterProps) {
	return (
		<SonnerToaster
			className="toaster group"
			richColors
			toastOptions={{
				classNames: {
					toast: "group toast group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
					description: "group-[.toast]:text-muted-foreground",
					actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
					cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
				},
			}}
			{...props}
		/>
	);
}

export { Toaster, toast };
