import { Editor, type EditorInstance } from '@open-ent/react/editor';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { api } from '../api';
import { useDiaryContext } from '../hooks/useDiaryContext';
import { buildTree, draftFromSession, emptyDraft, flatten as flat, parentChoices, ProgressionDraft, ProgressionHomework, toBody, toSession, validateDraft } from '../progressions';

/** Une chaîne VIDE fait planter l'éditeur du socle (erreur React #321) : paragraphe vide à la place. */
const editorContent = (html: string) => (html && html.trim() ? html : '<p></p>');

/**
 * Séance modèle d'une progression, comme l'AngularJS (progression-session-form.html) : titre,
 * matière et niveau en texte libre, dossier, description riche et devoirs (durée estimée et
 * description). Création (`#/progression/nouvelle?dossier=3`) ou modification (`#/progression/12`).
 * Les devoirs retirés sont supprimés à l'enregistrement. Ex. « Fractions », 6e, Maths, un devoir de 15 min.
 */
export function ProgressionForm() {
  const { id } = useParams();
  const progressionId = id && id !== 'nouvelle' ? Number(id) : null;
  const [params] = useSearchParams();
  const folderParam = params.get('dossier');
  const { t } = useTranslation(['diary', 'common']);
  const ctx = useDiaryContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ownerId = ctx.userId;

  const [draft, setDraft] = useState<ProgressionDraft>(emptyDraft(folderParam ? Number(folderParam) : null));
  const [removed, setRemoved] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(!progressionId);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const foldersQuery = useQuery({ queryKey: ['diary', 'progression-folders', ownerId], queryFn: () => api.getProgressionFolders(ownerId), enabled: !!ownerId });
  const root = useMemo(() => buildTree(foldersQuery.data ?? [], t('diary.progressions.root', { defaultValue: 'Mes dossiers' })), [foldersQuery.data, t]);
  const choices = parentChoices(root);

  const existing = useQuery({ queryKey: ['diary', 'progression', progressionId], queryFn: () => api.getProgression(progressionId!), enabled: !!progressionId, staleTime: 0, gcTime: 0 });
  useEffect(() => {
    // Le dossier n'est pas dans la réponse de la séance : on le retrouve dans l'arbre, qu'on attend
    // aussi, sinon l'enregistrement renverrait la séance à la racine.
    if (!progressionId || !existing.data || !foldersQuery.data || loaded) return;
    const owner = flat(root).find((f) => f.sessions.some((x) => x.id === progressionId));
    setDraft(draftFromSession(toSession({ ...existing.data, progression_folder_id: owner?.id ?? null })));
    setLoaded(true);
  }, [progressionId, existing.data, foldersQuery.data, root, loaded]);

  const set = <K extends keyof ProgressionDraft>(k: K, v: ProgressionDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setHomework = (i: number, patch: Partial<ProgressionHomework>) => set('homeworks', draft.homeworks.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const removeHomework = (i: number) => {
    const h = draft.homeworks[i];
    if (h.id) setRemoved((r) => [...r, h.id as number]);
    set('homeworks', draft.homeworks.filter((_, j) => j !== i));
  };

  const validation = validateDraft(draft);
  const save = useMutation({
    mutationFn: async () => {
      await api.saveProgression(progressionId, toBody(draft, ownerId));
      for (const hid of removed) await api.deleteProgressionHomework(hid);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['diary', 'progression-folders', ownerId] });
      navigate('/progressions');
    },
    onError: () => setError(t('diary.progression.error', { defaultValue: "L'enregistrement de la progression a échoué." })),
  });

  const submit = () => {
    setSubmitted(true);
    setError('');
    if (validation.ok) save.mutate();
  };
  const missing = (k: 'title' | 'description') => submitted && validation.missing.includes(k);

  if (!loaded) return <p>{t('diary.loading', { defaultValue: 'Chargement…' })}</p>;
  const readOnly = !ctx.has('manageSession');

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-12 mb-16">
        <h1 className="m-0">{progressionId ? t('diary.progression.edit', { defaultValue: 'Modifier la progression' }) : t('diary.progression.new', { defaultValue: 'Nouvelle progression' })}</h1>
        <div className="d-flex gap-8">
          <Link className="btn btn-secondary" to="/progressions">{t('diary.cancel', { defaultValue: 'Annuler' })}</Link>
          {!readOnly && <button type="button" className="btn btn-primary" disabled={save.isPending} onClick={submit}>{t('diary.save', { defaultValue: 'Enregistrer' })}</button>}
        </div>
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {submitted && !validation.ok && (
        <div className="alert alert-warning" role="alert" data-errors>
          {validation.missing.includes('title') && <div>{t('diary.progression.required', { defaultValue: 'Le titre est obligatoire.' })}</div>}
          {validation.missing.includes('description') && <div>{t('diary.progression.description.required', { defaultValue: 'La description est obligatoire.' })}</div>}
          {validation.missing.includes('homework') && <div>{t('diary.progression.homework.required', { defaultValue: 'Chaque devoir doit avoir une description.' })}</div>}
        </div>
      )}

      <div className="card p-16 mb-16">
        <div className="d-flex gap-12 flex-wrap mb-12">
          <div style={{ flex: '2 1 260px' }}>
            <label htmlFor="pg-title" className="form-label">{t('diary.progression.label', { defaultValue: 'Titre' })} *</label>
            <input id="pg-title" className={`form-control ${missing('title') ? 'is-invalid' : ''}`} maxLength={100} value={draft.title} disabled={readOnly} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label htmlFor="pg-subject" className="form-label">{t('diary.subject', { defaultValue: 'Matière' })}</label>
            <input id="pg-subject" className="form-control" maxLength={100} value={draft.subjectLabel} disabled={readOnly} onChange={(e) => set('subjectLabel', e.target.value)} />
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label htmlFor="pg-class" className="form-label">{t('diary.progression.level', { defaultValue: 'Niveau' })}</label>
            <input id="pg-class" className="form-control" maxLength={50} value={draft.className} disabled={readOnly} onChange={(e) => set('className', e.target.value)} />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label htmlFor="pg-folder" className="form-label">{t('diary.progression.folder.parent', { defaultValue: 'Dossier parent' })}</label>
            <select id="pg-folder" className="form-select" value={draft.folderId === null ? '' : String(draft.folderId)} disabled={readOnly} onChange={(e) => set('folderId', e.target.value === '' ? null : Number(e.target.value))}>
              {choices.map((f) => <option key={f.id ?? 'root'} value={f.id === null ? '' : String(f.id)}>{`${'– '.repeat(f.deepStep)}${f.title}`}</option>)}
            </select>
          </div>
        </div>
        <div className="form-label" style={{ fontSize: 15, fontWeight: 700 }}>{t('diary.progression.description', { defaultValue: 'Description' })} *</div>
        <div className={missing('description') ? 'border border-danger rounded' : ''} data-description>
          <Editor
            key={progressionId ?? 'new'}
            content={editorContent(draft.description)}
            mode={readOnly ? 'read' : 'edit'}
            focus={false}
            variant={readOnly ? 'ghost' : 'outline'}
            visibility="protected"
            onContentChange={({ editor }: { editor: EditorInstance }) => set('description', editor.isEmpty ? '' : editor.getHTML())}
          />
        </div>
      </div>

      <section className="card p-16 mb-16" aria-labelledby="pg-homeworks" data-homeworks>
        <h2 id="pg-homeworks" style={{ fontSize: 18, fontWeight: 700 }} className="mb-12">{t('diary.progression.homeworks', { defaultValue: 'Devoirs' })}</h2>
        {draft.homeworks.length === 0 && <p className="text-muted">{t('diary.progression.homeworks.none', { defaultValue: 'Aucun devoir.' })}</p>}
        {draft.homeworks.map((h, i) => (
          <div key={h.id ?? `new-${i}`} className="border rounded p-12 mb-12" data-homework={i}>
            <div className="d-flex justify-content-between align-items-end gap-12 mb-8">
              <div>
                <label htmlFor={`pg-hw-time-${i}`} className="form-label">{t('diary.progression.homework.time', { defaultValue: 'Durée estimée (minutes)' })}</label>
                <input id={`pg-hw-time-${i}`} type="number" min={0} className="form-control" style={{ width: 120 }} value={h.estimatedTime} disabled={readOnly} onChange={(e) => setHomework(i, { estimatedTime: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              {!readOnly && <button type="button" className="btn btn-danger btn-sm" onClick={() => removeHomework(i)}>{t('diary.progression.homework.delete', { defaultValue: 'Supprimer le devoir' })}</button>}
            </div>
            <Editor
              key={h.id ?? `new-${i}`}
              content={editorContent(h.description)}
              mode={readOnly ? 'read' : 'edit'}
              focus={false}
              variant={readOnly ? 'ghost' : 'outline'}
              visibility="protected"
              onContentChange={({ editor }: { editor: EditorInstance }) => setHomework(i, { description: editor.isEmpty ? '' : editor.getHTML() })}
            />
          </div>
        ))}
        {!readOnly && <button type="button" className="btn btn-secondary" onClick={() => set('homeworks', [...draft.homeworks, { id: null, description: '', estimatedTime: 0 }])}>{t('diary.progression.homework.add', { defaultValue: 'Ajouter un devoir' })}</button>}
      </section>
    </div>
  );
}


export default ProgressionForm;
