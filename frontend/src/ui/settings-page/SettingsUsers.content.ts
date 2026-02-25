import { type Dictionary, t } from "intlayer";

const settingsUsersContent = {
	key: "settings-users",
	content: {
		title: t({ en: "Users", es: "Usuarios" }),
		subtitle: t({ en: "Manage team members and permissions", es: "Gestione miembros del equipo y permisos" }),
		comingSoon: t({ en: "Coming Soon", es: "Proximamente" }),
		comingSoonDescription: t({
			en: "User management features are currently in development. Check back soon!",
			es: "Las funciones de gestion de usuarios estan actualmente en desarrollo. Vuelva pronto!",
		}),
	},
} satisfies Dictionary;

export default settingsUsersContent;
