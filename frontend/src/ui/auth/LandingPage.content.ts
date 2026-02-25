import { type Dictionary, t } from "intlayer";

const landingPageContent = {
	key: "landingPage",
	content: {
		signIn: t({
			en: "Sign In",
			es: "Iniciar Sesión",
		}),
		enterApp: t({
			en: "Enter App",
			es: "Entrar a la Aplicación",
		}),
		comingSoonAlt: t({
			en: "Coming Soon",
			es: "Próximamente",
		}),
	},
} satisfies Dictionary;

export default landingPageContent;
