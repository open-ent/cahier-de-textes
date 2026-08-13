-- Feature 2/1/3 : ressources structurées attachées à un devoir / une séance
-- (documents de l'espace documentaire, ressources du médiacentre, documents Éléa).
-- Stockées en JSONB : tableau d'objets { type, id, name, url } ; type ∈ ('workspace','mediacentre','elea').
ALTER TABLE diary.homework ADD COLUMN IF NOT EXISTS resources JSONB;
ALTER TABLE diary.session  ADD COLUMN IF NOT EXISTS resources JSONB;
