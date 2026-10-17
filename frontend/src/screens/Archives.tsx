import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import { archivedOn, archivesQuery, effectiveTeachers, exportUrl, teacherLabel } from '../archives';
import { useDiaryContext } from '../hooks/useDiaryContext';

/**
 * Archives des cahiers de textes des années passées, comme l'AngularJS
 * (notebook-archive/notebook-archives.html) : année scolaire, recherche d'enseignants (droit
 * dédié) et de classes, liste paginée, téléchargement d'un PDF ou de plusieurs (archive ZIP).
 * Ex. archives 2025-2026 de la classe 401 : « Maths · Anne DUPONT · archivé le 05/07/2026 ».
 */
export function Archives() {
  const { t } = useTranslation(['diary', 'common']);
  const ctx = useDiaryContext();
  const structureId = ctx.structure?.id ?? '';
  const canSearchTeachers = ctx.has('searchNotebookArchiveTeachers');

  const years = useQuery({ queryKey: ['diary', 'archive-years', structureId], queryFn: () => api.getArchiveYears(structureId), enabled: !!structureId });
  const [year, setYear] = useState('');
  const [teachers, setTeachers] = useState<string[]>([]);
  const [audiences, setAudiences] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  useEffect(() => {
    // Année la plus récente par défaut (comme l'AngularJS), à chaque changement d'établissement.
    setYear(years.data?.[0] ?? '');
    setPage(0);
    setTeachers([]);
    setAudiences([]);
    setSelected(new Set());
  }, [years.data, structureId]);

  const filters = { schoolYear: year, teacherNames: effectiveTeachers(teachers, ctx.profile === 'teacher', canSearchTeachers, { firstName: ctx.firstName, lastName: ctx.lastName }), audienceLabels: audiences, page };
  const list = useQuery({ queryKey: ['diary', 'archives', structureId, archivesQuery(filters)], queryFn: () => api.getArchives(structureId, archivesQuery(filters)), enabled: !!structureId && !!year && !!ctx.userId });
  const rows = list.data?.all ?? [];
  const pageCount = list.data?.page_count ?? 0;
  const reset = () => { setPage(0); setSelected(new Set()); };

  if (ctx.ready && !structureId) {
    return <div className="alert alert-info" role="alert">{t('diary.no.structure', { defaultValue: 'Aucun établissement associé à votre compte.' })}</div>;
  }
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div>
      <h1 className="mb-16">{t('archives', { defaultValue: 'Archives' })}</h1>
      <div className="d-flex gap-16 flex-wrap align-items-start mb-16">
        {(years.data ?? []).length > 0 && (
          <div>
            <label htmlFor="ar-year" className="form-label">{t('notebook.archive.school.year', { defaultValue: 'Année scolaire' })}</label>
            <select id="ar-year" className="form-select" value={year} onChange={(e) => { setYear(e.target.value); reset(); }}>
              {(years.data ?? []).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
        {canSearchTeachers && (
          <NameSearch id="ar-teacher" label={t('diary.search.teacher', { defaultValue: 'Enseignant' })} chosen={teachers} fetcher={(q) => api.searchArchiveTeachers(structureId, q)} onChange={(v) => { setTeachers(v); reset(); }} attr="data-chosen-teachers" suggest="data-suggestions-teachers" />
        )}
        <NameSearch id="ar-audience" label={t('diary.search.class', { defaultValue: 'Classe ou groupe' })} chosen={audiences} fetcher={(q) => api.searchArchiveAudiences(structureId, q)} onChange={(v) => { setAudiences(v); reset(); }} attr="data-chosen-audiences" suggest="data-suggestions-audiences" />
      </div>

      {selected.size > 0 && (
        <div className="mb-12" role="toolbar" aria-label={t('diary.notebooks.actions', { defaultValue: 'Actions sur la sélection' })} data-toolbar>
          <a className="btn btn-primary" href={exportUrl(structureId, [...selected])} data-download>{t('notebook.archive.download.pdf', { defaultValue: 'Télécharger PDF' })}</a>
        </div>
      )}

      {(years.isLoading || list.isLoading) && <p>{t('diary.loading', { defaultValue: 'Chargement…' })}</p>}
      {!years.isLoading && (years.data ?? []).length === 0 && <p className="text-muted" data-empty>{t('notebook.archive.notAvailable', { defaultValue: "Il n'y a pas de cahier de textes archivé disponible pour le moment" })}</p>}
      {(years.data ?? []).length > 0 && !list.isLoading && rows.length === 0 && <p className="text-muted" data-empty>{t('notebook.archive.notAvailable', { defaultValue: "Il n'y a pas de cahier de textes archivé disponible pour le moment" })}</p>}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="table table-bordered mb-0" data-archives>
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" aria-label={t('diary.progression.select.all', { defaultValue: 'Tout sélectionner' })} checked={allChecked} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
                <th>{t('notebook.archive.header.audience', { defaultValue: 'Classe' })}</th>
                <th>{t('notebook.archive.header.teacher', { defaultValue: 'Enseignant' })}</th>
                <th>{t('notebook.archive.header.subject', { defaultValue: 'Matière' })}</th>
                <th>{t('notebook.archive.header.archived.period', { defaultValue: 'Période archivée' })}</th>
                <th>{t('notebook.archive.header.archived.on', { defaultValue: 'Archivé le' })}</th>
                <th>{t('notebook.archive.header.pdf', { defaultValue: 'PDF' })}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-archive={r.id}>
                  <td><input type="checkbox" aria-label={`${t('diary.progression.select', { defaultValue: 'Sélectionner' })} ${r.audience_label} ${r.subject_label}`} checked={selected.has(r.id)} onChange={(e) => setSelected((s) => { const c = new Set(s); if (e.target.checked) c.add(r.id); else c.delete(r.id); return c; })} /></td>
                  <td>{r.audience_label}</td>
                  <td>{teacherLabel(r)}</td>
                  <td>{(r.subject_label ?? '').toUpperCase()}</td>
                  <td>{r.archive_school_year}</td>
                  <td>{archivedOn(r.created_at)}</td>
                  <td><a href={exportUrl(structureId, [r.id])} aria-label={`${t('notebook.archive.download.pdf', { defaultValue: 'Télécharger PDF' })} ${r.audience_label} ${r.subject_label}`}>PDF</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pageCount > 1 && (
        <nav className="d-flex gap-8 align-items-center mt-12" aria-label={t('diary.notebooks.pagination', { defaultValue: 'Pagination' })} data-pagination>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => { setPage(page - 1); setSelected(new Set()); }}>{t('diary.notebooks.previous', { defaultValue: 'Précédent' })}</button>
          <span>{page + 1} / {pageCount}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page + 1 >= pageCount} onClick={() => { setPage(page + 1); setSelected(new Set()); }}>{t('diary.notebooks.next', { defaultValue: 'Suivant' })}</button>
        </nav>
      )}
    </div>
  );
}

