const primaryColors = ["Red", "Blue", "Green", "Orange", "Yellow"];

const products = [
    {
        id: "tie-dye-tshirt",
        name: "Tie Dye T-shirt",
        category: "Shirt",
        priceCents: 1200,
        shortName: "TEE",
        description: "A handmade cotton tie-dye tee. Every pattern is one of a kind.",
        sizes: ["S", "M", "L", "XL"],
        colors: primaryColors,
        inventory: { S: 3, M: 5, L: 10, XL: 6 }
    },
    {
        id: "tie-dye-tote-bag",
        name: "Tie Dye Tote Bag",
        category: "Bag",
        priceCents: 2000,
        shortName: "TOTE",
        description: "A hand-dyed tote for groceries, beach trips, school, and everyday errands.",
        sizes: ["One size"],
        colors: ["One of a kind"],
        inventory: { "One size": 4 }
    },
    {
        id: "tie-dye-drawstring-bag",
        name: "Tie Dye Drawstring Bag",
        category: "Bag",
        priceCents: 1800,
        shortName: "DRAW",
        description: "A lightweight, hand-dyed drawstring bag for the gym, school, or day trips.",
        sizes: ["One size"],
        colors: ["One of a kind"],
        inventory: { "One size": 4 }
    },
    {
        id: "tie-dye-makeup-bag",
        name: "Tie Dye Makeup Bag",
        category: "Bag",
        priceCents: 1500,
        shortName: "POUCH",
        description: "A one-of-a-kind travel pouch that keeps cosmetics organized on the go.",
        sizes: ["One size"],
        colors: ["One of a kind"],
        inventory: { "One size": 4 }
    }
];

module.exports = { primaryColors, products };
