import {model, ng} from 'entcore'
import http, {AxiosResponse} from 'axios';
import {Structure} from "../model";

export interface StructureSlot {
    _id: string;
    name: string;
    slots: TimeSlot[];
}

export interface TimeSlot {
    name: string;
    startHour: string;
    endHour: string;
    id: string;
    _id?: string;
}

export interface StructureService {
    initStructure(structure_id: string): Promise<AxiosResponse>;

    getSlotProfile(structureId: string): Promise<StructureSlot>;

    getUserStructure(): Array<Structure>;

    fetchInitializationStatus(structure_id: string): Promise<boolean>;

    /**
     * Charge, une fois par session applicative, les établissements où l'utilisateur détient une
     * habilitation d'inspection. Sans cet appel, `getUserStructure()` ne renvoie que les
     * rattachements de session.
     */
    syncInspectionStructures(): Promise<void>;
}

/**
 * Établissements habilités, mémorisés après le premier appel.
 *
 * Le périmètre d'un inspecteur est défini par ses habilitations, pas par ses rattachements : il
 * n'est le plus souvent rattaché qu'à son service académique, qui n'a ni classe ni enseignant.
 */
let inspectionStructures: Array<Structure> = [];

export const structureService: StructureService = {
    initStructure: async (structure_id: string): Promise<AxiosResponse> => {
        return http.get(`/diary/init/structures/${structure_id}`);
    },

    getSlotProfile: async (structureId: string): Promise<StructureSlot> => {
        try {
            const {data} = await http.get(`/viescolaire/structures/${structureId}/time-slot`);
            return data;
        } catch (err) {
            throw err;
        }
    },

    fetchInitializationStatus: async (structure_id: string): Promise<boolean> => {
        try {
            const {data} = await http.get(`/diary/initialization/structures/${structure_id}`);
            if ('initialized' in data) {
                // case structure with initialized exists
                return data.initialized;
            } else {
                // case no structure with initialized exists (not initialized either way)
                return false;
            }
        } catch (err) {
            throw err;
        }
    },

    getUserStructure: (): Array<Structure> => {
        const {structures, structureNames} = model.me;
        const values = [];
        for (let i = 0; i < structures.length; i++) {
            values.push(new Structure(structures[i], structureNames[i]));
        }
        // Les établissements habilités complètent les rattachements, sans doublon : un inspecteur
        // rattaché à un établissement qu'il inspecte aussi ne doit pas le voir deux fois.
        inspectionStructures
            .filter((s: Structure) => !values.some((v: Structure) => v.id === s.id))
            .forEach((s: Structure) => values.push(s));
        return values;
    },

    syncInspectionStructures: async (): Promise<void> => {
        try {
            const {data} = await http.get('/diary/inspector/structures');
            inspectionStructures = (Array.isArray(data) ? data : [])
                .filter((s: any) => s && s.id)
                .map((s: any) => new Structure(s.id, s.name || s.id));
        } catch (e) {
            // Un périmètre d'inspection indisponible ne doit pas empêcher l'application de
            // s'ouvrir sur les rattachements de l'utilisateur.
            inspectionStructures = [];
        }
    },
};

export const StructureService = ng.service('StructureService', (): StructureService => structureService);

