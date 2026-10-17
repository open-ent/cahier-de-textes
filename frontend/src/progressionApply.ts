// Application d'une progression à une séance (glisser sur le calendrier, bouton « Utiliser une
// progression ») : comme l'AngularJS (Session.setFromProgression, calendar-view.ts#updateSession
// et #createSessionFromProgression). Fonctions pures, testées dans progressionApply.test.ts.
import { emptyHomework, HomeworkDraft } from './homeworkForm';
import type { ProgressionSession } from './progressions';
import { addDays, stripHtml, ymd } from './utils';
import { TITLE_MAX } from './sessionForm';

/** Titre et contenu repris de la progression ; le titre est tronqué à la limite des séances (50). */
export function sessionFieldsFrom(p: ProgressionSession): { title: string; description: string } {
  return { title: p.title.slice(0, TITLE_MAX), description: p.description };
}

/**
 * Devoirs de la progression sous forme de brouillons à enregistrer avec la séance. Un devoir de
 * progression n'a ni type ni échéance : on propose le type par défaut et le lendemain de la séance,
 * modifiables avant l'enregistrement. Ceux déjà repris (même description) ne sont pas dupliqués.
 * Ex. progression avec « Exercices 1 à 4 » (15 min), séance du 15/10 → devoir à rendre le 16/10.
 */
export function homeworksFrom(p: ProgressionSession, ctx: { typeId: string; sessionDate: string; existing: Array<{ description: string }> }): HomeworkDraft[] {
  const due = ctx.sessionDate ? ymd(addDays(new Date(`${ctx.sessionDate}T12:00:00`), 1)) : '';
  // Comparaison sur le texte : un devoir enregistré revient en XHTML complet (<html><body>…), pas tel qu'envoyé.
  const known = new Set(ctx.existing.map((h) => stripHtml(h.description)));
  return p.homeworks
    .filter((h) => !known.has(stripHtml(h.description)))
    .map((h) => ({ ...emptyHomework(), typeId: ctx.typeId, dueMode: 'date' as const, dueDate: due, estimatedTime: h.estimatedTime, description: h.description }));
}
