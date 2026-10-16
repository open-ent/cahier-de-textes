import { navTabs } from '../context';
import { useDiaryContext } from '../hooks/useDiaryContext';
import { Calendar } from './Calendar';
import { Homeworks } from './Homeworks';
import { List } from './List';

/**
 * Accueil, comme l'AngularJS : le calendrier pour qui y a droit (enseignant, personnel), sinon
 * la liste (élève, parent), à défaut la liste des devoirs. Ex. un élève qui ouvre le cahier de textes voit ses devoirs.
 */
export function Home() {
  const ctx = useDiaryContext();
  const tabs = navTabs(ctx.has, ctx.profile);
  if (tabs.includes('calendar')) return <Calendar />;
  return tabs.includes('list') ? <List /> : <Homeworks />;
}

export default Home;
