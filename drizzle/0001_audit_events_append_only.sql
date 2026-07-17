-- docs/03_DATA_MODEL.md SS13: "Immutable approved records | Database
-- permissions/triggers/service restrictions block update/delete."
-- Audit events are append-only: reject any UPDATE or DELETE at the database level.
CREATE OR REPLACE FUNCTION reject_audit_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();

CREATE TRIGGER audit_events_no_delete
  BEFORE DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();
