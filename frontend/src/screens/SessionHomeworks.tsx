import { Editor, type EditorInstance } from '@open-ent/react/editor';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, HomeworkType, Session } from '../api';
import { dayWorkload, emptyHomework, HomeworkDraft, HomeworkError, validateHomework, workloadColor } from '../homeworkForm';
import { stripHtml } from '../utils';

const editorContent = (html: string) => (html && html.trim() ? html : '<p></p>');
const COLOR = { green: '#00ab6f', yellow: '#f5b700', red: '#e13a3a' } as const;

interface Props {
  drafts: HomeworkDraft[];
  onChange: (next: HomeworkDraft[]) => void;
  types: HomeworkType[];
  structureId: string;
  audienceId: string;
  /** Séances futures de la classe proposées comme échéance. */
  futureSessions: Session[];
  canPublish: boolean;
  readOnly: boolean;
}

/**
 * Devoirs donnés pendant la séance, comme l'AngularJS (session-form.html) : tableau, formulaire
 * d'ajout et de modification, échéance par séance future ou par date, durée estimée, charge de
 * travail du jour, publication. Les devoirs sont enregistrés avec la séance. Ex. « Exercices 1 à 5 »,
 * 30 min, pour la séance du jeudi suivant.
 */
export function SessionHomeworks({ drafts, onChange, types, structureId, audienceId, futureSessions, canPublish, readOnly }: Props) {
  const { t } = useTranslation(['diary', 'common']);
  const [editing, setEditing] = useState<HomeworkDraft | null>(null);
  const [errors, setErrors] = useState<HomeworkError[]>([]);
  const visible = drafts.filter((d) => !d.deleted);
  const typeLabel = (id: string) => types.find((x) => String(x.id) === id)?.label ?? '';
  const sessionLabel = (id: string) => {
    const s = futureSessions.find((x) => String(x.id) === id);
    return s ? `${new Date(`${s.date.slice(0, 10)}T12:00:00`).toLocaleDateString()} ${s.start_time?.slice(0, 5) ?? ''}` : '';
  };
  const dueDay = editing ? (editing.dueMode === 'session' ? futureSessions.find((s) => String(s.id) === editing.dueSessionId)?.date.slice(0, 10) ?? '' : editing.dueDate) : '';
  const workload = useQuery({
    queryKey: ['diary', 'workload', structureId, audienceId, dueDay, !!editing?.published],
    queryFn: () => api.getWorkload(structureId, audienceId, dueDay, !!editing?.published),
    enabled: !!editing && !!dueDay && !!audienceId,
  });
  const load = workload.data ? dayWorkload(workload.data, dueDay) : null;
  const errorText: Record<HomeworkError, string> = {
    type: t('diary.homework.error.type', { defaultValue: 'Choisissez un type de devoir.' }),
    due: t('diary.homework.error.due', { defaultValue: "Choisissez l'échéance (séance ou date)." }),
    time: t('diary.homework.error.time', { defaultValue: 'La durée estimée doit être positive ou nulle.' }),
    description: t('diary.homework.error.description', { defaultValue: 'Renseignez la description du devoir.' }),
  };

  const commit = () => {
    if (!editing) return;
    const errs = validateHomework(editing);
    setErrors(errs);
    if (errs.length) return;
    onChange(drafts.some((d) => d.key === editing.key) ? drafts.map((d) => (d.key === editing.key ? editing : d)) : [...drafts, editing]);
    setEditing(null);
  };
  const remove = (d: HomeworkDraft) => onChange(d.id ? drafts.map((x) => (x.key === d.key ? { ...x, deleted: true } : x)) : drafts.filter((x) => x.key !== d.key));

  return (
    <section className="mb-12" aria-labelledby="ss-homeworks" data-homeworks>
      <div className="d-flex align-items-center justify-content-between gap-8 mb-8">
        <div id="ss-homeworks" className="form-label m-0" style={{ fontSize: 15, fontWeight: 700 }}>
          {t('diary.session.homeworks', { defaultValue: 'Devoirs donnés pendant la séance' })}
        </div>
        {!readOnly && !editing && (
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => { setErrors([]); setEditing(emptyHomework()); }}>
            {t('diary.homework.create', { defaultValue: 'Créer un devoir' })}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-muted mb-8">{t('diary.session.homeworks.none', { defaultValue: 'Aucun devoir donné pendant cette séance.' })}</p>
      ) : (
        <table className="table mb-8" data-homeworks-table>
          <thead>
            <tr>
              <th>{t('diary.homework.type', { defaultValue: 'Type' })}</th>
              <th>{t('diary.homework.due', { defaultValue: 'À rendre pour' })}</th>
              <th>{t('diary.homework.time', { defaultValue: 'Durée (min)' })}</th>
              <th>{t('diary.description', { defaultValue: 'Contenu' })}</th>
              <th>{t('diary.status', { defaultValue: 'Statut' })}</th>
              {!readOnly && <th />}
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => (
              <tr key={d.key} data-homework-key={d.key}>
                <td>{typeLabel(d.typeId)}</td>
                <td>{d.dueMode === 'session' ? sessionLabel(d.dueSessionId) || t('diary.homework.due.session', { defaultValue: 'Séance' }) : d.dueDate ? new Date(`${d.dueDate}T12:00:00`).toLocaleDateString() : ''}</td>
                <td>{d.estimatedTime}</td>
                <td>{stripHtml(d.description)}</td>
                <td>{d.published ? t('diary.published', { defaultValue: 'Publiée' }) : t('diary.unpublished', { defaultValue: 'Non publiée' })}</td>
                {!readOnly && (
                  <td className="text-end">
                    <button type="button" className="btn btn-link p-0 me-8" onClick={() => { setErrors([]); setEditing(d); }}>{t('diary.calendar.edit', { defaultValue: 'Modifier' })}</button>
                    <button type="button" className="btn btn-link p-0 text-danger" onClick={() => remove(d)}>{t('diary.delete', { defaultValue: 'Supprimer' })}</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <div className="card p-12" data-homework-form>
          <div className="d-flex gap-16 flex-wrap mb-12">
            <div style={{ minWidth: 200 }}>
              <label htmlFor="hw-type" className="form-label" style={{ fontWeight: 700 }}>{t('diary.homework.type', { defaultValue: 'Type' })} *</label>
              <select id="hw-type" className="form-select" value={editing.typeId} onChange={(e) => setEditing({ ...editing, typeId: e.target.value })}>
                <option value="">—</option>
                {types.map((ty) => <option key={ty.id} value={ty.id}>{ty.label}</option>)}
              </select>
            </div>
            <fieldset>
              <legend className="form-label" style={{ fontSize: 14, fontWeight: 700 }}>{t('diary.homework.due', { defaultValue: 'À rendre pour' })} *</legend>
              <div className="d-flex gap-12">
                <label className="d-flex gap-4 align-items-center m-0">
                  <input type="radio" name="hw-due-mode" checked={editing.dueMode === 'session'} onChange={() => setEditing({ ...editing, dueMode: 'session' })} />
                  {t('diary.homework.due.session', { defaultValue: 'Une séance' })}
                </label>
                <label className="d-flex gap-4 align-items-center m-0">
                  <input type="radio" name="hw-due-mode" checked={editing.dueMode === 'date'} onChange={() => setEditing({ ...editing, dueMode: 'date' })} />
                  {t('diary.homework.due.date', { defaultValue: 'Une date' })}
                </label>
              </div>
            </fieldset>
            {editing.dueMode === 'session' ? (
              <div style={{ minWidth: 220 }}>
                <label htmlFor="hw-session" className="form-label" style={{ fontWeight: 700 }}>{t('diary.homework.due.session', { defaultValue: 'Séance' })}</label>
                <select id="hw-session" className="form-select" value={editing.dueSessionId} onChange={(e) => setEditing({ ...editing, dueSessionId: e.target.value })}>
                  <option value="">—</option>
                  {futureSessions.map((s) => <option key={s.id} value={s.id}>{sessionLabel(String(s.id))} — {s.title}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="hw-date" className="form-label" style={{ fontWeight: 700 }}>{t('diary.due', { defaultValue: 'À rendre le' })}</label>
                <input id="hw-date" type="date" className="form-control" value={editing.dueDate} onChange={(e) => setEditing({ ...editing, dueDate: e.target.value })} />
              </div>
            )}
            <div style={{ maxWidth: 130 }}>
              <label htmlFor="hw-time" className="form-label" style={{ fontWeight: 700 }}>{t('diary.homework.time', { defaultValue: 'Durée (min)' })}</label>
              <input id="hw-time" type="number" min={0} className="form-control" value={editing.estimatedTime} onChange={(e) => setEditing({ ...editing, estimatedTime: Math.max(0, Number(e.target.value) || 0) })} />
            </div>
            {canPublish && (
              <label className="d-flex align-items-center gap-4 m-0 align-self-end">
                <input type="checkbox" checked={editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })} />
                {t('diary.publish', { defaultValue: 'Publier' })}
              </label>
            )}
          </div>
          {dueDay && load && (
            <p className="mb-12" data-workload role="status">
              <span aria-hidden style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: COLOR[workloadColor(load.count)], marginRight: 6 }} />
              {t('diary.homework.workload', { defaultValue: 'Charge de travail ce jour-là : [[count]] devoir(s), [[total]] min', count: load.count, total: load.total })}
            </p>
          )}
          <div className="mb-12">
            <div className="form-label" style={{ fontSize: 14, fontWeight: 700 }}>{t('diary.description', { defaultValue: 'Contenu' })} *</div>
            <Editor
              key={editing.key}
              content={editorContent(editing.description)}
              mode="edit"
              focus={false}
              variant="outline"
              visibility="protected"
              onContentChange={({ editor }: { editor: EditorInstance }) => setEditing((h) => h && { ...h, description: editor.isEmpty ? '' : editor.getHTML() })}
            />
          </div>
          {errors.length > 0 && (
            <div className="alert alert-warning" role="alert">
              <ul className="m-0">{errors.map((e) => <li key={e}>{errorText[e]}</li>)}</ul>
            </div>
          )}
          <div className="d-flex gap-8">
            <button type="button" className="btn btn-primary" onClick={commit}>{t('diary.homework.validate', { defaultValue: 'Valider' })}</button>
            <button type="button" className="btn btn-secondary" onClick={() => { setEditing(null); setErrors([]); }}>{t('diary.cancel', { defaultValue: 'Annuler' })}</button>
          </div>
        </div>
      )}
    </section>
  );
}

export default SessionHomeworks;
