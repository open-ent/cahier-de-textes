import {Toast, ToastUtils} from "../model";
import {structureService} from "../services";

declare let window: any;

export const audienceSettings = {
    title: 'Audience settings',
    description: "Permet d'activer/désactiver le cahier de textes par classe/groupe",
    that: undefined,
    controller: {
        init: async function () {
            this.notifications = [];
            this.audiences = [];
            this.loading = true;
            audienceSettings.that = this;
            await this.loadAudiences();
            this.loading = false;
            this.safeApply();
        },

        safeApply: function (): Promise<any> {
            return new Promise((resolve, reject) => {
                let phase = this.$root.$$phase;
                if (phase === '$apply' || phase === '$digest') {
                    if (resolve && (typeof(resolve) === 'function')) {
                        resolve();
                    }
                } else {
                    if (resolve && (typeof(resolve) === 'function')) {
                        this.$apply(resolve);
                    } else {
                        this.safeApply();
                    }
                }
            });
        },

        loadAudiences: async function (): Promise<void> {
            try {
                let structure_id = window.model.vieScolaire.structure.id;
                let response = await structureService.getAudienceSettings(structure_id);
                this.audiences = response.data;
            } catch (e) {
                this.notifications.push(new Toast('cdt.audience.settings.load.error', 'error'));
            }
        },

        toggleAudience: async function (audience: any): Promise<void> {
            let structure_id = window.model.vieScolaire.structure.id;
            let nextEnabled = !audience.enabled;
            try {
                await structureService.setAudienceEnabled(structure_id, audience.id, nextEnabled);
                audience.enabled = nextEnabled;
            } catch (e) {
                this.notifications.push(new Toast('cdt.audience.settings.save.error', 'error'));
            }
            this.safeApply();
        }
    }
};
