import type { UiPreference } from '../api';

/** Au-delà, l'information a été transmise : le bandeau de retour cesse de s'afficher. */
export const MAX_DISPLAYS = 5;

/**
 * Le bandeau de retour (avec sa question « Qu'est-ce qui vous manque ? ») est-il à afficher pour cette
 * visite ? Décidé UNE FOIS, au premier chargement de la préférence : le bandeau compte ses affichages
 * en les écrivant, ce qui ne doit pas le faire disparaître sous les yeux de l'usager ni faire surgir
 * le bouton de bascule dans la même page.
 */
let eligibleAtLoad: boolean | null = null;
export function bannerEligible(preference: UiPreference | undefined): boolean {
  if (!preference) return false;
  if (eligibleAtLoad === null) eligibleAtLoad = !preference.returnDismissed && (preference.returnShown ?? 0) < MAX_DISPLAYS;
  return eligibleAtLoad && !preference.returnDismissed;
}
