const catalog = require("../catalog.json");

const products = catalog.products.map(({ variants, ...product }) => ({
    ...product,
    sizes: variants.map((variant) => variant.value),
    inventory: Object.fromEntries(
        variants.map((variant) => [variant.value, variant.usageLimit])
    )
}));

module.exports = { products };
