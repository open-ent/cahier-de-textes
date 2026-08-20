-- Lien vers de vraies ressources RBS (réservation de ressources), en plus du texte libre `room`
-- existant (coexistence temporaire, pas de migration automatique) — tableau d'entiers (ids de
-- ressources RBS), même pattern additif que 031-diary-add-resources.sql.
ALTER TABLE diary.session ADD COLUMN IF NOT EXISTS rbs_resource_ids JSONB;
-- Ids des réservations RBS effectivement créées pour rbs_resource_ids (uniquement pour les
-- séances créées directement, sans cours EDT — voir DiaryRbsBridgeService) : nécessaires pour
-- pouvoir les supprimer plus tard, "delete-bookings" prenant des ids de réservation, pas de
-- ressource.
ALTER TABLE diary.session ADD COLUMN IF NOT EXISTS rbs_booking_ids JSONB;
