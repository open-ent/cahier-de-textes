import {idiom as lang} from 'entcore';
import {AutoCompleteUtils} from "./auto-complete";
import {SearchItem, SearchService} from "../../services";


/**
 * ⚠ This class is used for the directive async-autocomplete
 * use it for group only (groups/classes)
 */

export class GroupsSearch extends AutoCompleteUtils {

    private groups: Array<SearchItem>;
    private selectedGroups: Array<{}>;

    public group: string;

    constructor(structureId: string, searchService: SearchService) {
        super(structureId, searchService);
    }

    public getGroups() {
        return this.groups;
    }

    public getSelectedGroups() {
        return this.selectedGroups ? this.selectedGroups : [];
    }

    public setSelectedGroups(selectedGroups: Array<{}>) {
        this.selectedGroups = selectedGroups;
    }

    public removeSelectedGroups(groupItem) {
        this.selectedGroups.splice(this.selectedGroups.indexOf(groupItem), 1);
    }

    public resetGroups() {
        this.groups = [];
    }

    public resetSelectedGroups() {
        this.selectedGroups = [];
    }

    public selectGroups(valueInput, groupItem) {
        if (!this.selectedGroups) this.selectedGroups = [];
        if (this.selectedGroups.find(group => group["id"] === groupItem.id) === undefined) {
            this.selectedGroups.push(groupItem);
        }
    };

    public selectGroup(valueInput, groupItem) {
        this.selectedGroups = [];
        this.selectedGroups.push(groupItem);
    }

    public async searchGroups(valueInput: string) {
        try {
            // La recherche serveur porte sur le NOM brut du groupe (« 501 »). On tolère que
            // l'utilisateur tape le libellé affiché (« Élèves du groupe 501 », « groupe 501 »…)
            // en retirant un éventuel préfixe de libellé avant d'interroger.
            const stripped: string = (valueInput || '')
                .replace(/^\s*(élèves|eleves)\s+(du\s+groupe|de\s+la\s+classe|du)\s+/i, '')
                .replace(/^\s*(groupe|classe)\s+/i, '')
                .trim();
            this.groups = await this.searchService.searchGroup(this.structureId, stripped || (valueInput || ''));
            // Affichage lisible calqué sur la barre de partage entcore : « Élèves du groupe 501 ».
            this.groups.map((group: SearchItem) => group.toString = () =>
                group.name ? (lang.translate('diary.audience.group.label') + ' ' + group.name) : group.name);
        } catch (err) {
            this.groups = [];
            throw err;
        }
    };
}