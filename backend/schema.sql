-- =============================================
-- Wedaje Gebya — PostgreSQL Database Schema
-- Run this file once to create all tables
-- =============================================

-- Enable UUID extension for unique IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- USERS TABLE
-- Stores all buyers, sellers, and admins
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) UNIQUE NOT NULL,
  phone       VARCHAR(20) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,     -- hashed with bcrypt
  avatar_url  TEXT,                       -- Cloudinary URL
  role        VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user','buyer','seller','admin')),
  region      VARCHAR(100),
  verified    BOOLEAN DEFAULT false,
  is_active   BOOLEAN DEFAULT true,
  coins       INTEGER DEFAULT 0,          -- YegnaCoins loyalty points
  wallet      DECIMAL(10,2) DEFAULT 0,   -- ETB wallet balance
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- CATEGORIES TABLE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name  VARCHAR(100) NOT NULL,
  slug  VARCHAR(100) UNIQUE NOT NULL,
  icon  VARCHAR(10),
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true
);

-- Insert default categories
INSERT INTO categories (name, slug, icon, sort_order) VALUES
  ('All',      'all',      '🛍️', 0),
  ('Coffee',   'coffee',   '☕', 1),
  ('Textile',  'textile',  '🧵', 2),
  ('Spices',   'spices',   '🌶️', 3),
  ('Crafts',   'crafts',   '🏺', 4),
  ('Food',     'food',     '🌽', 5),
  ('Tech',     'tech',     '📱', 6),
  ('Fashion',  'fashion',  '👗', 7),
  ('Livestock','livestock','🐄', 8)
  ,('Asbeza','asbeza','🥬', 9)
  ,('Cloth','cloth','🧺', 10)
  ,('Bonda','bonda','🧺', 11)
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────
-- PRODUCTS TABLE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES categories(id),
  name            VARCHAR(200) NOT NULL,
  description     TEXT NOT NULL,
  price           DECIMAL(10,2) NOT NULL,
  original_price  DECIMAL(10,2),          -- for discount display
  stock           INTEGER DEFAULT 0,
  region          VARCHAR(100),
  country         VARCHAR(200),            -- exact seller location like "Bole, Addis Ababa"
  tags            TEXT[],                  -- array: ['organic','fair-trade']
  -- Images stored as array of Cloudinary URLs
  images          TEXT[] DEFAULT '{}',
  main_image      TEXT,                    -- primary image URL
  rating          DECIMAL(3,2) DEFAULT 0,
  review_count    INTEGER DEFAULT 0,
  sold_count      INTEGER DEFAULT 0,
  approved        BOOLEAN DEFAULT false,   -- admin must approve
  is_active       BOOLEAN DEFAULT true,
  moderation_status VARCHAR(20) DEFAULT 'pending',
  -- Variants (JSON): [{"type":"size","options":["S","M","L"]}]
  variants        JSONB DEFAULT '[]',
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS country VARCHAR(200);
ALTER TABLE products ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) DEFAULT 'pending';
UPDATE products SET moderation_status = CASE WHEN approved = true THEN 'approved' WHEN is_active = false THEN 'rejected' ELSE 'pending' END WHERE moderation_status IS NULL OR moderation_status NOT IN ('pending', 'approved', 'rejected', 'deleted');
ALTER TABLE categories ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- ─────────────────────────────────────────────
-- PRODUCT IMAGES TABLE (separate for multiple images)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_images (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,              -- Cloudinary URL
  public_id   TEXT NOT NULL,             -- Cloudinary public_id (for deletion)
  is_primary  BOOLEAN DEFAULT false,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ORDERS TABLE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id        UUID REFERENCES users(id),
  status          VARCHAR(30) DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled','refunded')),
  payment_method  VARCHAR(30) CHECK (payment_method IN ('telebirr','cbe','chapa','cash','wallet')),
  payment_status  VARCHAR(20) DEFAULT 'pending'
                  CHECK (payment_status IN ('pending','paid','failed','refunded')),
  subtotal        DECIMAL(10,2) NOT NULL,
  delivery_fee    DECIMAL(10,2) DEFAULT 50,
  total           DECIMAL(10,2) NOT NULL,
  -- Ethiopian address
  delivery_region VARCHAR(100),
  delivery_city   VARCHAR(100),
  delivery_subcity VARCHAR(100),
  delivery_woreda VARCHAR(100),
  delivery_kebele VARCHAR(100),
  delivery_description TEXT,            -- "Near St. Gabriel church"
  delivery_phone  VARCHAR(20),
  -- Bus delivery
  bus_company     VARCHAR(100),
  bus_tracking_id VARCHAR(100),
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ORDER ITEMS TABLE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id),
  seller_id   UUID REFERENCES users(id),
  name        VARCHAR(200) NOT NULL,    -- snapshot at time of order
  price       DECIMAL(10,2) NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  image_url   TEXT,
  variant     JSONB,                    -- selected variant: {"size":"M","color":"White"}
  subtotal    DECIMAL(10,2) NOT NULL
);

