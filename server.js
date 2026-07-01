require("dotenv").config();

const crypto = require("crypto");
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
const isProduction = process.env.NODE_ENV === "production";
const paidCheckoutEvents = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded"
]);
let stripeClient;

/* ---------- Application-wide security and browser behavior ---------- */

app.disable("x-powered-by");

// Only trust a hosting provider's forwarded protocol when explicitly enabled.
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);

const allowedOrigins = new Set(
    [process.env.PUBLIC_URL, ...(process.env.ALLOWED_ORIGINS || "").split(",")]
        .filter(Boolean)
        .map((value) => {
            try {
                return new URL(value.trim()).origin;
            } catch {
                return "";
            }
        })
        .filter(Boolean)
);

// Same-origin requests work without CORS. This only opts in explicitly listed
// front ends, preventing unrelated sites from creating checkout sessions.
app.use(cors({
    origin(origin, callback) {
        callback(null, !origin || allowedOrigins.has(origin));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "X-Admin-Token"]
}));

app.use((req, res, next) => {
    res.set({
        "Content-Security-Policy": [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data:",
            "connect-src 'self'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'"
        ].join("; "),
        "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY"
    });
    next();
});

function getStripe() {
    if (!process.env.STRIPE_SECRET_KEY) {
        const error = new Error("STRIPE_SECRET_KEY is not configured.");
        error.statusCode = 503;
        throw error;
    }

    // Reuse one client so its internal HTTP connection pool can be reused too.
    if (!stripeClient) {
        const stripe = require("stripe");
        stripeClient = stripe(process.env.STRIPE_SECRET_KEY);
    }
    return stripeClient;
}

/*
 * Stripe requires the untouched request bytes to verify webhook signatures, so
 * this route must appear before the general JSON parser below.
 */
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

        if (paidCheckoutEvents.has(event.type)) {
            const session = event.data.object;
            // Some delayed payment methods complete checkout before payment clears.
            if (session.payment_status === "paid") {
                await markOrderPaidBySession(session.id, session.payment_intent);
            }
        }

        res.json({ received: true });
    } catch (error) {
        // Invalid signatures are client errors; a 400 tells Stripe not to treat
        // them as an unexplained server crash.
        if (!error.statusCode) error.statusCode = 400;
        next(error);
    }
});

app.use(express.json({ limit: "200kb" }));
app.use("/assets", express.static(path.join(__dirname, "assets"), {
    etag: true,
    maxAge: isProduction ? "7d" : 0
}));

const publicFiles = new Map([
    ["/", "index.html"],
    ["/index.html", "index.html"],
    ["/styles.css", "styles.css"],
    ["/script.js", "script.js"]
]);

app.get([...publicFiles.keys()], (req, res) => {
    // HTML is revalidated; versioned CSS/JS can be cached briefly for speed.
    const cacheControl = req.path.endsWith(".html") || req.path === "/"
        ? "no-cache"
        : "public, max-age=3600, must-revalidate";
    res.set("Cache-Control", cacheControl);
    res.sendFile(path.join(__dirname, publicFiles.get(req.path)));
});

function cleanText(value, maxLength) {
    // Reject arrays and objects instead of converting them to surprising strings.
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validateOrder(body) {
    const email = cleanText(body?.customer?.email || body?.customer?.contact, 180).toLowerCase();
    const customer = {
        name: cleanText(body?.customer?.name, 120),
        contact: email,
        notes: cleanText(body?.customer?.notes, 500)
    };

    if (!customer.name || !customer.contact) {
        const error = new Error("Name and email are required.");
        error.statusCode = 400;
        throw error;
    }

    // Browser validation is helpful, but the API must also validate direct calls.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.contact)) {
        const error = new Error("Enter a valid email address.");
        error.statusCode = 400;
        throw error;
    }

    if (!Array.isArray(body?.items) || body.items.length === 0) {
        const error = new Error("Your bag is empty.");
        error.statusCode = 400;
        throw error;
    }

    if (body.items.length > 20) {
        const error = new Error("A bag can contain at most 20 product options.");
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

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalQuantity > 99) {
        const error = new Error("A bag can contain at most 99 total items.");
        error.statusCode = 400;
        throw error;
    }

    return { customer, items };
}

function getPublicUrl(req) {
    if (process.env.PUBLIC_URL) {
        try {
            const publicUrl = new URL(process.env.PUBLIC_URL);
            if (!["http:", "https:"].includes(publicUrl.protocol)) throw new Error();
            return publicUrl.origin;
        } catch {
            const error = new Error("PUBLIC_URL must be a valid HTTP or HTTPS URL.");
            error.statusCode = 503;
            throw error;
        }
    }

    // Host headers are user-controlled, so production must use an explicit URL.
    if (isProduction) {
        const error = new Error("PUBLIC_URL is required in production.");
        error.statusCode = 503;
        throw error;
    }
    return `${req.protocol}://${req.get("host")}`;
}

function requireAdmin(req, res, next) {
    const configuredToken = process.env.ADMIN_TOKEN;
    const providedToken = req.get("x-admin-token");

    const hasMatchingLength = Boolean(
        configuredToken && providedToken && configuredToken.length === providedToken.length
    );
    const tokenMatches = hasMatchingLength && crypto.timingSafeEqual(
        Buffer.from(configuredToken),
        Buffer.from(providedToken)
    );

    if (!tokenMatches) {
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
        const publicUrl = getPublicUrl(req);
        const stripe = getStripe();
        const order = await createOrder(payload);

        const session = await stripe.checkout.sessions.create({
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
        if (!/^[1-9]\d*$/.test(req.params.id)) {
            return res.status(400).json({ error: "Order ID must be a positive number." });
        }
        const order = await getOrder(req.params.id);
        if (!order) {
            return res.status(404).json({ error: "Order not found." });
        }
        res.json({ order });
    } catch (error) {
        next(error);
    }
});

// Unknown API paths should return JSON rather than the storefront's HTML shell.
app.use("/api", (req, res) => {
    res.status(404).json({ error: "API route not found." });
});

app.get("*", (req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, req, res, next) => {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error(error);
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
