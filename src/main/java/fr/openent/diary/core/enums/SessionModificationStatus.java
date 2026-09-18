package fr.openent.diary.core.enums;

public enum SessionModificationStatus {
    PENDING(1), ACCEPTED(2), REFUSED(3);

    private final int status;

    SessionModificationStatus(int status) {
        this.status = status;
    }

    public int status() {
        return status;
    }
}
