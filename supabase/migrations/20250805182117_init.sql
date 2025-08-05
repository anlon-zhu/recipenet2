-- ingredients
CREATE TABLE IF NOT EXISTS ingredients (
  id        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical TEXT    NOT NULL UNIQUE,
  embedding VECTOR(1536)
);

-- ingredient_aliases
CREATE TABLE IF NOT EXISTS ingredient_aliases (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT    NOT NULL UNIQUE,
  ingredient_id UUID    REFERENCES ingredients(id) ON DELETE CASCADE
);

-- recipes
CREATE TABLE IF NOT EXISTS recipes (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID    REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  instructions TEXT    NOT NULL,
  is_public    BOOLEAN DEFAULT false
);

-- recipe_ingredients
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id     UUID    REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id UUID    REFERENCES ingredients(id) ON DELETE CASCADE,
  amount        FLOAT,
  unit          TEXT
);

-- saved_recipes
CREATE TABLE IF NOT EXISTS saved_recipes (
  user_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, recipe_id)
);
