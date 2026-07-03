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

/** Lundi (00:00) de la semaine contenant `d` (semaine ISO, lundi premier jour). */
export function mondayOf(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (r.getDay() + 6) % 7; // 0 = lundi … 6 = dimanche
  return addDays(r, -dow);
}

/** Intitulé « du jj/mm au jj/mm » d'une semaine à partir de son lundi. */
export function weekLabel(monday: Date): string {
  const friday = addDays(monday, 4);
  const fr = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return `du ${fr(monday)} au ${fr(friday)}`;
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
