-- Paramétrage du cahier de textes par classe/groupe (MOD11 CCTP).
-- Un cahier de textes est actif par défaut pour chaque classe/groupe dès qu'un service
-- vie-scolaire existe pour elle ; cette table permet de le désactiver explicitement.
CREATE TABLE IF NOT EXISTS diary.audience_settings (
    structure_id character varying (36) NOT NULL,
    audience_id character varying (36) NOT NULL,
    enabled boolean NOT NULL DEFAULT TRUE,
    CONSTRAINT audience_settings_pkey PRIMARY KEY (structure_id, audience_id)
);
