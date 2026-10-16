import { AppHeader, Breadcrumb, Layout, LoadingScreen, useEdificeClient } from '@open-ent/react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';

import { navTabs } from '../context';
import { setLanguage } from '../locale';
import { useDiaryContext } from '../hooks/useDiaryContext';

const TAB_ROUTE = { calendar: '/', list: '/liste', homeworks: '/devoirs', sessions: '/seances', progressions: '/progressions' } as const;

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
  if (!init || !ctx.ready) return <LoadingScreen />;

  const tabs = navTabs(ctx.has, ctx.profile);
  const label = {
    calendar: t('diary.tab.calendar', { defaultValue: 'Calendrier' }),
    list: t('diary.tab.list', { defaultValue: 'Liste' }),
    homeworks: t('diary.tab.homeworks', { defaultValue: 'Devoirs' }),
    sessions: t('diary.tab.sessions', { defaultValue: 'Séances' }),
    progressions: t('diary.tab.progressions', { defaultValue: 'Progressions' }),
  };

  return (
    <div className="d-flex flex-column vh-100">
      <Layout>
        <div className="d-print-none">
          <AppHeader>{currentApp && <Breadcrumb app={currentApp} />}</AppHeader>
        </div>
        <div className="flex-grow-1 overflow-auto">
          <div className="container py-16">
            <div className="d-flex align-items-center justify-content-between gap-12 flex-wrap mb-16">
              <nav className="btn-group" aria-label={t('diary.nav', { defaultValue: 'Navigation cahier de textes' })}>
                {tabs.map((tab) => (
                  <NavLink key={tab} to={TAB_ROUTE[tab]} end={tab === 'calendar'} className={({ isActive }) => `btn btn-${isActive ? 'primary' : 'secondary'}`}>
                    {label[tab]}
                  </NavLink>
                ))}
              </nav>
              {ctx.structures.length > 1 && (
                <div className="d-flex align-items-center gap-8">
                  <label htmlFor="diary-structure" className="m-0" style={{ fontWeight: 700 }}>
                    {t('diary.structure', { defaultValue: 'Établissement' })}
                  </label>
                  <select id="diary-structure" className="form-select" style={{ width: 'auto' }} value={ctx.structure?.id ?? ''} onChange={(e) => ctx.selectStructure(e.target.value)}>
                    {ctx.structures.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {tabs.length === 0 ? (
              <div className="alert alert-info" role="alert">
                {t('diary.no.rights', { defaultValue: "Vous n'avez pas accès aux devoirs ni aux séances du cahier de textes." })}
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </div>
      </Layout>
    </div>
  );
}

export default Root;
