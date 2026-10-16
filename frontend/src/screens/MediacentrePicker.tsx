import { Modal } from '@open-ent/react';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import { SessionResource, mediacentreResource, MediacentreItem, parseMediacentreFrames } from '../resources';

interface Props {
  attached: SessionResource[];
  onAdd: (resource: SessionResource) => void;
  onClose: () => void;
}

/**
 * Recherche et ajout de ressources du médiacentre au cours. La fenêtre reste ouverte après un
 * ajout pour en enchaîner plusieurs, comme la fenêtre AngularJS et celle de l'agenda React.
 * Ex. « robert » → « Le Robert junior » → Ajouter → la ressource apparaît dans le formulaire.
 */
export function MediacentrePicker({ attached, onAdd, onClose }: Props) {
  const { t } = useTranslation(['edt', 'common']);
  const [query, setQuery] = useState('');
  const search = useMutation({ mutationFn: async (q: string) => parseMediacentreFrames(await api.searchMediacentre(q)) });

  const launch = () => {
    if (query.trim()) search.mutate(query.trim());
  };
  const isAttached = (item: MediacentreItem) => {
    const r = mediacentreResource(item);
    return !!r && attached.some((a) => a.type === 'mediacentre' && a.id === r.id);
  };

  return (
    <Modal id={useId()} isOpen onModalClose={onClose} size="lg" scrollable>
      <Modal.Header onModalClose={onClose}>{t('diary.resources.add.mediacentre', { defaultValue: 'Ajouter une ressource du médiacentre' })}</Modal.Header>
      <Modal.Body>
        {/* Pas d'élément <form> : la fenêtre du socle est rendue hors de la racine React (#portal), et
            sa soumission native rechargeait /edt sans ?ui=react — retour sur l'ancienne interface. */}
        <div className="d-flex gap-8 mb-12" role="search">
          <input
            type="search"
            className="form-control"
            aria-label={t('diary.resources.mediacentre.search.placeholder', { defaultValue: 'Rechercher une ressource…' })}
            placeholder={t('diary.resources.mediacentre.search.placeholder', { defaultValue: 'Rechercher une ressource…' })}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                launch();
              }
            }}
          />
          <button type="button" className="btn btn-primary" disabled={!query.trim() || search.isPending} onClick={launch}>
            {t('diary.resources.mediacentre.search', { defaultValue: 'Rechercher' })}
          </button>
        </div>
        {search.isPending && <p role="status">{t('diary.resources.mediacentre.loading', { defaultValue: 'Recherche en cours…' })}</p>}
        {search.isIdle && <p className="text-muted">{t('diary.resources.mediacentre.empty', { defaultValue: 'Saisissez un mot pour chercher dans le médiacentre.' })}</p>}
        {search.isError && <p className="text-danger" role="alert">{t('diary.form.mediacentre.error', { defaultValue: 'La recherche dans le médiacentre a échoué.' })}</p>}
        {search.isSuccess && search.data.length === 0 && <p className="text-muted">{t('diary.resources.mediacentre.noresult', { defaultValue: 'Aucune ressource trouvée.' })}</p>}
        {search.isSuccess && search.data.length > 0 && (
          <ul className="list-unstyled m-0 d-flex flex-column gap-8">
            {search.data.map((item, i) => {
              const done = isAttached(item);
              return (
                <li key={`${item.id ?? item.link ?? i}`} className="d-flex align-items-center gap-12 border rounded p-8">
                  {item.image && <img src={item.image} alt="" width={48} height={48} style={{ objectFit: 'contain' }} />}
                  <span className="flex-fill">{item.title || item.link}</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    disabled={done}
                    onClick={() => {
                      const r = mediacentreResource(item);
                      if (r) onAdd(r);
                    }}
                  >
                    {done ? t('diary.form.resource.added', { defaultValue: 'Ajoutée' }) : t('diary.form.resource.add', { defaultValue: 'Ajouter' })}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('diary.form.close', { defaultValue: 'Fermer' })}</button>
      </Modal.Footer>
    </Modal>
  );
}

export default MediacentrePicker;
