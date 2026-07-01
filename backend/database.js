const fs = require("fs/promises");
const path = require("path");
const { Pool } = require("pg");
const { products } = require("./catalog");

const connectionString = process.env.DATABASE_URL;
const dataDirectory = process.env.DATA_DIR || path.join(__dirname, "..", ".data");
const fileStorePath = path.join(dataDirectory, "orders.json");
const catalogProductById = new Map(products.map((product) => [product.id, product]));
const reservationMinutes = 31;
let fileMutationQueue = Promise.resolve();

const pool = connectionString
    ? new Pool({
        connectionString,
        ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
    })
    : null;

function defaultStore() {
    return { nextOrderId: 1, orders: [] };
}

function stockError(productName, size, remaining) {
    const label = size === "One size" ? productName : `${productName} (${size})`;
    const error = new Error(remaining > 0
        ? `Only ${remaining} left for ${label}.`
        : `${label} is sold out.`);
    error.statusCode = 409;
    return error;
}

function isInventoryHeld(order, now = Date.now()) {
    if (order.status === "paid") return true;
    return ["checkout_pending", "checkout_started"].includes(order.status)
        && new Date(order.inventoryExpiresAt || 0).getTime() > now;
}

function inventoryKey(productId, size) {
    return `${productId}\u0000${size}`;
}

function inventoryUsedByFileOrders(orders) {
    const used = new Map();
    for (const order of orders) {
        if (!isInventoryHeld(order)) continue;
        for (const item of order.items || []) {
            const key = inventoryKey(item.productId, item.size);
            used.set(key, (used.get(key) || 0) + Number(item.quantity));
        }
    }
    return used;
}

async function readFileStore() {
    try {
        const store = JSON.parse(await fs.readFile(fileStorePath, "utf8"));
        return Array.isArray(store.orders)
            ? { nextOrderId: Number(store.nextOrderId) || 1, orders: store.orders }
            : defaultStore();
    } catch (error) {
        if (error.code === "ENOENT") return defaultStore();
        throw error;
    }
}

async function writeFileStore(store) {
    await fs.mkdir(dataDirectory, { recursive: true });
    const temporaryPath = `${fileStorePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`);
    await fs.rename(temporaryPath, fileStorePath);
}

function mutateFileStore(mutator) {
    const operation = fileMutationQueue.then(async () => {
        const store = await readFileStore();
        const result = await mutator(store);
        await writeFileStore(store);
        return result;
    });
    fileMutationQueue = operation.catch(() => undefined);
    return operation;
}

function buildOrderItems(payload, productMap = catalogProductById) {
    return payload.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) {
            const error = new Error(`Unknown product: ${item.productId}`);
            error.statusCode = 400;
            throw error;
        }
        const priceCents = Number(product.priceCents ?? product.price_cents);
        const quantity = Number(item.quantity);
        return {
            productId: product.id,
            productName: product.name,
            size: item.size,
            color: item.color,
            quantity,
            unitPriceCents: priceCents,
            lineTotalCents: priceCents * quantity
        };
    });
}

function requestedInventory(items) {
    const requested = new Map();
    for (const item of items) {
        const key = inventoryKey(item.productId, item.size);
        requested.set(key, (requested.get(key) || 0) + item.quantity);
    }
    return requested;
}

