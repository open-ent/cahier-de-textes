import { Alert } from '@open-ent/react';
import { useTranslation } from 'react-i18next';

/**
 * Message affiché quand le chargement d'une liste échoue, à la place du faux « aucun résultat ».
 * Un seul message par panne : les écrans affichaient auparavant une phrase rouge ET une alerte
 * disant la même chose, ce qui laissait croire à deux ennuis distincts.
 */
export function LoadError({ failed }: { failed: boolean }) {
  const { t } = useTranslation();
  if (!failed) return null;
  return (
    <div className="mb-16" data-load-error>
      <Alert type="warning">
        {t('diary.load.error', { defaultValue: 'Le chargement a échoué. Les données affichées peuvent être incomplètes, réessayez.' })}
      </Alert>
    </div>
  );
}
