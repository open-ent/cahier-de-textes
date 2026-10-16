import { RouteObject, createHashRouter, useLocation, useParams } from 'react-router-dom';

import { Home } from './screens/Home';
import { HomeworkForm } from './screens/HomeworkForm';
import { Homeworks } from './screens/Homeworks';
import { Progressions } from './screens/Progressions';
import { Root } from './screens/Root';
import { SessionForm } from './screens/SessionForm';
import { Sessions } from './screens/Sessions';

/**
 * Écrans de séance et de devoir remontés à chaque changement d'identifiant ou de paramètres :
 * sans cela, passer d'un devoir à un autre (même route, autre `:id`) gardait les données du
 * précédent. Ex. ouvrir le devoir 12 depuis le devoir 7.
 */
function Keyed({ children }: { children: (key: string) => JSX.Element }) {
  const { id } = useParams();
  const { search } = useLocation();
  return children(`${id ?? ''}${search}`);
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Root />,
    children: [
      { index: true, element: <Home /> },
      { path: 'devoirs', element: <Homeworks /> },
      { path: 'devoir/:id', element: <Keyed>{(k) => <HomeworkForm key={k} />}</Keyed> },
      { path: 'seances', element: <Sessions /> },
      { path: 'seance/:id', element: <Keyed>{(k) => <SessionForm key={k} />}</Keyed> },
      { path: 'progressions', element: <Progressions /> },
    ],
  },
];

// Hash router : app servie sous `/diary` (route serveur unique), routage dans le fragment. CCTP 51C.
export const router = createHashRouter(routes);
