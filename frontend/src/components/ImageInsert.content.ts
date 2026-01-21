import { type Dictionary, t } from "intlayer";

const imageInsertContent = {
	key: "image-insert",
	content: {
		insertImage: t({
			en: "Images",
			es: "Imágenes",
		}),
		uploadNew: t({
			en: "Upload new image",
			es: "Subir nueva imagen",
		}),
		uploadHint: t({
			en: "PNG, JPEG, GIF, WebP (max 10MB)",
			es: "PNG, JPEG, GIF, WebP (máx 10MB)",
		}),
		reuseExisting: t({
			en: "Assets in this article",
			es: "Recursos en este artículo",
		}),
		pasteHint: t({
			en: "Tip: You can also paste or drag images into the editor",
			es: "Consejo: También puedes pegar o arrastrar imágenes al editor",
		}),
		addAltText: t({
			en: "Add Image Description",
			es: "Agregar descripción de imagen",
		}),
		altTextLabel: t({
			en: "Description (Alt Text)",
			es: "Descripción (Texto alternativo)",
		}),
		altTextPlaceholder: t({
			en: "Describe the image...",
			es: "Describe la imagen...",
		}),
		altTextHelp: t({
			en: "A brief description of the image for accessibility and SEO.",
			es: "Una breve descripción de la imagen para accesibilidad y SEO.",
		}),
		cancel: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		upload: t({
			en: "Upload",
			es: "Subir",
		}),
		invalidFileType: t({
			en: "Invalid file type. Please upload a PNG, JPEG, GIF, or WebP image.",
			es: "Tipo de archivo inválido. Por favor sube una imagen PNG, JPEG, GIF o WebP.",
		}),
		fileTooLarge: t({
			en: "File size exceeds maximum allowed size (10 MB)",
			es: "El tamaño del archivo excede el máximo permitido (10 MB)",
		}),
		uploadFailed: t({
			en: "Failed to upload image",
			es: "Error al subir la imagen",
		}),
		clickToInsert: t({
			en: "Click to insert",
			es: "Clic para insertar",
		}),
		deleteImage: t({
			en: "Remove from article",
			es: "Eliminar del artículo",
		}),
	},
} satisfies Dictionary;

export default imageInsertContent;
