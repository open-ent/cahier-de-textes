import { Button, FormControl, Input, Label } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, UiPreference } from '../api';
import { bannerEligible } from './uiSwitchState';


/**
 * Réglage durable du choix d'interface, dans le dashboard (entrée `diaryUi` de la page
 * « Paramètres du compte »), à dessein hors de cette application : ce bandeau fait découvrir le
 * changement puis s'efface, la page de réglages gouverne. Chemin figé : le module ne connaît pas
 * le `basePath` du dashboard, qui vaut `/dashboard` en local comme en production.
 */
const SETTINGS_URL = '/dashboard/account/settings';

/**
 * Bandeau de retour vers l'IHM AngularJS pendant la cohabitation des deux interfaces — symétrique
 * de l'invitation posée sur l'ancienne IHM (`public/ui-switch.js`), même mécanisme que l'Agenda.
 * Le retour passe par une question en une ligne : c'est le seul moment où l'on saura POURQUOI
 * quelqu'un repart. Ex. réponse stockée : `{ feedback: 'il manque la vue mensuelle' }`.
 *
 * Pour relire les réponses : {@code MATCH (u:User)-[:PREFERS]->(uac:UserAppConf)
 *  WHERE uac.diaryUi CONTAINS 'feedback' RETURN u.id, uac.diaryUi}
 */
export function UiSwitchBanner() {
  const { t } = useTranslation(['diary', 'common']);
  const [asking, setAsking] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [hidden, setHidden] = useState(false);

  const preferenceQuery = useQuery({
    queryKey: ['diary', 'ui-preference'],
    queryFn: api.getUiPreference,
    staleTime: Infinity,
  });

  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (preference: UiPreference) => api.saveUiPreference(preference),
    // La préférence est réécrite ENTIÈRE à chaque fois : sans remettre le résultat en cache, une
    // seconde écriture repartirait de la version d'avant et effacerait la première (ex. le compteur
    // d'affichages repasserait de 2 à 1).
    onSuccess: (_data, preference) => queryClient.setQueryData(['diary', 'ui-preference'], preference),
  });

  const preference = preferenceQuery.data;
  const visible = !hidden && bannerEligible(preference);

  // Un affichage compté une seule fois par chargement de page, jamais pendant le rendu.
  const counted = useRef(false);
  useEffect(() => {
    if (!visible || counted.current || !preference) return;
    counted.current = true;
    save.mutate({ ...preference, returnShown: (preference.returnShown ?? 0) + 1 });
    // `save` est stable (useMutation) ; le ref garantit l'unicité, l'ajouter aux dépendances
    // risquerait une boucle d'écriture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, preference]);

  // Tant que la préférence n'est pas connue, rien : un bandeau qui apparaît puis disparaît une
  // seconde plus tard est plus déroutant qu'un bandeau qui arrive tard.
  if (!visible || !preference) return null;

  const goBack = (withFeedback: boolean) => {
    const answer = feedback.trim();
    void save
      .mutateAsync({
        ...preference,
        ...(withFeedback && answer ? { feedback: answer, feedbackAt: new Date().toISOString() } : {}),
      })
      .finally(() => {
        // Aucune préférence `ui` n'est posée : le choix durable se fait dans les paramètres du compte, et le
        // bouton de bascule doit rester disponible. Dérogation d'URL seule.
        window.location.href = '/diary?ui=angular';
      });
  };

  const dismiss = () => {
    setHidden(true);
    save.mutate({ ...preference, returnDismissed: true });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    goBack(true);
  };

  return (
    <div className="diary-ui-switch card shadow p-16" role="region" aria-label={t('diary.switch.return.title', { defaultValue: 'Vous utilisez la nouvelle version du Cahier de textes.' })}>
      {asking ? (
        <form className="d-flex flex-column gap-8" onSubmit={onSubmit}>
          <FormControl id="diary-ui-switch-feedback">
            <Label>{t('diary.switch.feedback.question', { defaultValue: "Qu'est-ce qui vous manque ?" })}</Label>
            <Input
              type="text"
              size="md"
              autoFocus
              placeholder={t('diary.switch.feedback.placeholder', { defaultValue: 'En une phrase (facultatif)' })}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
          </FormControl>
          <div className="d-flex justify-content-end gap-8">
            <Button type="button" color="tertiary" variant="ghost" onClick={() => goBack(false)}>
              {t('diary.switch.feedback.skip', { defaultValue: 'Revenir sans répondre' })}
            </Button>
            <Button type="submit" color="primary" variant="filled">
              {t('diary.switch.feedback.send', { defaultValue: 'Envoyer et revenir' })}
            </Button>
          </div>
        </form>
      ) : (
        <div className="d-flex align-items-center gap-16 flex-wrap">
          <div className="flex-fill">
            <div>{t('diary.switch.return.title', { defaultValue: 'Vous utilisez la nouvelle version du Cahier de textes.' })}</div>
            <small className="text-muted">
              {t('diary.switch.return.where', { defaultValue: 'Ce choix reste modifiable à tout moment depuis les' })} <a href={SETTINGS_URL}>{t('diary.switch.return.settings', { defaultValue: 'paramètres de votre compte' })}</a>.
            </small>
          </div>
          <div className="d-flex align-items-center gap-8">
            <Button type="button" color="tertiary" variant="ghost" onClick={dismiss}>
              {t('diary.switch.return.dismiss', { defaultValue: 'Ne plus afficher' })}
            </Button>
            <Button type="button" color="primary" variant="outline" onClick={() => setAsking(true)}>
              {t('diary.switch.return.back', { defaultValue: "Revenir à l'ancienne version" })}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default UiSwitchBanner;
