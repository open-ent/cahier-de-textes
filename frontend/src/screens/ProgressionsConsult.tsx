import { Alert, Heading, Loading, Table } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import { Chips, Suggestions } from '../components/Chips';
import { Empty } from '../components/Empty';
import { useDiaryContext } from '../hooks/useDiaryContext';
import { buildTree, flatten } from '../progressions';
import type { SearchTeacher } from '../searchScope';
import { stripHtml } from '../utils';

/**
 * Consultation des progressions d'un enseignant par la direction, comme l'AngularJS
 * (progression/consult-progression.html) : choix d'un enseignant de l'établissement, puis ses
 * dossiers et ses séances modèles en lecture seule (aucune écriture possible). Ex. « Cycle 3 »
 * avec « Fractions » (6e, Maths, 2 devoirs).
 */
export function ProgressionsConsult() {
  const { t } = useTranslation(['diary', 'common']);
  const ctx = useDiaryContext();
  const structureId = ctx.structure?.id ?? '';
  const [q, setQ] = useState('');
  const [teacher, setTeacher] = useState<SearchTeacher | null>(null);

  const suggestions = useQuery({ queryKey: ['diary', 'consult', 'teachers', structureId, q], queryFn: () => api.searchTeachers(structureId, q), enabled: !!structureId && !teacher && q.trim().length >= 2 });
  const folders = useQuery({ queryKey: ['diary', 'consult', 'folders', teacher?.id], queryFn: () => api.getProgressionFolders(teacher!.id), enabled: !!teacher, retry: false });
  const rootTitle = t('diary.consult.progression.folder.none', { defaultValue: 'Séances sans dossier' });
  const shown = useMemo(() => flatten(buildTree(folders.data ?? [], rootTitle)).filter((f) => f.sessions.length > 0 || f.id !== null), [folders.data, rootTitle]);

  return (
    <div>
      <div className="diary-search-field mb-16">
        <label htmlFor="pc-teacher" className="form-label">{t('diary.consult.progression.select.teacher', { defaultValue: 'Enseignant' })}</label>
        {teacher ? (
          <div data-chosen-teacher>
            <Chips items={[{ id: teacher.id, label: teacher.displayName }]} onRemove={() => { setTeacher(null); setQ(''); }} />
          </div>
        ) : (
          <>
            <input id="pc-teacher" className="form-control" placeholder={t('diary.consult.progression.search.teacher', { defaultValue: "Saisir le nom de l'enseignant dont consulter les progressions" })} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            {q.trim().length >= 2 && (
              <Suggestions
                attrs={{ 'data-suggestions': 'teachers' }}
                items={(suggestions.data ?? []).map((x) => ({ id: x.id, label: x.displayName }))}
                onPick={(id) => { const f = (suggestions.data ?? []).find((x) => x.id === id); if (f) setTeacher(f); setQ(''); }}
              />
            )}
          </>
        )}
      </div>

      {!teacher && (
        <Empty
          illustration="search"
          title={t('diary.consult.progression.hint', { defaultValue: 'Sélectionnez un enseignant pour consulter ses progressions.' })}
        />
      )}
      {teacher && folders.isLoading && <Loading isLoading />}
      {teacher && folders.isError && (
        <div className="mb-16">
          <Alert type="warning">{t('diary.consult.progression.error', { defaultValue: 'Impossible de charger les progressions de cet enseignant (droits insuffisants ou service indisponible).' })}</Alert>
        </div>
      )}
      {teacher && folders.isSuccess && shown.length === 0 && (
        <Empty
          illustration="folder"
          title={t('diary.consult.progression.empty', { defaultValue: 'Cet enseignant n’a aucune progression.' })}
        />
      )}
      <div data-consult-folders>
        {shown.map((f) => (
          <section key={f.id ?? 'root'} className="card bg-white p-16 mb-16" data-folder={f.id ?? 'root'}>
            <Heading level="h2" headingStyle="h4" className="mb-12">{f.id === null ? rootTitle : f.title}</Heading>
            {f.sessions.length === 0 ? (
              <p className="text-gray-700 mb-0">{t('diary.consult.progression.folder.empty', { defaultValue: 'Aucune séance dans ce dossier.' })}</p>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('diary.progression.label', { defaultValue: 'Titre' })}</Table.Th>
                    <Table.Th>{t('diary.progression.level', { defaultValue: 'Niveau' })}</Table.Th>
                    <Table.Th>{t('diary.subject', { defaultValue: 'Matière' })}</Table.Th>
                    <Table.Th>{t('diary.progression.homeworks', { defaultValue: 'Devoirs' })}</Table.Th>
                    <Table.Th>{t('diary.progression.description', { defaultValue: 'Description' })}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {f.sessions.map((s) => (
                    <Table.Tr key={s.id}>
                      <Table.Td>{s.title}</Table.Td>
                      <Table.Td>{s.className || '—'}</Table.Td>
                      <Table.Td>{s.subjectLabel || '—'}</Table.Td>
                      <Table.Td>{s.homeworks.length}</Table.Td>
                      <Table.Td>{stripHtml(s.description)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

export default ProgressionsConsult;
