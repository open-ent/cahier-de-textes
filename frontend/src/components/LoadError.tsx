import { useTranslation } from 'react-i18next';

/** Message affiché quand le chargement d'une liste échoue, à la place du faux « aucun résultat ». */
export function LoadError({ failed }: { failed: boolean }) {
  const { t } = useTranslation();
  if (!failed) return null;
  return (
    <p className="text-danger" role="alert" data-load-error>
      {t('diary.load.error', { defaultValue: 'Le chargement a échoué. Les données affichées peuvent être incomplètes, réessayez.' })}
    </p>
  );
}
