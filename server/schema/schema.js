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

const ProductType = new GraphQLObjectType({
  name: "Product",
  fields: () => ({
    id: {
      type: GraphQLID,
      description: "Unique GraphQLID generated by mongoose"
    },
    title: {
      type: GraphQLString,
      description: "Title"
    },
    price: {
      type: GraphQLFloat,
      description: "Price for one unit in CAD"
    },
    inventoryCount: {
      type: GraphQLInt,
      description: "Current inventory count"
    }
  })
});

const ShoppingCartType = new GraphQLObjectType({
  name: "ShoppingCart",
  fields: () => ({
    id: {
      type: GraphQLID,
      description: "Unique GraphQLID generated by mongoose"
    },
    products: {
      type: new GraphQLList(ProductType),
      description: "Array of products stored as GraphQLID types",
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
      description: "Number of items currently in cart",
      type: GraphQLInt
    },
    totalPrice: {
      description: "Subtotal in CAD",
      type: GraphQLFloat
    }
  })
});
const RootQuery = new GraphQLObjectType({
  name: "RootQueryType",
  fields: {
    product: {
      description: "Returns Product object",
      type: ProductType,
      args: {
        id: {
          type: GraphQLID,
          description: "The GraphQLID of a product"
        }
      },
      resolve(parent, args) {
        const { id } = args;
        return Product.findById(id);
      }
    },
    shoppingCart: {
      type: ShoppingCartType,
      description: "Returns ShoppingCart object",
      args: {
        id: {
          type: GraphQLID,
          description: "The GraphQLID of a shopping cart"
        }
      },
      resolve(parent, args) {
        const { id } = args;
        return ShoppingCart.findById(id);
      }
    },
    products: {
      description: "Returns list of all products",
      type: new GraphQLList(ProductType),
      resolve(parent, args) {
        return Product.find();
      }
    },
    availableProducts: {
      description: "Returns list of all available products",
      type: new GraphQLList(ProductType),
      resolve(parent, args) {
        return Product.find()
          .where("inventoryCount")
          .gt(0);
      }
    },
    shoppingCarts: {
      description: "Returns list of all shopping carts (admin feature)",
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
      description:
        "Adds new product products collection and returns added product upon success",
      type: ProductType,
      args: {
        title: { type: GraphQLNonNull(GraphQLString), description: "Title" },
        price: {
          type: GraphQLNonNull(GraphQLFloat),
          description: "Price in CAD"
        },
        inventoryCount: {
          type: GraphQLNonNull(GraphQLInt),
          description: "Current inventory count"
        }
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
      description:
        "Creates new shopping cart to shopping carts collection and returns added shopping cart upon success",
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
      description:
        "Adds product to shopping cart and returns updated shopping cart",
      type: ShoppingCartType,
      args: {
        productId: {
          type: GraphQLNonNull(GraphQLID),
          description: "The GraphQLID of the product"
        },
        shoppingCartId: {
          type: GraphQLNonNull(GraphQLID),
          description: "The GraphQLID of the shopping cart"
        }
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
      description:
        "Proceeds to checkout items in shopping cart and returns updated shopping cart upon success",
      type: ShoppingCartType,
      args: {
        shoppingCartId: {
          type: GraphQLNonNull(GraphQLID),
          description: "The GraphQLID of a shopping cart"
        }
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
