CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    customer_name TEXT NOT NULL,
    customer_contact TEXT NOT NULL,
    customer_notes TEXT,
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    status TEXT NOT NULL DEFAULT 'checkout_pending',
    stripe_checkout_session_id TEXT,
    stripe_payment_intent_id TEXT,
    inventory_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_inventory (
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size TEXT NOT NULL,
    stock_limit INTEGER NOT NULL CHECK (stock_limit >= 0),
    PRIMARY KEY (product_id, size)
);

CREATE TABLE IF NOT EXISTS order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    size TEXT NOT NULL,
    color TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0)
);

-- These indexes speed up the three lookups used by the order/admin code.
CREATE INDEX IF NOT EXISTS order_items_order_id_idx
    ON order_items(order_id);

CREATE INDEX IF NOT EXISTS orders_created_at_idx
    ON orders(created_at DESC);

CREATE INDEX IF NOT EXISTS orders_stripe_session_idx
    ON orders(stripe_checkout_session_id)
    WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_inventory_idx
    ON orders(status, inventory_expires_at);
