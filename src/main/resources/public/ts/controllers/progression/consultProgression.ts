import {idiom as lang, ng} from 'entcore';
import http from 'axios';
import {SearchService} from '../../services';

declare let window: any;

/**
 * Vue « Consultation des progressions d'un enseignant » — réservée à la direction (PERSEDUCNAT).
 *
 * Lecture seule : la direction sélectionne un enseignant, on affiche ses dossiers et séances
 * de progression. On réutilise l'endpoint existant GET /diary/progressions/:ownerId
 * (protégé côté serveur par le filtre SessionRead). Aucune écriture n'est possible depuis cet écran.
 *
 * Toutes les collections exposées au template sont des tableaux stables (jamais recalculés dans
 * un ng-repeat) afin d'éviter tout cycle de digest infini ($rootScope:infdig).
 */
export let consultProgressionCtrl = ng.controller('consultProgressionCtrl',
    ['$scope', 'SearchService', function ($scope, searchService: SearchService) {

        $scope.folders = [];
        $scope.selectedTeacher = null;
        $scope.loading = false;

        // Modèle de la barre de recherche (directive async-autocomplete)
        $scope.teacherQuery = '';
        $scope.teacherOptions = [];

        // La structure courante est fournie par le contrôleur principal (scope parent) ou window.structure.
        const getStructureId = (): string => {
            const structure = $scope.structure || window.structure;
            return structure ? structure.id : null;
        };

        const apply = (): void => {
            if (typeof $scope.safeApply === 'function') $scope.safeApply();
        };

        // Recherche : uniquement les enseignants
        $scope.searchUser = async (userForm: string): Promise<void> => {
            const structureId = getStructureId();
            if (!structureId) return;
            try {
                $scope.teacherOptions = await searchService.searchUser(structureId, userForm, 'Teacher');
            } catch (err) {
                $scope.teacherOptions = [];
            }
            apply();
        };

        // Sélection d'un enseignant → chargement de ses progressions
        $scope.selectUser = async (valueInput, userItem): Promise<void> => {
            if (!userItem) return;
            $scope.teacherQuery = '';
            $scope.selectedTeacher = userItem;
            await loadProgressions(userItem.id);
        };

        const loadProgressions = async (ownerId: string): Promise<void> => {
            $scope.loading = true;
            $scope.folders = [];
            apply();
            try {
                const {data} = await http.get('/diary/progressions/' + ownerId);
                $scope.folders = buildFolders(data);
            } catch (err) {
                $scope.folders = [];
            }
            $scope.loading = false;
            apply();
        };

        /**
         * Transforme la réponse SQL (dossiers avec séances imbriquées, séances avec devoirs imbriqués)
         * en structure d'affichage stable. Les entrées nulles (dossiers vides, jointures FULL JOIN) sont filtrées.
         */
        const buildFolders = (rows: any[]): any[] => {
            if (!Array.isArray(rows)) return [];
            return rows.map((row) => {
                const rawSessions = Array.isArray(row.progressions) ? row.progressions : [];
                const sessions = rawSessions
                    .filter((s) => s && s.id)
                    .map((s) => {
                        const homeworks = Array.isArray(s.homeworks) ? s.homeworks.filter((h) => h && h.id) : [];
                        return {
                            title: s.title,
                            class: s.class,
                            subjectLabel: s.subject_label,
                            homeworksCount: homeworks.length
                        };
                    });
                return {
                    id: row.id,
                    title: row.title ? row.title : lang.translate('diary.consult.progression.folder.none'),
                    sessions: sessions
                };
            });
        };
    }]);
