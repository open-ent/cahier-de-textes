-- Perf /diary/notebooks : la vue diary.notebook (UNION homework+session) est filtrée sur
-- structure_id / teacher_id / audience_id / date. Sans index sélectif, une plage d'un an
-- provoque un quasi full-scan (idx_session_date seul n'est pas sélectif sur un an) puis un
-- filtrage en mémoire. On ajoute des index composites couvrant les deux profils d'accès :
--   - vue admin (direction/CPE) : filtre structure_id + date uniquement.
--   - vue enseignant/consultation : filtre structure_id + teacher_id + audience_id + date.

-- SESSION (colonne date)
CREATE INDEX IF NOT EXISTS idx_session_structure_date
    ON diary.session (structure_id, date);
CREATE INDEX IF NOT EXISTS idx_session_struct_teacher_audience_date
    ON diary.session (structure_id, teacher_id, audience_id, date);

-- HOMEWORK (colonne due_date, exposée comme "date" dans la vue)
CREATE INDEX IF NOT EXISTS idx_homework_structure_duedate
    ON diary.homework (structure_id, due_date);
CREATE INDEX IF NOT EXISTS idx_homework_struct_teacher_audience_duedate
    ON diary.homework (structure_id, teacher_id, audience_id, due_date);
