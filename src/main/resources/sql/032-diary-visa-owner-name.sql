-- Afficher « Visé le [date] par [nom du viseur] » : on stocke le nom d'affichage
-- de l'auteur du visa (plusieurs viseurs possibles, un visa = une ligne).
ALTER TABLE diary.visa ADD COLUMN IF NOT EXISTS owner_name character varying(255);
