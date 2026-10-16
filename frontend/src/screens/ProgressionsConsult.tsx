import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
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
      <h1 className="mb-16">{t('diary.progressions.title', { defaultValue: 'Progressions' })}</h1>
      <div style={{ maxWidth: 460, position: 'relative' }} className="mb-16">
        <label htmlFor="pc-teacher" className="form-label" style={{ fontWeight: 700 }}>{t('diary.consult.progression.select.teacher', { defaultValue: 'Enseignant' })}</label>
        {teacher ? (
          <div className="d-flex align-items-center gap-8" data-chosen-teacher>
            <span className="badge bg-secondary" style={{ color: "#fff" }}>{teacher.displayName}</span>
            <button type="button" className="btn btn-link p-0" aria-label={t('diary.search.remove', { defaultValue: 'Retirer' })} onClick={() => { setTeacher(null); setQ(''); }}>×</button>
          </div>
        ) : (
          <>
            <input id="pc-teacher" className="form-control" placeholder={t('diary.consult.progression.search.teacher', { defaultValue: "Saisir le nom de l'enseignant dont consulter les progressions" })} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            {q.trim().length >= 2 && (suggestions.data ?? []).length > 0 && (
              <ul className="list-unstyled border rounded bg-white p-4 m-0" style={{ position: 'absolute', zIndex: 20, minWidth: 240 }} data-suggestions="teachers">
                {(suggestions.data ?? []).map((x) => (
                  <li key={x.id}><button type="button" className="btn btn-link p-0 text-start" onClick={() => { setTeacher(x); setQ(''); }}>{x.displayName}</button></li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {!teacher && <div className="alert alert-info" role="status">{t('diary.consult.progression.hint', { defaultValue: 'Sélectionnez un enseignant pour consulter ses progressions.' })}</div>}
      {teacher && folders.isLoading && <p>{t('diary.consult.progression.loading', { defaultValue: 'Chargement des progressions…' })}</p>}
      {teacher && folders.isError && <div className="alert alert-warning" role="alert">{t('diary.consult.progression.error', { defaultValue: 'Impossible de charger les progressions de cet enseignant (droits insuffisants ou service indisponible).' })}</div>}
      {teacher && folders.isSuccess && shown.length === 0 && <div className="alert alert-info" role="status">{t('diary.consult.progression.empty', { defaultValue: 'Cet enseignant n’a aucune progression.' })}</div>}
      <div data-consult-folders>
        {shown.map((f) => (
          <section key={f.id ?? 'root'} className="card p-16 mb-12" data-folder={f.id ?? 'root'}>
            <h2 style={{ fontSize: 17, fontWeight: 700 }} className="mb-8">{f.id === null ? rootTitle : f.title}</h2>
            {f.sessions.length === 0 ? (
              <p className="text-muted mb-0">{t('diary.consult.progression.folder.empty', { defaultValue: 'Aucune séance dans ce dossier.' })}</p>
            ) : (
              <table className="table table-bordered mb-0">
                <thead>
                  <tr>
                    <th>{t('diary.progression.label', { defaultValue: 'Titre' })}</th>
                    <th>{t('diary.progression.level', { defaultValue: 'Niveau' })}</th>
                    <th>{t('diary.subject', { defaultValue: 'Matière' })}</th>
                    <th>{t('diary.progression.homeworks', { defaultValue: 'Devoirs' })}</th>
                    <th>{t('diary.progression.description', { defaultValue: 'Description' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {f.sessions.map((s) => (
                    <tr key={s.id}>
                      <td>{s.title}</td>
                      <td>{s.className || '—'}</td>
                      <td>{s.subjectLabel || '—'}</td>
                      <td>{s.homeworks.length}</td>
                      <td>{stripHtml(s.description)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

export default ProgressionsConsult;
