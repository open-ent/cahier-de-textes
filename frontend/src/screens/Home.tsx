import { navTabs } from '../context';
import { useDiaryContext } from '../hooks/useDiaryContext';
import { Calendar } from './Calendar';
import { Homeworks } from './Homeworks';

/**
 * Accueil, comme l'AngularJS : le calendrier pour qui y a droit (enseignant, personnel), sinon
 * la liste des devoirs (élève, parent). Ex. un élève qui ouvre le cahier de textes voit ses devoirs.
 */
export function Home() {
  const ctx = useDiaryContext();
  return navTabs(ctx.has, ctx.profile).includes('calendar') ? <Calendar /> : <Homeworks />;
}

export default Home;
