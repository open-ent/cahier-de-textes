import { useEdificeClient, useHasWorkflow } from '@open-ent/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { api } from '../api';
import { initialStructureId, Profile, profileOf, StructureRef, userStructures, WORKFLOW, WorkflowKey } from '../context';

export interface DiaryContext {
  /** Session chargée et établissement initial résolu. */
  ready: boolean;
  userId: string;
  /** Nom affiché de l'usager (inscrit sur les visas). */
  userName: string;
  firstName: string;
  lastName: string;
  profile: Profile;
  /** A le droit de workflow (ex. `has('manageSession')`). */
  has: (k: WorkflowKey) => boolean;
  structures: StructureRef[];
  structure: StructureRef | undefined;
  /** Change d'établissement et le mémorise (préférence `cdt.structure`, partagée avec l'AngularJS). */
  selectStructure: (id: string) => void;
}

/** Profil, droits et établissement courant de l'usager connecté. */
export function useDiaryContext(): DiaryContext {
  const { user, init } = useEdificeClient();
  // Un appel par droit : le socle n'expose qu'une vérification unitaire.
  const rights: Record<WorkflowKey, unknown> = {
    view: useHasWorkflow(WORKFLOW.view),
    calendarView: useHasWorkflow(WORKFLOW.calendarView),
    listView: useHasWorkflow(WORKFLOW.listView),
    accessOwnData: useHasWorkflow(WORKFLOW.accessOwnData),
    accessChildData: useHasWorkflow(WORKFLOW.accessChildData),
    accessExternalData: useHasWorkflow(WORKFLOW.accessExternalData),
    diarySearch: useHasWorkflow(WORKFLOW.diarySearch),
    readSession: useHasWorkflow(WORKFLOW.readSession),
    manageSession: useHasWorkflow(WORKFLOW.manageSession),
    publishSession: useHasWorkflow(WORKFLOW.publishSession),
    readHomework: useHasWorkflow(WORKFLOW.readHomework),
    manageHomework: useHasWorkflow(WORKFLOW.manageHomework),
    publishHomework: useHasWorkflow(WORKFLOW.publishHomework),
    setProgressHomework: useHasWorkflow(WORKFLOW.setProgressHomework),
    settingTypesRead: useHasWorkflow(WORKFLOW.settingTypesRead),
    settingTypesManage: useHasWorkflow(WORKFLOW.settingTypesManage),
    adminAccess: useHasWorkflow(WORKFLOW.adminAccess),
    adminVisaMassManage: useHasWorkflow(WORKFLOW.adminVisaMassManage),
    manageVisa: useHasWorkflow(WORKFLOW.manageVisa),
    readVisa: useHasWorkflow(WORKFLOW.readVisa),
    readNotebookArchives: useHasWorkflow(WORKFLOW.readNotebookArchives),
    searchNotebookArchiveTeachers: useHasWorkflow(WORKFLOW.searchNotebookArchiveTeachers),
  };

  const structures = useMemo(() => userStructures(user?.structures, user?.structureNames), [user]);
  const preferenceQuery = useQuery({ queryKey: ['diary', 'structure-preference'], queryFn: api.getStructurePreference, staleTime: Infinity, enabled: init });
  const savePreference = useMutation({ mutationFn: api.saveStructurePreference });

  const [structureId, setStructureId] = useState('');
  useEffect(() => {
    if (structureId || !init || preferenceQuery.isLoading) return;
    setStructureId(initialStructureId(structures, preferenceQuery.data?.id));
  }, [structureId, init, preferenceQuery.isLoading, preferenceQuery.data, structures]);

  const selectStructure = (id: string) => {
    const next = structures.find((s) => s.id === id);
    if (!next) return;
    setStructureId(id);
    savePreference.mutate(next);
  };

  return {
    ready: init && !preferenceQuery.isLoading && (structureId !== '' || structures.length === 0),
    userId: user?.userId ?? '',
    userName: user?.username ?? '',
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    profile: profileOf(user?.type),
    has: (k) => rights[k] === true,
    structures,
    structure: structures.find((s) => s.id === structureId),
    selectStructure,
  };
}
