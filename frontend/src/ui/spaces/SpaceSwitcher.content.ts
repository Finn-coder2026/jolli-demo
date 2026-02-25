import { type Dictionary, t } from "intlayer";

const spaceSwitcherContent = {
	key: "space-switcher",
	content: {
		addSpace: t({
			en: "Add Space",
			es: "Agregar Espacio",
		}),
		createSpaceTitle: t({
			en: "Create New Space",
			es: "Crear Nuevo Espacio",
		}),
		createSpaceSubtitle: t({
			en: "Spaces help you organize your documentation into separate collections.",
			es: "Los espacios te ayudan a organizar tu documentación en colecciones separadas.",
		}),
		spaceNameLabel: t({
			en: "Space Name",
			es: "Nombre del Espacio",
		}),
		spaceNamePlaceholder: t({
			en: "My Knowledge Base",
			es: "Mi Base de Conocimientos",
		}),
		spaceDescriptionLabel: t({
			en: "Description (optional)",
			es: "Descripción (opcional)",
		}),
		spaceDescriptionPlaceholder: t({
			en: "A brief description of this space...",
			es: "Una breve descripción de este espacio...",
		}),
		spaceDescriptionHelp: t({
			en: "Add a description to help team members understand the purpose of this space.",
			es: "Agrega una descripción para ayudar a los miembros del equipo a entender el propósito de este espacio.",
		}),
		cancel: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		create: t({
			en: "Create Space",
			es: "Crear Espacio",
		}),
		creating: t({
			en: "Creating...",
			es: "Creando...",
		}),
		nameEmptyError: t({
			en: "Space name cannot be empty",
			es: "El nombre del espacio no puede estar vacío",
		}),
		nameInvalidCharsError: t({
			en: 'Space name cannot contain: / \\ : * ? " < > |',
			es: 'El nombre del espacio no puede contener: / \\ : * ? " < > |',
		}),
		createError: t({
			en: "Failed to create space. Please try again.",
			es: "Error al crear el espacio. Por favor, inténtalo de nuevo.",
		}),
		favorite: t({
			en: "Favorite",
			es: "Favorito",
		}),
		favorited: t({
			en: "Favorited",
			es: "Favorito",
		}),
		addFavorite: t({
			en: "Add to favorites",
			es: "Añadir a favoritos",
		}),
		removeFavorite: t({
			en: "Remove from favorites",
			es: "Quitar de favoritos",
		}),
	},
} satisfies Dictionary;

export default spaceSwitcherContent;
