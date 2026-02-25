import { type Dictionary, insert, t } from "intlayer";

const usersContent = {
	key: "users",
	content: {
		title: t({ en: "Users", es: "Usuarios" }),
		subtitle: t({
			en: "Manage team members and their access levels.",
			es: "Gestiona los miembros del equipo y sus niveles de acceso.",
		}),
		inviteButton: t({ en: "Invite User", es: "Invitar Usuario" }),

		// Tabs
		tabActive: t({ en: "Active", es: "Activos" }),
		tabPending: t({ en: "Pending", es: "Pendientes" }),
		tabArchived: t({ en: "Archived", es: "Archivados" }),

		// Column headers
		columnUser: t({ en: "User", es: "Usuario" }),
		columnName: t({ en: "Name", es: "Nombre" }),
		columnEmail: t({ en: "Email", es: "Correo" }),
		columnRole: t({ en: "Role", es: "Rol" }),
		columnStatus: t({ en: "Status", es: "Estado" }),
		columnInvitedAt: t({ en: "Invited", es: "Invitado" }),
		columnInvitedBy: t({ en: "Invited By", es: "Invitado Por" }),
		columnRemovedAt: t({ en: "Removed At", es: "Eliminado En" }),
		columnRemovedBy: t({ en: "Removed By", es: "Eliminado Por" }),
		columnReason: t({ en: "Reason", es: "Motivo" }),
		columnActions: t({ en: "Actions", es: "Acciones" }),
		columnExpiresAt: t({ en: "Expires At", es: "Fecha de Expiración" }),
		columnJoined: t({ en: "Joined", es: "Ingreso" }),
		columnJoinedAt: t({ en: "Joined At", es: "Fecha de Ingreso" }),

		// Pagination
		pageSize: t({ en: "Page size", es: "Por pagina" }),
		showingResults: t({
			en: "Showing {start}-{end} of {total}",
			es: "Mostrando {start}-{end} de {total}",
		}),

		// Empty states
		emptyActive: t({ en: "No active users", es: "No hay usuarios activos" }),
		emptyPending: t({ en: "No pending invitations", es: "No hay invitaciones pendientes" }),
		emptyArchived: t({ en: "No archived users", es: "No hay usuarios archivados" }),

		// Loading states
		loading: t({ en: "Loading...", es: "Cargando..." }),

		// Error messages
		errorLoadingUsers: t({ en: "Failed to load users", es: "Error al cargar usuarios" }),
		errorInvitingUser: t({ en: "Failed to invite user", es: "Error al invitar usuario" }),
		errorCancellingInvitation: t({ en: "Failed to cancel invitation", es: "Error al cancelar invitacion" }),
		errorResendingInvitation: t({ en: "Failed to resend invitation", es: "Error al reenviar invitacion" }),
		errorUpdatingRole: t({ en: "Failed to update user role", es: "Error al actualizar rol" }),
		errorArchivingUser: t({ en: "Failed to archive user", es: "Error al archivar usuario" }),

		// Roles
		roleOwner: t({ en: "Owner", es: "Propietario" }),
		roleAdmin: t({ en: "Admin", es: "Administrador" }),
		roleMember: t({ en: "Member", es: "Miembro" }),

		// Actions
		actionEdit: t({ en: "Edit", es: "Editar" }),
		actionResend: t({ en: "Resend", es: "Reenviar" }),
		actionCancel: t({ en: "Cancel", es: "Cancelar" }),
		actionChangeRole: t({ en: "Change Role", es: "Cambiar Rol" }),
		actionRemove: t({ en: "Remove", es: "Eliminar" }),

		// Invite dialog
		inviteDialogTitle: t({ en: "Invite User", es: "Invitar Usuario" }),
		inviteDialogDescription: t({
			en: "Send an invitation to join this organization",
			es: "Enviar una invitacion para unirse a esta organizacion",
		}),
		inviteEmailLabel: t({ en: "Email", es: "Correo electronico" }),
		inviteEmailPlaceholder: t({ en: "user@example.com", es: "usuario@ejemplo.com" }),
		inviteNameLabel: t({ en: "Name (optional)", es: "Nombre (opcional)" }),
		inviteNamePlaceholder: t({ en: "John Doe", es: "Juan Perez" }),
		inviteRoleLabel: t({ en: "Role", es: "Rol" }),
		inviteSendButton: t({ en: "Send Invitation", es: "Enviar Invitacion" }),
		inviteCancelButton: t({ en: "Cancel", es: "Cancelar" }),

		// Email validation
		emailPatternError: t({
			en: "Email does not match the authorized patterns for this organization",
			es: "El correo electrónico no coincide con los patrones autorizados para esta organización",
		}),

		// Edit user dialog
		editDialogTitle: t({ en: "Edit User", es: "Editar Usuario" }),
		editDialogDescription: t({
			en: "Update user information",
			es: "Actualizar información del usuario",
		}),
		editEmailLabel: t({ en: "Email", es: "Correo electrónico" }),
		editNameLabel: t({ en: "Name", es: "Nombre" }),
		editNamePlaceholder: t({ en: "Enter name", es: "Ingrese el nombre" }),
		editRoleLabel: t({ en: "Role", es: "Rol" }),
		editSaveButton: t({ en: "Save Changes", es: "Guardar Cambios" }),
		editCancelButton: t({ en: "Cancel", es: "Cancelar" }),
		errorUpdatingUser: t({ en: "Failed to update user", es: "Error al actualizar usuario" }),

		// Confirmation dialogs
		confirmCancelInvitationTitle: t({
			en: "Cancel Invitation",
			es: "Cancelar Invitacion",
		}),
		confirmCancelInvitationDescription: t({
			en: insert("Are you sure you want to cancel the invitation to {{email}}?"),
			es: insert("Esta seguro de que desea cancelar la invitacion a {{email}}?"),
		}),
		confirmCancelInvitationButton: t({
			en: "Cancel Invitation",
			es: "Cancelar Invitacion",
		}),
		confirmDeactivateUserTitle: t({
			en: "Deactivate User",
			es: "Desactivar Usuario",
		}),
		confirmDeactivateUserDescription: t({
			en: insert("Are you sure you want to deactivate {{name}}?"),
			es: insert("¿Estás seguro de que deseas desactivar a {{name}}?"),
		}),
		confirmDeactivateUserButton: t({
			en: "Deactivate",
			es: "Desactivar",
		}),
		confirmDeleteUserTitle: t({
			en: "Delete User",
			es: "Eliminar Usuario",
		}),
		confirmDeleteUserDescription: t({
			en: insert("Are you sure you want to delete {{name}} from the organization?"),
			es: insert("¿Estás seguro de que deseas eliminar a {{name}} de la organización?"),
		}),
		confirmDeleteUserButton: t({
			en: "Delete",
			es: "Eliminar",
		}),
		confirmResendInvitationTitle: t({
			en: "Resend Invitation",
			es: "Reenviar Invitacion",
		}),
		confirmResendInvitationDescription: t({
			en: insert("Are you sure you want to resend the invitation to {{email}}?"),
			es: insert("Esta seguro de que desea reenviar la invitacion a {{email}}?"),
		}),
		confirmResendButton: t({ en: "Resend", es: "Reenviar" }),

		// Success messages
		successInviteSent: t({ en: "Invitation sent successfully", es: "Invitacion enviada exitosamente" }),
		successInvitationCancelled: t({ en: "Invitation cancelled", es: "Invitacion cancelada" }),
		successInvitationResent: t({ en: "Invitation resent", es: "Invitacion reenviada" }),
		successRoleUpdated: t({ en: "Role updated", es: "Rol actualizado" }),
		successUserRemoved: t({ en: "User removed", es: "Usuario eliminado" }),

		// Status
		statusActive: t({ en: "Active", es: "Activo" }),
		statusInactive: t({ en: "Inactive", es: "Inactivo" }),
		statusPending: t({ en: "Pending", es: "Pendiente" }),
		statusAccepted: t({ en: "Accepted", es: "Aceptado" }),
		statusExpired: t({ en: "Expired", es: "Expirado" }),

		// Dropdown menu actions
		actionActivate: t({ en: "Activate", es: "Activar" }),
		actionDeactivate: t({ en: "Deactivate", es: "Desactivar" }),
		actionDelete: t({ en: "Delete", es: "Eliminar" }),

		// Confirmation dialogs for activate
		confirmActivateUserTitle: t({
			en: "Activate User",
			es: "Activar Usuario",
		}),
		confirmActivateUserDescription: t({
			en: insert("Are you sure you want to activate {{name}}?"),
			es: insert("¿Estás seguro de que deseas activar a {{name}}?"),
		}),
		confirmActivateUserButton: t({
			en: "Activate",
			es: "Activar",
		}),

		// Error messages for activate/deactivate
		errorDeactivatingUser: t({ en: "Failed to deactivate user", es: "Error al desactivar usuario" }),
		errorActivatingUser: t({ en: "Failed to activate user", es: "Error al activar usuario" }),
	},
} satisfies Dictionary;

export default usersContent;
