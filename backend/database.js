const { Pool } = require("pg");
const { products } = require("./catalog");

const connectionString = process.env.DATABASE_URL;

const pool = connectionString
    ? new Pool({
        connectionString,
        ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
    })
    : null;

function requireDatabase() {
    if (!pool) {
        const error = new Error("DATABASE_URL is not configured.");
        error.statusCode = 503;
        throw error;
    }
    return pool;
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

        CREATE TABLE IF NOT EXISTS orders (
            id BIGSERIAL PRIMARY KEY,
            customer_name TEXT NOT NULL,
            customer_contact TEXT NOT NULL,
            customer_notes TEXT,
            subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
            status TEXT NOT NULL DEFAULT 'pending',
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

    for (const product of products) {
        await pool.query(
            `
                INSERT INTO products (id, name, category, price_cents, active, updated_at)
                VALUES ($1, $2, $3, $4, TRUE, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    category = EXCLUDED.category,
                    price_cents = EXCLUDED.price_cents,
                    active = TRUE,
                    updated_at = NOW()
            `,
            [product.id, product.name, product.category, product.priceCents]
        );
    }
}

async function listProducts() {
    const db = requireDatabase();
    const result = await db.query(`
        SELECT id, name, category, price_cents AS "priceCents"
        FROM products
        WHERE active = TRUE
        ORDER BY name
    `);
    return result.rows;
}

async function createOrder(payload) {
    const db = requireDatabase();
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        const ids = [...new Set(payload.items.map((item) => item.productId))];
        const productResult = await client.query(
            `
                SELECT id, name, price_cents
                FROM products
                WHERE active = TRUE AND id = ANY($1)
            `,
            [ids]
        );
        const productById = new Map(productResult.rows.map((product) => [product.id, product]));

        const orderItems = payload.items.map((item) => {
            const product = productById.get(item.productId);
            if (!product) {
                const error = new Error(`Unknown product: ${item.productId}`);
                error.statusCode = 400;
                throw error;
            }

            const quantity = Number(item.quantity);
            const lineTotalCents = product.price_cents * quantity;
            return {
                productId: product.id,
                productName: product.name,
                size: item.size,
                color: item.color,
                quantity,
                unitPriceCents: product.price_cents,
                lineTotalCents
            };
        });

        const subtotalCents = orderItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
        const orderResult = await client.query(
            `
                INSERT INTO orders (customer_name, customer_contact, customer_notes, subtotal_cents)
                VALUES ($1, $2, $3, $4)
                RETURNING id, subtotal_cents AS "subtotalCents", status, created_at AS "createdAt"
            `,
            [
                payload.customer.name,
                payload.customer.contact,
                payload.customer.notes || null,
                subtotalCents
            ]
        );

        const order = orderResult.rows[0];
        for (const item of orderItems) {
            await client.query(
                `
                    INSERT INTO order_items
                        (order_id, product_id, product_name, size, color, quantity, unit_price_cents, line_total_cents)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `,
                [
                    order.id,
                    item.productId,
                    item.productName,
                    item.size,
                    item.color,
                    item.quantity,
                    item.unitPriceCents,
                    item.lineTotalCents
                ]
            );
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

async function getOrder(id) {
    const db = requireDatabase();
    const orderResult = await db.query(
        `
            SELECT
                id,
                customer_name AS "customerName",
                customer_contact AS "customerContact",
                customer_notes AS "customerNotes",
                subtotal_cents AS "subtotalCents",
                status,
                created_at AS "createdAt"
            FROM orders
            WHERE id = $1
        `,
        [id]
    );

    if (orderResult.rowCount === 0) return null;

    const itemsResult = await db.query(
        `
            SELECT
                product_id AS "productId",
                product_name AS "productName",
                size,
                color,
                quantity,
                unit_price_cents AS "unitPriceCents",
                line_total_cents AS "lineTotalCents"
            FROM order_items
            WHERE order_id = $1
            ORDER BY id
        `,
        [id]
    );

    return { ...orderResult.rows[0], items: itemsResult.rows };
}

async function listOrders(limit = 50) {
    const db = requireDatabase();
    const result = await db.query(
        `
            SELECT
                id,
                customer_name AS "customerName",
                customer_contact AS "customerContact",
                subtotal_cents AS "subtotalCents",
                status,
                created_at AS "createdAt"
            FROM orders
            ORDER BY created_at DESC
            LIMIT $1
        `,
        [limit]
    );
    return result.rows;
}

module.exports = {
    initDatabase,
    listProducts,
    createOrder,
    getOrder,
    listOrders
};
