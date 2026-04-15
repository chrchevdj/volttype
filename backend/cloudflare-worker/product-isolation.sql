-- VoltType — Product-level user isolation
-- Adds a `products` array in auth.users.raw_app_meta_data so each user
-- can be tagged with the products they belong to.
--
-- Flow:
--   1. On signup, the frontend sends `data.signup_product = 'volttype'`
--      inside Supabase's /auth/v1/signup call (goes into raw_user_meta_data).
--   2. BEFORE INSERT trigger on auth.users reads that field and initializes
--      raw_app_meta_data.products = ['volttype'].
--   3. The raw_user_meta_data.signup_product field is cleared afterwards
--      so users can't set it themselves.
--   4. Backfill: existing users with any VoltType activity get tagged.

-- 1) Add 'volttype' tag to any existing user who has VoltType data
UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb) ||
  jsonb_build_object(
    'products',
    COALESCE(u.raw_app_meta_data->'products', '[]'::jsonb) ||
      CASE
        WHEN u.raw_app_meta_data->'products' ? 'volttype' THEN '[]'::jsonb
        ELSE '["volttype"]'::jsonb
      END
  )
WHERE u.id IN (
  SELECT DISTINCT id FROM volttype_profiles
  UNION
  SELECT DISTINCT user_id FROM volttype_usage
  UNION
  SELECT DISTINCT user_id FROM volttype_subscriptions
);

-- 2) Trigger: when a new auth.users row is inserted, if the signup payload
-- included a `signup_product` in user_metadata, promote it into
-- app_metadata.products and strip the source field.
CREATE OR REPLACE FUNCTION public.volttype_tag_product_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  signup_product TEXT;
  existing_products JSONB;
BEGIN
  signup_product := NEW.raw_user_meta_data->>'signup_product';

  IF signup_product IS NOT NULL AND signup_product <> '' THEN
    existing_products := COALESCE(NEW.raw_app_meta_data->'products', '[]'::jsonb);

    -- Only add if not already present
    IF NOT (existing_products ? signup_product) THEN
      NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) ||
        jsonb_build_object('products', existing_products || to_jsonb(ARRAY[signup_product]));
    END IF;

    -- Remove signup_product from user_metadata so it doesn't leak/persist
    NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'signup_product';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS volttype_tag_product_on_signup ON auth.users;
CREATE TRIGGER volttype_tag_product_on_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.volttype_tag_product_on_signup();

-- 3) Helper RPC so the Worker can add a product to an existing user's tag list
-- (used when a user signs in for a product they weren't originally tagged with
-- and opts to join it).
CREATE OR REPLACE FUNCTION public.volttype_add_user_product(p_user_id UUID, p_product TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  current_products JSONB;
  new_products JSONB;
BEGIN
  IF p_product IS NULL OR p_product = '' THEN
    RAISE EXCEPTION 'product required';
  END IF;

  SELECT COALESCE(raw_app_meta_data->'products', '[]'::jsonb)
  INTO current_products
  FROM auth.users
  WHERE id = p_user_id;

  IF current_products IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  IF current_products ? p_product THEN
    RETURN current_products;
  END IF;

  new_products := current_products || to_jsonb(ARRAY[p_product]);

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) ||
                          jsonb_build_object('products', new_products)
  WHERE id = p_user_id;

  RETURN new_products;
END;
$function$;
