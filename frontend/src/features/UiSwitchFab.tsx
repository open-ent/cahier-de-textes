import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import { bannerEligible } from './uiSwitchState';

/**
 * Bascule PERMANENTE entre la nouvelle et l'ancienne interface : bouton flottant sans compteur, dans un
 * sens comme dans l'autre et autant de fois qu'on le souhaite (le bandeau de retour, lui, s'efface).
 * Il n'écrit AUCUNE préférence (dérogation d'URL `?ui=` seule) et n'est affiché que si l'usager n'a
 * fait aucun choix dans les paramètres du compte (« Choix de la plateforme ») : dès qu'une préférence
 * y est posée, la page de réglages gouverne et ce bouton disparaît. Il laisse aussi la place au bandeau
 * de retour (avec son retour d'expérience) tant que celui-ci est affiché, et prend le relais après.
 */
export function UiSwitchFab() {
  const { t } = useTranslation(['diary', 'common']);
  const [open, setOpen] = useState(false);
  const preference = useQuery({ queryKey: ['diary', 'ui-preference'], queryFn: api.getUiPreference, staleTime: Infinity });

  const choose = (ui: 'react' | 'angular') => {
    if (ui === 'react') {
      setOpen(false);
      return;
    }
    window.location.href = `/diary?ui=${ui}`;
  };

  // Tant que la préférence n'est pas connue, rien : un bouton qui apparaît puis disparaît déroute.
  if (!preference.data || preference.data.ui || bannerEligible(preference.data)) return null;

  return (
    <div className="diary-ui-fab" data-ui-fab>
      {open && (
        <div role="menu" className="diary-ui-fab-menu card shadow p-4">
          <button type="button" role="menuitem" className="btn btn-link text-start d-block" aria-current="true" onClick={() => choose('react')}>
            <strong>{t('diary.switch.fab.new', { defaultValue: 'Nouvelle version' })}</strong> ({t('diary.switch.fab.current', { defaultValue: 'actuelle' })})
          </button>
          <button type="button" role="menuitem" className="btn btn-link text-start d-block" onClick={() => choose('angular')}>
            {t('diary.switch.fab.old', { defaultValue: 'Ancienne version' })}
          </button>
        </div>
      )}
      <button type="button" className="btn btn-secondary rounded-pill shadow" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ⇄ {t('diary.switch.fab.label', { defaultValue: "Version de l'interface" })}
      </button>
    </div>
  );
}

export default UiSwitchFab;
