import { Alert, AppHeader, Breadcrumb, Layout, LoadingScreen, useEdificeClient } from '@open-ent/react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router-dom';

import { RouteTabs } from '../components/NavTabs';
import { navTabs } from '../context';
import { screenTitleKey, TitleKey } from '../screenTitle';
import { UiSwitchBanner } from '../features/UiSwitchBanner';
import { setLanguage } from '../locale';
import { useDiaryContext } from '../hooks/useDiaryContext';

const TAB_ROUTE = { calendar: '/', list: '/liste', homeworks: '/devoirs', sessions: '/seances', progressions: '/progressions', consult: '/progressions/consultation', notebooks: '/cahiers', archives: '/archives' } as const;

/**
 * Gabarit commun : bandeau ENT, choix de l'établissement (si plusieurs, mémorisé comme
 * l'AngularJS) et onglets selon les droits. Ex. un élève voit « Devoirs » et « Séances », pas
 * « Progressions ».
 */
export function Root() {
  const { t } = useTranslation(['diary', 'common']);
  const { currentApp, currentLanguage, init } = useEdificeClient();

  // La locale de formatage des dates suit la langue de la session (cf. locale.ts). Elle est
  // posée pendant le rendu, et non dans un effet : les écrans sont montés sous ce composant
  // et formateraient leurs premières dates en français avant que l'effet ne s'exécute.
  setLanguage(currentLanguage);

  const ctx = useDiaryContext();
  const { pathname } = useLocation();
  if (!init || !ctx.ready) return <LoadingScreen />;

  const tabs = navTabs(ctx.has, ctx.profile);
  const label = {
    calendar: t('diary.tab.calendar', { defaultValue: 'Calendrier' }),
    list: t('diary.tab.list', { defaultValue: 'Liste' }),
    homeworks: t('diary.tab.homeworks', { defaultValue: 'Devoirs' }),
    sessions: t('diary.tab.sessions', { defaultValue: 'Séances' }),
    progressions: t('diary.tab.progressions', { defaultValue: 'Progressions' }),
    consult: t('diary.tab.progressions', { defaultValue: 'Progressions' }),
    notebooks: t('sessions.admin.main.title', { defaultValue: 'Cahiers de textes' }),
    archives: t('archives', { defaultValue: 'Archives' }),
  };

  // Le fil d'Ariane du socle porte le <h1> de la page : il nomme l'écran courant plutôt que de
  // répéter le nom de l'application, que l'icône dit déjà.
  const screenName: Record<TitleKey, string> = {
    calendar: label.calendar,
    list: label.list,
    homeworks: label.homeworks,
    homeworkNew: t('diary.homework.new', { defaultValue: 'Nouveau devoir' }),
    homework: t('diary.homework', { defaultValue: 'Devoir' }),
    sessions: label.sessions,
    sessionNew: t('diary.session.new', { defaultValue: 'Nouvelle séance' }),
    session: t('diary.session', { defaultValue: 'Séance' }),
    notebooks: label.notebooks,
    archives: label.archives,
    progressions: label.progressions,
    progressionNew: t('diary.progression.new', { defaultValue: 'Nouvelle progression' }),
    progression: t('diary.progression.edit', { defaultValue: 'Modifier la progression' }),
  };
  const home: TitleKey = tabs[0] === 'calendar' ? 'calendar' : tabs[0] === 'list' ? 'list' : 'homeworks';

  return (
    <div className="d-flex flex-column vh-100">
      <Layout>
        <div className="d-print-none">
          <AppHeader>
            {currentApp && <Breadcrumb app={currentApp} name={screenName[screenTitleKey(pathname, home)]} />}
          </AppHeader>
        </div>
        <div className="flex-grow-1 overflow-auto">
          <div className="container py-16">
            {/* Onglets du socle : l'onglet courant se marque par la couleur secondaire et son
                filet, comme dans l'agenda — plus de pavé de boutons pleins. */}
            <div className="d-flex align-items-center justify-content-between gap-16 flex-wrap mb-24">
              <RouteTabs
                label={t('diary.nav', { defaultValue: 'Navigation cahier de textes' })}
                tabs={tabs.map((tab) => ({ to: TAB_ROUTE[tab], label: label[tab], end: tab === 'calendar' }))}
              />
              {ctx.structures.length > 1 && (
                <div className="d-flex align-items-center gap-8 pb-8">
                  <label htmlFor="diary-structure" className="form-label m-0 text-nowrap">
                    {t('diary.structure', { defaultValue: 'Établissement' })}
                  </label>
                  <select
                    id="diary-structure"
                    className="form-select w-auto"
                    value={ctx.structure?.id ?? ''}
                    onChange={(e) => ctx.selectStructure(e.target.value)}
                  >
                    {ctx.structures.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {tabs.length === 0 ? (
              <Alert type="info">
                {t('diary.no.rights', { defaultValue: "Vous n'avez pas accès aux devoirs ni aux séances du cahier de textes." })}
              </Alert>
            ) : (
              <Outlet />
            )}
          </div>
        </div>
      </Layout>
      <UiSwitchBanner />
    </div>
  );
}

export default Root;
