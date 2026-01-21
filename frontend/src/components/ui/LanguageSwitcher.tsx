import { SimpleDropdown, SimpleDropdownItem } from "./SimpleDropdown";
import { Locales } from "intlayer";
import { Globe } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer, useLocale } from "react-intlayer";

export function LanguageSwitcher(): ReactElement {
	const content = useIntlayer("language-switcher");
	const { locale, setLocale } = useLocale();

	return (
		<SimpleDropdown
			trigger={
				<button
					type="button"
					className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
					aria-label={content.label.value}
				>
					<Globe className="h-4 w-4" />
					<span>{content.label}</span>
				</button>
			}
		>
			<SimpleDropdownItem
				onClick={() => setLocale(Locales.ENGLISH)}
				className={locale === Locales.ENGLISH ? "bg-accent text-accent-foreground" : ""}
			>
				{content.english}
			</SimpleDropdownItem>
			<SimpleDropdownItem
				onClick={() => setLocale(Locales.SPANISH)}
				className={locale === Locales.SPANISH ? "bg-accent text-accent-foreground" : ""}
			>
				{content.spanish}
			</SimpleDropdownItem>
		</SimpleDropdown>
	);
}
