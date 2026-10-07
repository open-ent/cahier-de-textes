import { RouteObject, createHashRouter } from 'react-router-dom';

import { Homeworks } from './screens/Homeworks';
import { Progressions } from './screens/Progressions';
import { Root } from './screens/Root';
import { Sessions } from './screens/Sessions';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Root />,
    children: [
      { index: true, element: <Homeworks /> },
      { path: 'seances', element: <Sessions /> },
      { path: 'progressions', element: <Progressions /> },
    ],
  },
];

// Hash router : app servie sous `/diary` (route serveur unique), routage dans le fragment. CCTP 51C.
export const router = createHashRouter(routes);
