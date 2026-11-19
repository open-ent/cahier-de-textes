import { Button, IconButton } from '@open-ent/react';
import { IconRafterLeft, IconRafterRight } from '@open-ent/react/icons';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface PeriodNavProps {
  /** Période affichée, en toutes lettres (« 16/11/2026 – 22/11/2026 »). */
  label: string;
  prevLabel: string;
  nextLabel: string;
  onShift: (direction: -1 | 1) => void;
  /** Absent quand l'écran n'a pas de notion d'« aujourd'hui » (semaine figée). */
  onToday?: () => void;
  /** Champ de saisie d'une date, posé à droite du retour à aujourd'hui. */
  children?: ReactNode;
}

/**
 * Navigation dans le temps : deux chevrons discrets encadrant le libellé de période, puis le
 * retour à aujourd'hui. Reprend la barre de l'agenda — les boutons pleins d'avant pesaient
 * autant que l'action principale de l'écran alors qu'ils ne font que déplacer la vue.
 */
export function PeriodNav({
  label,
  prevLabel,
  nextLabel,
  onShift,
  onToday,
  children,
}: PeriodNavProps) {
  const { t } = useTranslation(['diary', 'common']);

  return (
    <div className="d-flex align-items-center gap-8 flex-wrap">
      <IconButton
        type="button"
        color="tertiary"
        variant="ghost"
        icon={<IconRafterLeft />}
        aria-label={prevLabel}
        onClick={() => onShift(-1)}
      />
      <span className="diary-period fw-bold diary-first-letter text-center" role="status" data-period>
        {label}
      </span>
      <IconButton
        type="button"
        color="tertiary"
        variant="ghost"
        icon={<IconRafterRight />}
        aria-label={nextLabel}
        onClick={() => onShift(1)}
      />
      {onToday && (
        <Button type="button" color="tertiary" variant="outline" size="sm" onClick={onToday}>
          {t('diary.calendar.today', { defaultValue: "Aujourd'hui" })}
        </Button>
      )}
      {children}
    </div>
  );
}

export default PeriodNav;
