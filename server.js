require("dotenv").config();

const path = require("path");
const cors = require("cors");
const express = require("express");
const { initDatabase, listProducts, createOrder, getOrder, listOrders } = require("./backend/database");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "200kb" }));

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
        contact: cleanText(body?.customer?.contact, 180),
        notes: cleanText(body?.customer?.notes, 500)
    };

    if (!customer.name || !customer.contact) {
        const error = new Error("Name and contact are required.");
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
        if (!productId || !size || !color) {
            const error = new Error("Each item needs a product, size, and color.");
            error.statusCode = 400;
            throw error;
        }

        return { productId, size, color, quantity };
    });

    return { customer, items };
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
        database: Boolean(process.env.DATABASE_URL)
    });
});

app.get("/api/products", async (req, res, next) => {
    try {
        res.json({ products: await listProducts() });
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
        error: statusCode === 500 ? "Something went wrong saving that order." : error.message
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
