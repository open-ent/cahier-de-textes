CREATE TABLE diary.session_modification (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT REFERENCES diary.session(id) ON DELETE CASCADE,
    course_id VARCHAR(36),
    date DATE,
    structure_id VARCHAR(36) NOT NULL,
    teacher_id VARCHAR(36) NOT NULL,
    proposed_by VARCHAR(36) NOT NULL,
    status SMALLINT NOT NULL DEFAULT 1,
    payload JSONB NOT NULL,
    refusal_reason TEXT,
    created TIMESTAMP NOT NULL DEFAULT NOW(),
    modified TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX session_modification_session_idx ON diary.session_modification(session_id);
CREATE INDEX session_modification_teacher_idx ON diary.session_modification(teacher_id, status);
