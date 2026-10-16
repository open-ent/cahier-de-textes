import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import { buildTree, ProgressionDraft, parentChoices, toBody } from '../progressions';
import { Modal } from './Modal';

interface Props {
  ownerId: string;
  title: string;
  description: string;
  subjectLabel: string;
  /** Devoirs à rendre pour cette séance (ceux donnés pour une séance prochaine ne sont pas repris). */
  homeworks: Array<{ description: string; estimatedTime: number }>;
}

/**
 * « Sauvegarder dans Progression » depuis une séance, comme l'AngularJS (session-to-progression-form) :
 * crée une séance modèle (titre, matière, description) avec les devoirs à rendre pour cette
 * séance, dans le dossier choisi. Ex. séance « Fractions » + son devoir de 15 min → progression « Fractions ».
 */
export function SaveAsProgression({ ownerId, title, description, subjectLabel, homeworks }: Props) {
  const { t } = useTranslation(['diary', 'common']);
  const [opened, setOpened] = useState(false);
  const [folderId, setFolderId] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  const folders = useQuery({ queryKey: ['diary', 'progression-folders', ownerId], queryFn: () => api.getProgressionFolders(ownerId), enabled: opened && !!ownerId });
  const root = useMemo(() => buildTree(folders.data ?? [], t('diary.progressions.root', { defaultValue: 'Mes dossiers' })), [folders.data, t]);

  const save = useMutation({
    mutationFn: () => {
      const draft: ProgressionDraft = {
        id: null,
        title,
        description,
        subjectLabel,
        className: '',
        folderId,
        homeworks: homeworks.map((h) => ({ id: null, description: h.description, estimatedTime: h.estimatedTime })),
      };
      return api.saveProgression(null, toBody(draft, ownerId));
    },
    onSuccess: () => { setOpened(false); setDone(true); setError(false); },
    onError: () => setError(true),
  });

  const ready = title.trim() !== '' && description.replace(/<[^>]*>/g, '').trim() !== '';

  return (
    <div className="mt-12">
      <button type="button" className="btn btn-secondary" onClick={() => { setDone(false); setError(false); setOpened(true); }}>
        {t('diary.progression.from.session', { defaultValue: 'Sauvegarder dans Progression' })}
      </button>
      {done && <span className="ms-12 text-success" role="status" data-progression-saved>{t('diary.progression.created', { defaultValue: 'Progression créée' })}</span>}
      {opened && (
        <Modal title={t('diary.progression.from.session', { defaultValue: 'Sauvegarder dans Progression' })} onClose={() => setOpened(false)}>
          <p className="text-danger mb-4">{t('diary.progression.from.session.warning1', { defaultValue: 'Attention, seuls les devoirs liés à cette séance seront sauvegardés.' })}</p>
          <p className="text-danger">{t('diary.progression.from.session.warning2', { defaultValue: 'Ceux saisis pour une séance prochaine ne seront pas sauvegardés.' })}</p>
          {!ready && <div className="alert alert-warning" role="alert">{t('diary.progression.from.session.incomplete', { defaultValue: 'Le titre et le contenu de la séance doivent être renseignés.' })}</div>}
          {error && <div className="alert alert-danger" role="alert">{t('diary.progression.error', { defaultValue: "L'enregistrement de la progression a échoué." })}</div>}
          <label htmlFor="sp-folder" className="form-label">{t('diary.progression.folder.parent', { defaultValue: 'Dossier parent' })}</label>
          <select id="sp-folder" className="form-select mb-12" value={folderId === null ? '' : String(folderId)} onChange={(e) => setFolderId(e.target.value === '' ? null : Number(e.target.value))}>
            {parentChoices(root).map((f) => <option key={f.id ?? 'root'} value={f.id === null ? '' : String(f.id)}>{`${'– '.repeat(f.deepStep)}${f.title}`}</option>)}
          </select>
          <div className="d-flex justify-content-end gap-8">
            <button type="button" className="btn btn-secondary" onClick={() => setOpened(false)}>{t('diary.cancel', { defaultValue: 'Annuler' })}</button>
            <button type="button" className="btn btn-primary" disabled={!ready || save.isPending} onClick={() => save.mutate()}>{t('diary.save', { defaultValue: 'Enregistrer' })}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default SaveAsProgression;
