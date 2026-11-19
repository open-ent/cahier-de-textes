import { Alert, Button, Checkbox, Loading, Pagination, Table } from '@open-ent/react';
import { IconDownload } from '@open-ent/react/icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import { archivedOn, archivesQuery, effectiveTeachers, exportUrl, teacherLabel } from '../archives';
import { Chips, Suggestions } from '../components/Chips';
import { Empty } from '../components/Empty';
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
    return <Alert type="info">{t('diary.no.structure', { defaultValue: 'Aucun établissement associé à votre compte.' })}</Alert>;
  }
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div>
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

      {/* La barre d'actions n'apparaît qu'une fois quelque chose coché, et dit sur quoi elle porte. */}
      {selected.size > 0 && (
        <div className="d-flex align-items-center gap-16 mb-16" role="toolbar" aria-label={t('diary.notebooks.actions', { defaultValue: 'Actions sur la sélection' })} data-toolbar>
          <span className="text-gray-700">
            {t('diary.archives.selected', { defaultValue: '[[count]] cahier(s) sélectionné(s)', count: selected.size })}
          </span>
          {/* Un vrai lien : le téléchargement reste ouvrable dans un onglet, et le clic droit marche. */}
          <a className="btn btn-filled btn-primary btn-md d-inline-flex align-items-center gap-8" href={exportUrl(structureId, [...selected])} data-download>
            <IconDownload />
            {t('notebook.archive.download.pdf', { defaultValue: 'Télécharger PDF' })}
          </a>
        </div>
      )}

      {(years.isLoading || list.isLoading) && <Loading isLoading />}
      {!years.isLoading && !list.isLoading && ((years.data ?? []).length === 0 || rows.length === 0) && (
        <Empty
          illustration="folder"
          title={t('notebook.archive.notAvailable', { defaultValue: "Il n'y a pas de cahier de textes archivé disponible pour le moment" })}
          text={(years.data ?? []).length > 0 ? t('diary.archives.empty.hint', { defaultValue: 'Changez d’année scolaire ou retirez un filtre.' }) : undefined}
        />
      )}
      {rows.length > 0 && (
        <div data-archives>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: '4rem' }}>
                  <Checkbox
                    aria-label={t('diary.progression.select.all', { defaultValue: 'Tout sélectionner' })}
                    checked={allChecked}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                  />
                </Table.Th>
                <Table.Th>{t('notebook.archive.header.audience', { defaultValue: 'Classe' })}</Table.Th>
                <Table.Th>{t('notebook.archive.header.teacher', { defaultValue: 'Enseignant' })}</Table.Th>
                <Table.Th>{t('notebook.archive.header.subject', { defaultValue: 'Matière' })}</Table.Th>
                <Table.Th>{t('notebook.archive.header.archived.period', { defaultValue: 'Période archivée' })}</Table.Th>
                <Table.Th>{t('notebook.archive.header.archived.on', { defaultValue: 'Archivé le' })}</Table.Th>
                <Table.Th className="text-end">{t('notebook.archive.header.pdf', { defaultValue: 'PDF' })}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.id} data-archive={r.id}>
                  <Table.Td>
                    <Checkbox
                      aria-label={`${t('diary.progression.select', { defaultValue: 'Sélectionner' })} ${r.audience_label} ${r.subject_label}`}
                      checked={selected.has(r.id)}
                      onChange={(e) => setSelected((s) => { const c = new Set(s); if (e.target.checked) c.add(r.id); else c.delete(r.id); return c; })}
                    />
                  </Table.Td>
                  <Table.Td>{r.audience_label}</Table.Td>
                  <Table.Td>{teacherLabel(r)}</Table.Td>
                  <Table.Td>{r.subject_label ?? ''}</Table.Td>
                  <Table.Td className="text-nowrap">{r.archive_school_year}</Table.Td>
                  <Table.Td className="text-nowrap">{archivedOn(r.created_at)}</Table.Td>
                  <Table.Td className="text-end">
                    <a href={exportUrl(structureId, [r.id])} aria-label={`${t('notebook.archive.download.pdf', { defaultValue: 'Télécharger PDF' })} ${r.audience_label} ${r.subject_label}`}>PDF</a>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}
      {pageCount > 1 && (
        <nav className="d-flex justify-content-center mt-16" aria-label={t('diary.notebooks.pagination', { defaultValue: 'Pagination' })} data-pagination>
          <Pagination
            current={page + 1}
            total={pageCount}
            pageSize={1}
            onChange={(next) => { setPage(next - 1); setSelected(new Set()); }}
          />
        </nav>
      )}
    </div>
  );
}

/** Recherche de noms (au moins 2 caractères) avec choix multiple, sous forme de pastilles. */
function NameSearch({ id, label, chosen, fetcher, onChange, attr, suggest }: { id: string; label: string; chosen: string[]; fetcher: (q: string) => Promise<string[]>; onChange: (v: string[]) => void; attr: string; suggest: string }) {
  const [q, setQ] = useState('');
  const found = useQuery({ queryKey: ['diary', 'archive-search', id, q], queryFn: () => fetcher(q), enabled: q.trim().length >= 2 });
  const options = (found.data ?? []).filter((n) => !chosen.includes(n));
  return (
    <div className="diary-search-field">
      <label htmlFor={id} className="form-label">{label}</label>
      <input id={id} className="form-control" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 && (
        <Suggestions
          attrs={{ [suggest]: true }}
          items={options.map((n) => ({ id: n, label: n }))}
          onPick={(n) => { onChange([...chosen, n]); setQ(''); }}
        />
      )}
      <Chips
        attrs={{ [attr]: true }}
        items={chosen.map((n) => ({ id: n, label: n }))}
        onRemove={(n) => onChange(chosen.filter((x) => x !== n))}
      />
    </div>
  );
}

export default Archives;
