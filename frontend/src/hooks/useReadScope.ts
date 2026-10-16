import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api, Child } from '../api';
import { courseFilter, readScope, Scope, SearchClass, SearchTeacher } from '../searchScope';
import { useDiaryContext } from './useDiaryContext';

/**
 * Qui consulte quoi : enseignant et classes choisis dans la recherche (enseignant, personnel),
 * enfant choisi (parent). Renvoie le périmètre de lecture, les filtres de cours et l'état des
 * contrôles. Ex. parent de deux enfants : le premier est sélectionné d'office.
 */
export function useReadScope() {
  const ctx = useDiaryContext();
  const [teacher, setTeacher] = useState<SearchTeacher | null>(null);
  const [classes, setClasses] = useState<SearchClass[]>([]);
  const [childId, setChildId] = useState('');
  const relative = ctx.profile === 'relative';
  const childrenQuery = useQuery({ queryKey: ['diary', 'children'], queryFn: api.getChildren, enabled: relative && ctx.ready });
  const children: Child[] = (childrenQuery.data ?? []).filter((c) => !ctx.structure || !c.structureId || c.structureId === ctx.structure.id);
  useEffect(() => {
    if (relative && !childId && children.length > 0) setChildId(children[0].id);
  }, [relative, childId, children]);

  const canSearch = ctx.has('diarySearch') && (ctx.profile === 'teacher' || ctx.profile === 'personnel');
  const scope: Scope = readScope(ctx.profile, ctx.userId, canSearch ? teacher : null, canSearch ? classes : [], childId || undefined);
  return {
    scope,
    canSearch,
    teacher,
    setTeacher,
    classes,
    setClasses,
    children,
    childId,
    setChildId,
    courses: courseFilter(scope, canSearch ? classes : [], ctx.userId),
  };
}
