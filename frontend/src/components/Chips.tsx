import { Badge, Button, IconButton } from '@open-ent/react';
import { IconClose } from '@open-ent/react/icons';
import { useTranslation } from 'react-i18next';

export interface Chip {
  id: string;
  label: string;
}

/**
 * Sélection en cours d'un champ de recherche (enseignants, classes) : une pastille par élément
 * retenu, avec sa croix. Le composant `Badge` du socle porte la couleur du thème — les pastilles
 * d'avant étaient des `badge bg-secondary` avec un blanc écrit en dur, illisibles sur certains skins.
 */
export function Chips({
  items,
  onRemove,
  attrs,
}: {
  items: Chip[];
  onRemove: (id: string) => void;
  /** Attributs de repérage posés sur la liste (`data-chosen-teachers`…). */
  attrs?: Record<string, string | boolean>;
}) {
  const { t } = useTranslation(['diary', 'common']);
  if (items.length === 0) return null;

  return (
    <ul className="list-unstyled d-flex flex-wrap gap-8 mt-8 mb-0" {...attrs}>
      {items.map((item) => (
        <li key={item.id}>
          <Badge variant={{ type: 'chip' }} className="d-inline-flex align-items-center gap-4">
            {item.label}
            <IconButton
              type="button"
              color="tertiary"
              variant="ghost"
              size="sm"
              icon={<IconClose />}
              aria-label={`${t('diary.search.remove', { defaultValue: 'Retirer' })} ${item.label}`}
              onClick={() => onRemove(item.id)}
            />
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** Propositions sous un champ de recherche : liste détachée, au-dessus du contenu. */
export function Suggestions({
  items,
  onPick,
  attrs,
}: {
  items: Chip[];
  onPick: (id: string) => void;
  attrs?: Record<string, string | boolean>;
}) {
  if (items.length === 0) return null;

  return (
    <ul className="diary-suggestions list-unstyled p-4 m-0" {...attrs}>
      {items.map((item) => (
        <li key={item.id}>
          <Button
            type="button"
            color="tertiary"
            variant="ghost"
            className="w-100 justify-content-start text-start"
            onClick={() => onPick(item.id)}
          >
            {item.label}
          </Button>
        </li>
      ))}
    </ul>
  );
}
