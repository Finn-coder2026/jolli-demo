import { type Dictionary, t } from "intlayer";

const profileContent = {
	key: "profile",
	content: {
		title: t({ en: "My Profile", es: "Mi perfil" }),
		subtitle: t({
			en: "View and manage your personal information",
			es: "Ver y administrar su informacion personal",
		}),

		// Personal information section
		personalInfoTitle: t({ en: "Personal Information", es: "Informacion personal" }),
		personalInfoDescription: t({
			en: "Your basic profile details",
			es: "Sus datos de perfil basicos",
		}),
		nameLabel: t({ en: "Name", es: "Nombre" }),
		nameDescription: t({
			en: "Your display name",
			es: "Su nombre para mostrar",
		}),
		emailLabel: t({ en: "Email", es: "Correo electronico" }),
		emailDescription: t({
			en: "Your email address",
			es: "Su direccion de correo electronico",
		}),

		// Language section
		languageTitle: t({ en: "Language", es: "Idioma" }),
		languageDescription: t({
			en: "Select your preferred language for the interface",
			es: "Seleccione su idioma preferido para la interfaz",
		}),
	},
} satisfies Dictionary;

export default profileContent;
