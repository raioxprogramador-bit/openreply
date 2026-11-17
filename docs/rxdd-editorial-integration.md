# RXDD V2 — OpenReply internal API

Auth: `Authorization: Bearer $OPENREPLY_RXDD_INTERNAL_SECRET`

| Method | Path |
|--------|------|
| POST | `/api/internal/rxdd/automations` |
| GET/PATCH | `/api/internal/rxdd/automations/{id}?workspace_id=&rxdd_publicacao_id=` |
| POST | `/api/internal/rxdd/automations/{id}/bind-reel` |

Campaigns created for RXDD use `goal` = `rxdd_publicacao_id:{uuid}` and a placeholder `postId` until bind-reel.