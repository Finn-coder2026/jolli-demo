/**
 * Localization content for PreferencesPage.
 *
 * Note: Most content is reused from the existing "settings" content file.
 * This file just adds the page-specific title and subtitle.
 */
import { type Dictionary, t } from "intlayer";

const content = {
	key: "preferences-page",
	content: {
		title: t({
			en: "Preferences",
			es: "Preferencias",
			fr: "Préférences",
			de: "Einstellungen",
			ja: "設定",
			ko: "환경설정",
			zh: "偏好设置",
		}),
		subtitle: t({
			en: "Customize your application experience.",
			es: "Personaliza tu experiencia de la aplicación.",
			fr: "Personnalisez votre expérience d'application.",
			de: "Passen Sie Ihre Anwendungserfahrung an.",
			ja: "アプリケーションの操作性をカスタマイズします。",
			ko: "애플리케이션 환경을 맞춤 설정하세요.",
			zh: "自定义您的应用体验。",
		}),
	},
} satisfies Dictionary;

export default content;
