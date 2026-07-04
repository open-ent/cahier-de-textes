import {
  AppHeader,
  Breadcrumb,
  Layout,
  LoadingScreen,
  useEdificeClient,
} from '@open-ent/react';
import { NavLink, Outlet } from 'react-router-dom';

/** Gabarit commun : bandeau ENT (Layout + AppHeader + fil d'Ariane) + navigation + contenu. */
export function Root() {
  const { currentApp, init } = useEdificeClient();
  if (!init) return <LoadingScreen />;

  const tab = (to: string, label: string, end?: boolean) => (
    <NavLink to={to} end={end} className={({ isActive }) => `btn btn-${isActive ? 'primary' : 'secondary'}`}>{label}</NavLink>
  );

  return (
    <div className="d-flex flex-column vh-100">
      <Layout>
        <div className="d-print-none">
          <AppHeader>{currentApp && <Breadcrumb app={currentApp} />}</AppHeader>
        </div>
        <div className="flex-grow-1 overflow-auto">
          <div className="container py-16">
            <nav className="btn-group mb-16" aria-label="Navigation cahier de textes">
              {tab('/', 'Devoirs', true)}
              {tab('/seances', 'Séances')}
            </nav>
            <Outlet />
          </div>
        </div>
      </Layout>
    </div>
  );
}

export default Root;
