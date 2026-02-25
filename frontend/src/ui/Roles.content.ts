import { type Dictionary, t } from "intlayer";

const rolesContent = {
	key: "roles",
	content: {
		title: t({
			en: "Roles",
			es: "Roles",
		}),
		subtitle: t({
			en: "Manage roles and permissions for your organization",
			es: "Administrar roles y permisos para su organización",
		}),
	},
} satisfies Dictionary;

export default rolesContent;
