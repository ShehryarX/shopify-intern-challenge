const graphql = require("graphql");
const _ = require("lodash");
const Product = require("../models/Product");
const ShoppingCart = require("../models/ShoppingCart");

const {
  GraphQLObjectType,
  GraphQLString,
  GraphQLFloat,
  GraphQLInt,
  GraphQLSchema,
  GraphQLID,
  GraphQLList,
  GraphQLNonNull
} = graphql;

// dummy data
let products = [
  { id: "1", title: "Google Pixel XL", price: 299.99, inventoryCount: 19 },
  { id: "2", title: "Macbook Pro 2018", price: 1299.99, inventoryCount: 2 },
  { id: "3", title: "Fitbit Versa", price: 155.49, inventoryCount: 39 }
];

let shoppingCarts = [
  { id: "1", numberOfItems: 2, products: ["1"], totalPrice: 2.99 },
  { id: "2", numberOfItems: 1, products: ["1", "2", "3"], totalPrice: 24.99 },
  { id: "3", numberOfItems: 30, products: ["3"], totalPrice: 26.99 }
];

const ProductType = new GraphQLObjectType({
  name: "Product",
  fields: () => ({
    id: {
      type: GraphQLID
    },
    title: {
      type: GraphQLString
    },
    price: {
      type: GraphQLFloat
    },
    inventoryCount: {
      type: GraphQLInt
    }
  })
});

const ShoppingCartType = new GraphQLObjectType({
  name: "ShoppingCart",
  fields: () => ({
    id: {
      type: GraphQLID
    },
    products: {
      type: new GraphQLList(ProductType),
      resolve(parent, args) {
        let found = [];
        parent.products.forEach(productId => {
          let res = Product.findById(productId);
          found.push(res);
        });

        return found;
      }
    },
    numberOfItems: {
      type: GraphQLInt
    },
    totalPrice: {
      type: GraphQLFloat
    }
  })
});

const RootQuery = new GraphQLObjectType({
  name: "RootQueryType",
  fields: {
    product: {
      type: ProductType,
      args: {
        id: {
          type: GraphQLID
        }
      },
      resolve(parent, args) {
        const { id } = args;
        return Product.findById(id);
      }
    },
    shoppingCart: {
      type: ShoppingCartType,
      args: {
        id: {
          type: GraphQLID
        }
      },
      resolve(parent, args) {
        const { id } = args;
        return ShoppingCart.findById(id);
      }
    },
    products: {
      type: new GraphQLList(ProductType),
      resolve(parent, args) {
        return Product.find();
      }
    },
    availableProducts: {
      type: new GraphQLList(ProductType),
      resolve(parent, args) {
        return Product.find()
          .where("inventoryCount")
          .gt(0);
      }
    },
    shoppingCarts: {
      type: new GraphQLList(ShoppingCartType),
      resolve(parent, args) {
        return ShoppingCart.find();
      }
    }
  }
});

const Mutation = new GraphQLObjectType({
  name: "Mutation",
  fields: {
    addProduct: {
      type: ProductType,
      args: {
        title: { type: GraphQLNonNull(GraphQLString) },
        price: { type: GraphQLNonNull(GraphQLFloat) },
        inventoryCount: { type: GraphQLNonNull(GraphQLInt) }
      },
      resolve(parent, args) {
        const { title, price, inventoryCount } = args;
        let product = new Product({
          title,
          price,
          inventoryCount
        });
        return product.save();
      }
    },
    addShoppingCart: {
      type: ShoppingCartType,
      args: {},
      resolve(parent, args) {
        let shoppingCart = new ShoppingCart({
          numberOfItems: 0,
          totalPrice: 0,
          products: []
        });
        return shoppingCart.save();
      }
    },
    addProductToShoppingCart: {
      type: ShoppingCartType,
      args: {
        productId: { type: GraphQLNonNull(GraphQLID) },
        shoppingCartId: { type: GraphQLNonNull(GraphQLID) }
      },
      resolve(parent, args) {
        const { productId, shoppingCartId } = args;
        return new Promise((resolve, reject) => {
          Product.findById(productId).then(product => {
            if (product) {
              ShoppingCart.findById(shoppingCartId).then(shoppingCart => {
                let deductions = 0;

                // count how many products are in cart
                for (let i = 0; i < shoppingCart.products.length; i++) {
                  if (shoppingCart.products[i].id === productId) ++deductions;
                }

                if (product.inventoryCount - deductions <= 0) {
                  return reject("Product inventory has ran out");
                }

                if (shoppingCart) {
                  shoppingCart.numberOfItems++;
                  shoppingCart.totalPrice += product.price;
                  shoppingCart.products.push(productId);

                  const { numberOfItems, totalPrice, products } = shoppingCart;

                  shoppingCart
                    .update({
                      numberOfItems,
                      totalPrice,
                      products
                    })
                    .then(res => resolve(shoppingCart));
                  return resolve(shoppingCart);
                } else {
                  return reject("Shopping cart not found");
                }
              });
            } else {
              return reject("Product not found");
            }
          });
        });
      }
    },
    checkoutShoppingCart: {
      type: ShoppingCartType,
      args: {
        shoppingCartId: { type: GraphQLNonNull(GraphQLID) }
      },
      resolve(parent, args) {
        const { shoppingCartId } = args;

        return new Promise((resolve, reject) => {
          ShoppingCart.findById(shoppingCartId).then(shoppingCart => {
            if (shoppingCart) {
              let promises = [];

              let productInfo = {};

              shoppingCart.products.forEach(productId => {
                const { _id } = productId;
                if (!productInfo[_id]) {
                  productInfo[_id] = 0;
                }
                productInfo[_id]++;
              });

              let keys = Object.keys(productInfo);

              for (let i = 0; i < keys.length; i++) {
                let key = keys[i];
                let count = productInfo[key];
                promises.push(
                  Product.findById(key).then(product => {
                    const { inventoryCount } = product;
                    if (inventoryCount >= count) {
                      product
                        .update({
                          inventoryCount: inventoryCount - count
                        })
                        .then(() => console.log("Removed inventory"));
                    }
                  })
                );
              }

              Promise.all(promises).then(() => {
                shoppingCart.numberOfItems = 0;
                shoppingCart.totalPrice = 0;
                shoppingCart.products = [];

                shoppingCart
                  .update({
                    numberOfItems: 0,
                    totalPrice: 0,
                    products: []
                  })
                  .then(res => resolve(shoppingCart));
              });
            } else {
              return reject("Shopping cart not found");
            }
          });
        });
      }
    }
  }
});

module.exports = new GraphQLSchema({ query: RootQuery, mutation: Mutation });