/** Recherche de noms (au moins 2 caractères) avec choix multiple, sous forme de pastilles. */
function NameSearch({ id, label, chosen, fetcher, onChange, attr, suggest }: { id: string; label: string; chosen: string[]; fetcher: (q: string) => Promise<string[]>; onChange: (v: string[]) => void; attr: string; suggest: string }) {
  const { t } = useTranslation(['diary', 'common']);
  const [q, setQ] = useState('');
  const found = useQuery({ queryKey: ['diary', 'archive-search', id, q], queryFn: () => fetcher(q), enabled: q.trim().length >= 2 });
  const options = (found.data ?? []).filter((n) => !chosen.includes(n));
  return (
    <div style={{ minWidth: 240, position: 'relative' }}>
      <label htmlFor={id} className="form-label" style={{ fontWeight: 700 }}>{label}</label>
      <input id={id} className="form-control" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 && options.length > 0 && (
        <ul className="list-unstyled border rounded bg-white p-4 m-0" style={{ position: 'absolute', zIndex: 20, minWidth: 240 }} {...{ [suggest]: true }}>
          {options.map((n) => <li key={n}><button type="button" className="btn btn-link p-0 text-start" onClick={() => { onChange([...chosen, n]); setQ(''); }}>{n}</button></li>)}
        </ul>
      )}
      {chosen.length > 0 && (
        <ul className="list-inline mt-4 mb-0" {...{ [attr]: true }}>
          {chosen.map((n) => (
            <li key={n} className="d-inline-flex align-items-center gap-4 me-8 badge bg-secondary" style={{ color: '#fff' }}>
              {n}
              <button type="button" className="btn btn-link p-0 text-white" style={{ background: 'none', color: '#fff' }} aria-label={`${t('diary.search.remove', { defaultValue: 'Retirer' })} ${n}`} onClick={() => onChange(chosen.filter((x) => x !== n))}>×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Archives;
