/**
 * Namenslogik der Polly-Rollen (siehe `documentation/permissions.md`).
 *
 * Genutzt vom Frontend (`appStore`, Bedienschutz) und von der Lambda `invitations`
 * (serverseitige Prüfung von `polly_deploy`). Deshalb ohne `@/`-Alias und ohne Imports.
 *
 * Berechtigt ist die Rolle mit dem Prefix der eigenen Installation (`<projectTag>_<rolle>`)
 * oder die unpräfixierte Rolle (Legacy, gilt in allen Installationen). Groß-/Kleinschreibung zählt nicht.
 */
export function hasPollyRole(roleNames: readonly string[], role: string, projectTag?: string): boolean {
	const legacy = role.toLowerCase();
	const wanted = (projectTag ? `${projectTag}_${role}` : role).toLowerCase();
	return roleNames.some(name => {
		const normalized = String(name ?? "").toLowerCase();
		return normalized === wanted || normalized === legacy;
	});
}
