import { useEdificeClient } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import { formatDate, stripHtml } from '../utils';

/**
 * Progressions (séquences pédagogiques) — parité IHM AngularJS (CCTP 51C).
 * Liste des progressions de l'enseignant (GET /diary/progressions/:ownerId) et
 * création d'une progression (POST /diary/progression/create). Matière/classe en clair.
 */
export function Progressions() {
  const { t } = useTranslation(['diary', 'common']);
  const { user, init } = useEdificeClient();
  const qc = useQueryClient();
  const structureId = user?.structures?.[0] ?? '';
  const ownerId = user?.userId ?? '';

  const progressionsQuery = useQuery({ queryKey: ['diary', 'progressions', ownerId], queryFn: () => api.getProgressions(ownerId), enabled: !!ownerId });
  const subjectsQuery = useQuery({ queryKey: ['diary', 'subjects', structureId], queryFn: () => api.getSubjects(structureId), enabled: !!structureId });
  const classesQuery = useQuery({ queryKey: ['diary', 'classes', structureId], queryFn: () => api.getClasses(structureId), enabled: !!structureId });

  const progressions = progressionsQuery.data ?? [];

  // Formulaire de création
  const [title, setTitle] = useState('');
  const [subjectLabel, setSubjectLabel] = useState('');
  const [className, setClassName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['diary', 'progressions', ownerId] });
  const createMut = useMutation({
    mutationFn: () =>
      api.createProgression({
        title: title.trim(),
        description: description.trim() || title.trim(),
        owner_id: ownerId,
        subjectLabel: subjectLabel || undefined,
        class: className || undefined,
        progression_homework: [],
      }),
    onSuccess: () => { setTitle(''); setDescription(''); setFormError(''); invalidate(); },
    onError: () => setFormError(t('diary.progression.error', { defaultValue: 'La création de la progression a échoué.' })),
  });

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError(t('diary.progression.required', { defaultValue: 'Le titre est obligatoire.' }));
      return;
    }
    setFormError('');
    createMut.mutate();
  };

  // Regroupement par dossier
  const byFolder = useMemo(() => {
    const map = new Map<string, typeof progressions>();
    for (const p of progressions) {
      const key = p.folder || '';
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  }, [progressions]);

  if (init && !structureId) {
    return (
      <div>
        <h1>{t('diary.title', { defaultValue: 'Cahier de textes' })}</h1>
        <div className="alert alert-info" role="alert">{t('diary.no.structure', { defaultValue: 'Aucun établissement associé à votre compte.' })}</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-16">{t('diary.progressions.title', { defaultValue: 'Progressions' })}</h1>

      {/* Création d'une progression */}
      <section className="card p-16 mb-24">
        <h2 style={{ fontSize: 18 }} className="mb-12">{t('diary.progression.new', { defaultValue: 'Nouvelle progression' })}</h2>
        <form onSubmit={onCreate} className="d-flex flex-column gap-12">
          <div className="d-flex gap-12 flex-wrap">
            <div className="flex-grow-1" style={{ minWidth: 240 }}>
              <label htmlFor="p-title" className="form-label">{t('diary.progression.label', { defaultValue: 'Titre' })}</label>
              <input id="p-title" className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div style={{ minWidth: 220 }}>
              <label htmlFor="p-subject" className="form-label">{t('diary.subject', { defaultValue: 'Matière' })}</label>
              <select id="p-subject" className="form-select" value={subjectLabel} onChange={(e) => setSubjectLabel(e.target.value)}>
                <option value="">{t('diary.choose', { defaultValue: 'Choisir…' })}</option>
                {(subjectsQuery.data ?? []).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 180 }}>
              <label htmlFor="p-class" className="form-label">{t('diary.class', { defaultValue: 'Classe' })}</label>
              <select id="p-class" className="form-select" value={className} onChange={(e) => setClassName(e.target.value)}>
                <option value="">{t('diary.choose', { defaultValue: 'Choisir…' })}</option>
                {(classesQuery.data ?? []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="d-flex gap-12 flex-wrap align-items-end">
            <div className="flex-grow-1" style={{ minWidth: 260 }}>
              <label htmlFor="p-desc" className="form-label">{t('diary.description', { defaultValue: 'Description' })}</label>
              <input id="p-desc" className="form-control" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={createMut.isPending}>{t('diary.progression.add', { defaultValue: 'Créer' })}</button>
          </div>
          {formError && <div className="alert alert-warning mb-0" role="alert">{formError}</div>}
        </form>
      </section>

      {/* Liste par dossier */}
      <h2 style={{ fontSize: 18 }} className="mb-12">
        {t('diary.progressions.list', { defaultValue: 'Mes progressions' })} <span className="text-muted" style={{ fontSize: 14 }}>({progressions.length})</span>
      </h2>
      {progressionsQuery.isLoading && <p>{t('diary.loading', { defaultValue: 'Chargement…' })}</p>}
      {!progressionsQuery.isLoading && progressions.length === 0 && <p className="text-muted">{t('diary.progressions.empty', { defaultValue: 'Aucune progression.' })}</p>}
      {byFolder.map(([folder, items]) => (
        <section key={folder || '_root'} className="mb-16">
          {folder && <h3 style={{ fontSize: 15 }} className="text-muted mb-8">{folder}</h3>}
          <div style={{ overflowX: 'auto' }}>
            <table className="table table-bordered mb-0">
              <thead>
                <tr>
                  <th>{t('diary.progression.label', { defaultValue: 'Titre' })}</th>
                  <th>{t('diary.subject', { defaultValue: 'Matière' })}</th>
                  <th>{t('diary.class', { defaultValue: 'Classe' })}</th>
                  <th>{t('diary.description', { defaultValue: 'Description' })}</th>
                  <th>{t('diary.modified', { defaultValue: 'Modifiée le' })}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td>{p.subjectLabel || '—'}</td>
                    <td>{p.className || '—'}</td>
                    <td>{stripHtml(p.description)}</td>
                    <td>{formatDate(p.modified)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

export default Progressions;