async function createFileOrder(payload) {
    const orderItems = buildOrderItems(payload);
    return mutateFileStore((store) => {
        const used = inventoryUsedByFileOrders(store.orders);
        for (const [key, quantity] of requestedInventory(orderItems)) {
            const [productId, size] = key.split("\u0000");
            const product = catalogProductById.get(productId);
            const remaining = Number(product.inventory[size]) - (used.get(key) || 0);
            if (quantity > remaining) throw stockError(product.name, size, Math.max(remaining, 0));
        }

        const subtotalCents = orderItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
        const order = {
            id: store.nextOrderId,
            customerName: payload.customer.name,
            customerContact: payload.customer.contact,
            customerNotes: payload.customer.notes || null,
            subtotalCents,
            status: "checkout_pending",
            stripeCheckoutSessionId: null,
            stripePaymentIntentId: null,
            inventoryExpiresAt: new Date(Date.now() + reservationMinutes * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            items: orderItems
        };
        store.nextOrderId = order.id + 1;
        store.orders.push(order);
        return {
            id: order.id,
            subtotalCents,
            status: order.status,
            inventoryExpiresAt: order.inventoryExpiresAt,
            createdAt: order.createdAt,
            items: order.items
        };
    });
}

async function initDatabase() {
    if (!pool) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
            active BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS product_inventory (
            product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            size TEXT NOT NULL,
            stock_limit INTEGER NOT NULL CHECK (stock_limit >= 0),
            PRIMARY KEY (product_id, size)
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
    `);
    await pool.query(`
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventory_expires_at TIMESTAMPTZ;
        ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'checkout_pending';
        CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
        CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
        CREATE INDEX IF NOT EXISTS orders_stripe_session_idx ON orders(stripe_checkout_session_id)
            WHERE stripe_checkout_session_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS orders_inventory_idx ON orders(status, inventory_expires_at);
    `);

    for (const product of products) {
        await pool.query(`
            INSERT INTO products (id, name, category, price_cents, active, updated_at)
            VALUES ($1, $2, $3, $4, TRUE, NOW())
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category,
                price_cents = EXCLUDED.price_cents, active = TRUE, updated_at = NOW()
        `, [product.id, product.name, product.category, product.priceCents]);
        for (const [size, limit] of Object.entries(product.inventory)) {
            await pool.query(`
                INSERT INTO product_inventory (product_id, size, stock_limit)
                VALUES ($1, $2, $3)
                ON CONFLICT (product_id, size) DO UPDATE SET stock_limit = EXCLUDED.stock_limit
            `, [product.id, size, limit]);
        }
        await pool.query(`DELETE FROM product_inventory WHERE product_id = $1 AND NOT (size = ANY($2))`,
            [product.id, Object.keys(product.inventory)]);
    }
    await pool.query(`UPDATE products SET active = FALSE, updated_at = NOW() WHERE NOT (id = ANY($1))`,
        [products.map((product) => product.id)]);
}

function publicProduct(product, remainingBySize) {
    return {
        id: product.id,
        name: product.name,
        category: product.category,
        priceCents: product.priceCents,
        shortName: product.shortName,
        description: product.description,
        sizes: product.sizes,
        colors: product.colors,
        stockRemaining: Object.fromEntries(product.sizes.map((size) => [size,
            Math.max(0, Number(product.inventory[size]) - (remainingBySize.get(inventoryKey(product.id, size)) || 0))]))
    };
}

async function listProducts() {
    if (!pool) {
        const used = inventoryUsedByFileOrders((await readFileStore()).orders);
        return products.map((product) => publicProduct(product, used));
    }
    const result = await pool.query(`
        SELECT oi.product_id, oi.size, COALESCE(SUM(oi.quantity), 0)::INTEGER AS used
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status = 'paid'
           OR (o.status IN ('checkout_pending', 'checkout_started') AND o.inventory_expires_at > NOW())
        GROUP BY oi.product_id, oi.size
    `);
    const used = new Map(result.rows.map((row) => [inventoryKey(row.product_id, row.size), row.used]));
    return products.map((product) => publicProduct(product, used));
}

async function createOrder(payload) {
    if (!pool) return createFileOrder(payload);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const ids = [...new Set(payload.items.map((item) => item.productId))];
        const productResult = await client.query(`
            SELECT id, name, price_cents FROM products
            WHERE active = TRUE AND id = ANY($1) ORDER BY id FOR UPDATE
        `, [ids]);
        const productMap = new Map(productResult.rows.map((product) => [product.id, product]));
        const orderItems = buildOrderItems(payload, productMap);

        for (const [key, quantity] of requestedInventory(orderItems)) {
            const [productId, size] = key.split("\u0000");
            const inventoryResult = await client.query(`
                SELECT pi.stock_limit - COALESCE(SUM(CASE
                    WHEN o.status = 'paid' OR (o.status IN ('checkout_pending', 'checkout_started')
                        AND o.inventory_expires_at > NOW()) THEN oi.quantity ELSE 0 END), 0)::INTEGER AS remaining
                FROM product_inventory pi
                LEFT JOIN order_items oi ON oi.product_id = pi.product_id AND oi.size = pi.size
                LEFT JOIN orders o ON o.id = oi.order_id
                WHERE pi.product_id = $1 AND pi.size = $2
                GROUP BY pi.stock_limit
            `, [productId, size]);
            const product = catalogProductById.get(productId);
            const remaining = Number(inventoryResult.rows[0]?.remaining ?? 0);
            if (quantity > remaining) throw stockError(product.name, size, Math.max(remaining, 0));
        }

        const subtotalCents = orderItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
        const orderResult = await client.query(`
            INSERT INTO orders (customer_name, customer_contact, customer_notes, subtotal_cents, inventory_expires_at)
            VALUES ($1, $2, $3, $4, NOW() + INTERVAL '${reservationMinutes} minutes')
            RETURNING id, subtotal_cents AS "subtotalCents", status,
                inventory_expires_at AS "inventoryExpiresAt", created_at AS "createdAt"
        `, [payload.customer.name, payload.customer.contact, payload.customer.notes || null, subtotalCents]);
        const order = orderResult.rows[0];
        for (const item of orderItems) {
            await client.query(`
                INSERT INTO order_items
                    (order_id, product_id, product_name, size, color, quantity, unit_price_cents, line_total_cents)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [order.id, item.productId, item.productName, item.size, item.color,
                item.quantity, item.unitPriceCents, item.lineTotalCents]);
        }
        await client.query("COMMIT");
        return { ...order, items: orderItems };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function updateFileOrder(orderId, updater) {
    return mutateFileStore((store) => {
        const order = store.orders.find((entry) => String(entry.id) === String(orderId));
        if (!order) return null;
        updater(order);
        return { id: order.id, status: order.status, subtotalCents: order.subtotalCents };
    });
}

async function attachStripeSession(orderId, sessionId) {
    if (!pool) return updateFileOrder(orderId, (order) => {
        order.stripeCheckoutSessionId = sessionId;
        order.status = "checkout_started";
    });
    const result = await pool.query(`
        UPDATE orders SET stripe_checkout_session_id = $2, status = 'checkout_started'
        WHERE id = $1 RETURNING id, subtotal_cents AS "subtotalCents", status
    `, [orderId, sessionId]);
    return result.rows[0] || null;
}

async function releaseOrder(orderId, status = "canceled") {
    if (!pool) return updateFileOrder(orderId, (order) => {
        if (order.status !== "paid") order.status = status;
    });
    const result = await pool.query(`
        UPDATE orders SET status = $2 WHERE id = $1 AND status <> 'paid'
        RETURNING id, subtotal_cents AS "subtotalCents", status
    `, [orderId, status]);
    return result.rows[0] || null;
}

async function releaseOrderBySession(sessionId) {
    if (!pool) {
        return mutateFileStore((store) => {
            const order = store.orders.find((entry) => entry.stripeCheckoutSessionId === sessionId);
            if (!order || order.status === "paid") return null;
            order.status = "expired";
            return { id: order.id, status: order.status };
        });
    }
    const result = await pool.query(`
        UPDATE orders SET status = 'expired'
        WHERE stripe_checkout_session_id = $1 AND status <> 'paid'
        RETURNING id, status
    `, [sessionId]);
    return result.rows[0] || null;
}

async function markOrderPaidBySession(sessionId, paymentIntentId, customer = {}) {
    if (!pool) {
        return mutateFileStore((store) => {
            const order = store.orders.find((entry) => entry.stripeCheckoutSessionId === sessionId);
            if (!order) return null;
            order.status = "paid";
            order.stripePaymentIntentId = paymentIntentId || null;
            if (customer.name) order.customerName = customer.name;
            if (customer.contact) order.customerContact = customer.contact;
            return { id: order.id, subtotalCents: order.subtotalCents, status: order.status };
        });
    }
    const result = await pool.query(`
        UPDATE orders SET status = 'paid', stripe_payment_intent_id = $2,
            customer_name = COALESCE(NULLIF($3, ''), customer_name),
            customer_contact = COALESCE(NULLIF($4, ''), customer_contact)
        WHERE stripe_checkout_session_id = $1
        RETURNING id, subtotal_cents AS "subtotalCents", status
    `, [sessionId, paymentIntentId || null, customer.name || "", customer.contact || ""]);
    return result.rows[0] || null;
}

async function getOrder(id) {
    if (!pool) {
        const order = (await readFileStore()).orders.find((entry) => String(entry.id) === String(id));
        return order ? { ...order } : null;
    }
    const orderResult = await pool.query(`
        SELECT id, customer_name AS "customerName", customer_contact AS "customerContact",
            customer_notes AS "customerNotes", subtotal_cents AS "subtotalCents", status,
            inventory_expires_at AS "inventoryExpiresAt", created_at AS "createdAt"
        FROM orders WHERE id = $1
    `, [id]);
    if (!orderResult.rowCount) return null;
    const itemsResult = await pool.query(`
        SELECT product_id AS "productId", product_name AS "productName", size, color, quantity,
            unit_price_cents AS "unitPriceCents", line_total_cents AS "lineTotalCents"
        FROM order_items WHERE order_id = $1 ORDER BY id
    `, [id]);
    return { ...orderResult.rows[0], items: itemsResult.rows };
}

async function listOrders(limit = 50) {
    if (!pool) {
        return (await readFileStore()).orders.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit).map(({ id, customerName, customerContact, subtotalCents, status, createdAt }) =>
                ({ id, customerName, customerContact, subtotalCents, status, createdAt }));
    }
    const result = await pool.query(`
        SELECT id, customer_name AS "customerName", customer_contact AS "customerContact",
            subtotal_cents AS "subtotalCents", status, created_at AS "createdAt"
        FROM orders ORDER BY created_at DESC LIMIT $1
    `, [limit]);
    return result.rows;
}

module.exports = {
    initDatabase,
    listProducts,
    createOrder,
    attachStripeSession,
    releaseOrder,
    releaseOrderBySession,
    markOrderPaidBySession,
    getOrder,
    listOrders
};
