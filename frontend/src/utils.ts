/** Fonctions pures du module Cahier-de-textes (testables). */

const pad = (n: number) => String(n).padStart(2, '0');

/** Format « YYYY-MM-DD » d'une Date. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Ajoute `days` jours à une Date (nouvelle Date). */
export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

/** Formate une date « YYYY-MM-DD » en « jj/mm/aaaa » (locale FR). */
export function formatDate(s?: string): string {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR');
  }
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Clé de tri chronologique d'une date « YYYY-MM-DD » (chaîne comparable). */
export function sortKey(s?: string): string {
  return s ?? '9999-99-99';
}

/** Retire les balises HTML d'une description (certains devoirs ont un contenu HTML). */
export function stripHtml(s?: string): string {
  if (!s) return '';
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
