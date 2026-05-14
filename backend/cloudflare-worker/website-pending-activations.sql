-- VT-ACTIVATION: store paid website checkouts made before app signup.

CREATE TABLE IF NOT EXISTS volttype_pending_activations (
  email TEXT PRIMARY KEY,
  plan TEXT NOT NULL CHECK (plan IN ('basic', 'pro')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  claimed_user_id UUID,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_volttype_pending_activations_subscription
  ON volttype_pending_activations(stripe_subscription_id);

CREATE OR REPLACE FUNCTION set_volttype_pending_activations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS volttype_pending_activations_updated_at ON volttype_pending_activations;
CREATE TRIGGER volttype_pending_activations_updated_at
  BEFORE UPDATE ON volttype_pending_activations
  FOR EACH ROW EXECUTE FUNCTION set_volttype_pending_activations_updated_at();