-- ─────────────────────────────────────────────
-- REVIEWS TABLE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  buyer_id        UUID REFERENCES users(id),
  order_id        UUID REFERENCES orders(id),
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  photo_urls      TEXT[] DEFAULT '{}',
  aspect_ratings  JSONB DEFAULT '{}',   -- {"quality":5,"packaging":4}
  helpful_count   INTEGER DEFAULT 0,
  verified        BOOLEAN DEFAULT true, -- verified purchase
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(product_id, buyer_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_product_buyer_unique
  ON reviews (product_id, buyer_id);

-- ─────────────────────────────────────────────
-- CART TABLE (persistent cart)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cart_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  quantity    INTEGER DEFAULT 1,
  variant     JSONB,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- ─────────────────────────────────────────────
-- WISHLIST TABLE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlists (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- ─────────────────────────────────────────────
-- PRICE ALERTS TABLE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  target_price    DECIMAL(10,2) NOT NULL,
  notified        BOOLEAN DEFAULT false,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- NOTIFICATIONS TABLE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50),              -- 'order','promo','arrival','review'
  title       VARCHAR(200) NOT NULL,
  body        TEXT,
  read        BOOLEAN DEFAULT false,
  data        JSONB DEFAULT '{}',       -- extra data (order_id etc)
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- CHAT MESSAGES TABLE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id   UUID REFERENCES users(id),
  receiver_id UUID REFERENCES users(id),
  product_id  UUID REFERENCES products(id), -- context product
  text        TEXT,
  image_url   TEXT,                     -- Cloudinary or local image URL
  voice_url   TEXT,                     -- Cloudinary audio URL
  is_voice    BOOLEAN DEFAULT false,
  read        BOOLEAN DEFAULT false,
  created_at  TIMESTAMP DEFAULT NOW()
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE TABLE IF NOT EXISTS banners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(120) NOT NULL,
  subtitle VARCHAR(220) NOT NULL,
  emoji VARCHAR(10) DEFAULT '🎉',
  color VARCHAR(20) DEFAULT '#0f2d1a',
  active BOOLEAN DEFAULT true,
  clicks INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discoveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(80) NOT NULL,
  subtitle VARCHAR(140) NOT NULL,
  emoji VARCHAR(10) DEFAULT '✨',
  color VARCHAR(20) DEFAULT '#0f2d1a',
  route VARCHAR(120) NOT NULL,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- DISPUTES TABLE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS disputes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID REFERENCES orders(id),
  buyer_id    UUID REFERENCES users(id),
  seller_id   UUID REFERENCES users(id),
  reason      TEXT NOT NULL,
  status      VARCHAR(30) DEFAULT 'open'
              CHECK (status IN ('open','reviewing','resolved','closed')),
  resolution  TEXT,
  admin_note  TEXT,
  resolved_at TIMESTAMP,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- OTP TABLE (for forgot password / phone verify)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otps (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone       VARCHAR(20) NOT NULL,
  code        VARCHAR(6) NOT NULL,
  expires_at  TIMESTAMP NOT NULL,
  used        BOOLEAN DEFAULT false,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- SELLER APPLICATIONS (for users applying to become sellers)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seller_applications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  full_name   VARCHAR(150),
  phone       VARCHAR(30),
  region      VARCHAR(100),
  bio         TEXT,
  status      VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note  TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- INDEXES for fast queries
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_approved ON products(approved, is_active);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_seller_applications_user ON seller_applications(user_id);

-- Done! All tables created ✅
