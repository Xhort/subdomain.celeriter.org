require("dotenv").config();

const path = require("path");
const cors = require("cors");
const express = require("express");
const {
    initDatabase,
    listProducts,
    createOrder,
    attachStripeSession,
    markOrderPaidBySession,
    getOrder,
    listOrders
} = require("./backend/database");
const { primaryColors, products } = require("./backend/catalog");

const app = express();
const port = process.env.PORT || 3000;
const productById = new Map(products.map((product) => [product.id, product]));

app.use(cors());

function getStripe() {
    if (!process.env.STRIPE_SECRET_KEY) {
        const error = new Error("STRIPE_SECRET_KEY is not configured.");
        error.statusCode = 503;
        throw error;
    }

    const stripe = require("stripe");
    return stripe(process.env.STRIPE_SECRET_KEY);
}

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res, next) => {
    try {
        if (!process.env.STRIPE_WEBHOOK_SECRET) {
            const error = new Error("STRIPE_WEBHOOK_SECRET is not configured.");
            error.statusCode = 503;
            throw error;
        }

        const event = getStripe().webhooks.constructEvent(
            req.body,
            req.get("stripe-signature"),
            process.env.STRIPE_WEBHOOK_SECRET
        );

        if (event.type === "checkout.session.completed") {
            const session = event.data.object;
            await markOrderPaidBySession(session.id, session.payment_intent);
        }

        res.json({ received: true });
    } catch (error) {
        next(error);
    }
});

app.use(express.json({ limit: "200kb" }));
app.use("/assets", express.static(path.join(__dirname, "assets")));

const publicFiles = new Map([
    ["/", "index.html"],
    ["/index.html", "index.html"],
    ["/styles.css", "styles.css"],
    ["/script.js", "script.js"]
]);

app.get([...publicFiles.keys()], (req, res) => {
    res.sendFile(path.join(__dirname, publicFiles.get(req.path)));
});

function cleanText(value, maxLength) {
    return String(value || "").trim().slice(0, maxLength);
}

function validateOrder(body) {
    const customer = {
        name: cleanText(body?.customer?.name, 120),
        contact: cleanText(body?.customer?.email || body?.customer?.contact, 180),
        notes: cleanText(body?.customer?.notes, 500)
    };

    if (!customer.name || !customer.contact) {
        const error = new Error("Name and email are required.");
        error.statusCode = 400;
        throw error;
    }

    if (!Array.isArray(body?.items) || body.items.length === 0) {
        const error = new Error("Your bag is empty.");
        error.statusCode = 400;
        throw error;
    }

    const items = body.items.map((item) => {
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
            const error = new Error("Each item needs a quantity from 1 to 99.");
            error.statusCode = 400;
            throw error;
        }

        const productId = cleanText(item.productId, 80);
        const size = cleanText(item.size, 80);
        const color = cleanText(item.color, 120);
        const product = productById.get(productId);

        if (!product) {
            const error = new Error(`Unknown product: ${productId}`);
            error.statusCode = 400;
            throw error;
        }

        if (!product.sizes.includes(size)) {
            const error = new Error(`${product.name} is not available in size ${size}.`);
            error.statusCode = 400;
            throw error;
        }

        if (!primaryColors.includes(color)) {
            const error = new Error(`${color} is not an available color.`);
            error.statusCode = 400;
            throw error;
        }

        return { productId, size, color, quantity };
    });

    return { customer, items };
}

function getPublicUrl(req) {
    return process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
}

function requireAdmin(req, res, next) {
    const configuredToken = process.env.ADMIN_TOKEN;
    const providedToken = req.get("x-admin-token");

    if (!configuredToken || providedToken !== configuredToken) {
        return res.status(401).json({ error: "Admin access is required." });
    }

    next();
}

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        database: Boolean(process.env.DATABASE_URL),
        stripe: Boolean(process.env.STRIPE_SECRET_KEY)
    });
});

app.get("/api/products", async (req, res, next) => {
    try {
        res.json({
            colors: primaryColors,
            products: await listProducts()
        });
    } catch (error) {
        next(error);
    }
});

app.post("/api/orders", async (req, res, next) => {
    try {
        const payload = validateOrder(req.body);
        const order = await createOrder(payload);
        res.status(201).json({ order });
    } catch (error) {
        next(error);
    }
});

app.post("/api/checkout", async (req, res, next) => {
    try {
        const payload = validateOrder(req.body);
        const order = await createOrder(payload);
        const publicUrl = getPublicUrl(req);

        const session = await getStripe().checkout.sessions.create({
            mode: "payment",
            customer_email: payload.customer.contact,
            line_items: order.items.map((item) => ({
                quantity: item.quantity,
                price_data: {
                    currency: "usd",
                    unit_amount: item.unitPriceCents,
                    product_data: {
                        name: item.productName,
                        description: `${item.color} primary color, ${item.size}. Handmade pattern will vary.`
                    }
                }
            })),
            metadata: {
                orderId: String(order.id)
            },
            payment_intent_data: {
                metadata: {
                    orderId: String(order.id)
                }
            },
            success_url: `${publicUrl}/?checkout=success&order=${order.id}`,
            cancel_url: `${publicUrl}/?checkout=canceled&order=${order.id}`
        });

        await attachStripeSession(order.id, session.id);
        res.status(201).json({ orderId: order.id, url: session.url });
    } catch (error) {
        next(error);
    }
});

app.get("/api/admin/orders", requireAdmin, async (req, res, next) => {
    try {
        const requestedLimit = Number(req.query.limit) || 50;
        const limit = Math.min(Math.max(requestedLimit, 1), 100);
        res.json({ orders: await listOrders(limit) });
    } catch (error) {
        next(error);
    }
});

app.get("/api/admin/orders/:id", requireAdmin, async (req, res, next) => {
    try {
        const order = await getOrder(req.params.id);
        if (!order) {
            return res.status(404).json({ error: "Order not found." });
        }
        res.json({ order });
    } catch (error) {
        next(error);
    }
});

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, req, res, next) => {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
        error: statusCode === 500 ? "Something went wrong. Please try again." : error.message
    });
});

initDatabase()
    .then(() => {
        app.listen(port, () => {
            console.log(`Drip Dye storefront running on port ${port}`);
        });
    })
    .catch((error) => {
        console.error("Database setup failed:", error);
        process.exit(1);
    });
