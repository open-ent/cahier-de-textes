import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import type { SearchClass, SearchTeacher } from '../searchScope';

interface Props {
  structureId: string;
  teacher: SearchTeacher | null;
  onTeacher: (t: SearchTeacher | null) => void;
  classes: SearchClass[];
  onClasses: (c: SearchClass[]) => void;
}

/** Recherche à la volée : au moins 2 caractères, liste de propositions sous le champ. */
function useSuggestions<T>(key: string, q: string, structureId: string, fetcher: (s: string, q: string) => Promise<T[]>) {
  return useQuery({ queryKey: ['diary', 'search', key, structureId, q], queryFn: () => fetcher(structureId, q), enabled: !!structureId && q.trim().length >= 2 });
}

/**
 * Recherche d'un enseignant et de classes, comme l'AngularJS (main.html, droit « recherche ») :
 * l'enseignant choisi (un seul) et les classes ou groupes choisis (plusieurs) restreignent ce que
 * l'on consulte. Ex. « bat » → BATTISTI001 Anic ; « 40 » → 401, 402.
 */
export function SearchBar({ structureId, teacher, onTeacher, classes, onClasses }: Props) {
  const { t } = useTranslation(['diary', 'common']);
  const [teacherQ, setTeacherQ] = useState('');
  const [classQ, setClassQ] = useState('');
  const teachers = useSuggestions('teachers', teacherQ, structureId, api.searchTeachers);
  const groups = useSuggestions('classes', classQ, structureId, api.searchClasses);
  const chosen = new Set(classes.map((c) => c.id));

  return (
    <div className="d-flex gap-16 flex-wrap mb-12" role="search" aria-label={t('diary.search.label', { defaultValue: 'Recherche' })} data-search>
      <div style={{ minWidth: 240, position: 'relative' }}>
        <label htmlFor="sb-teacher" className="form-label" style={{ fontWeight: 700 }}>{t('diary.search.teacher', { defaultValue: 'Enseignant' })}</label>
        {teacher ? (
          <div className="d-flex align-items-center gap-8" data-chosen-teacher>
            <span className="badge bg-secondary" style={{ color: "#fff" }}>{teacher.displayName}</span>
            <button type="button" className="btn btn-link p-0" aria-label={t('diary.search.remove', { defaultValue: 'Retirer' })} onClick={() => onTeacher(null)}>×</button>
          </div>
        ) : (
          <>
            <input id="sb-teacher" className="form-control" placeholder={t('diary.search.teacher.placeholder', { defaultValue: 'Rechercher un enseignant…' })} value={teacherQ} onChange={(e) => setTeacherQ(e.target.value)} autoComplete="off" />
            {teacherQ.trim().length >= 2 && (teachers.data ?? []).length > 0 && (
              <ul className="list-unstyled border rounded bg-white p-4 m-0" style={{ position: 'absolute', zIndex: 20, minWidth: 240 }} data-suggestions="teachers">
                {(teachers.data ?? []).map((x) => (
                  <li key={x.id}>
                    <button type="button" className="btn btn-link p-0 text-start" onClick={() => { onTeacher(x); setTeacherQ(''); }}>{x.displayName}</button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <div style={{ minWidth: 240, position: 'relative' }}>
        <label htmlFor="sb-class" className="form-label" style={{ fontWeight: 700 }}>{t('diary.search.class', { defaultValue: 'Classe ou groupe' })}</label>
        <input id="sb-class" className="form-control" placeholder={t('diary.search.class.placeholder', { defaultValue: 'Rechercher une classe…' })} value={classQ} onChange={(e) => setClassQ(e.target.value)} autoComplete="off" />
        {classQ.trim().length >= 2 && (groups.data ?? []).filter((g) => !chosen.has(g.id)).length > 0 && (
          <ul className="list-unstyled border rounded bg-white p-4 m-0" style={{ position: 'absolute', zIndex: 20, minWidth: 240 }} data-suggestions="classes">
            {(groups.data ?? []).filter((g) => !chosen.has(g.id)).map((g) => (
              <li key={g.id}>
                <button type="button" className="btn btn-link p-0 text-start" onClick={() => { onClasses([...classes, g]); setClassQ(''); }}>{g.name}</button>
              </li>
            ))}
          </ul>
        )}
        {classes.length > 0 && (
          <ul className="list-inline mt-4 mb-0" data-chosen-classes>
            {classes.map((c) => (
              <li key={c.id} className="d-inline-flex align-items-center gap-4 me-8 badge bg-secondary" style={{ color: '#fff' }}>
                {c.name}
                <button type="button" className="btn btn-link p-0 text-white" style={{ background: 'none', color: '#fff' }} aria-label={`${t('diary.search.remove', { defaultValue: 'Retirer' })} ${c.name}`} onClick={() => onClasses(classes.filter((x) => x.id !== c.id))}>×</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default SearchBar;
