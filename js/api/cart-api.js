
/* =========================================
   THE HAVEN - CART API
   Customer-specific Firestore cart
========================================= */


/* COMMON CART PATH */

function cartPath(productId = null) {

    const uid = getCustomerUid();

    if (!uid) {
        throw new Error("Please login to access your cart.");
    }

    return `customers/${encodeURIComponent(uid)}/cart` +
        (productId
            ? "/" + encodeURIComponent(productId)
            : "");

}


/* ADD PRODUCT TO CART
   Existing product: increase quantity
   New product: create cart document
*/

function addToCart(productId, quantity = 1) {

    const requestedQuantity = Number(quantity);

    if (!productId ||
        !Number.isInteger(requestedQuantity) ||
        requestedQuantity <= 0) {

        return Promise.reject(
            new Error("Valid product ID and positive quantity required.")
        );
    }

    const token = requireToken(
        getCustomerIdToken(),
        "Please login to access your cart."
    );

    const path = cartPath(productId);

    return firestoreRequest({
        path: path,
        method: "GET",
        token: token
    })

    .then(document => {

        const existingQuantity = Number(
            document.fields?.quantity?.integerValue || 0
        );

        const newQuantity = existingQuantity + requestedQuantity;

        return firestoreRequest({

            path: path,
            method: "PATCH",
            token: token,

            data: {
                fields: {
                    productId: fsString(productId),
                    quantity: fsInt(newQuantity),
                    updatedAt: fsTimestamp()
                }
            },

            query: {
                "updateMask.fieldPaths": [
                    "productId",
                    "quantity",
                    "updatedAt"
                ]
            }

        });

    })

    .catch(error => {

        // Create a new cart document only when it does not exist.
        if (error.response?.status !== 404) {
            throw error;
        }

        return firestoreRequest({

            path: cartPath(),
            method: "POST",
            token: token,

            query: {
                documentId: productId
            },

            data: {
                fields: {
                    productId: fsString(productId),
                    quantity: fsInt(requestedQuantity),
                    addedAt: fsTimestamp()
                }
            }

        });

    });

}


/* GET CART ITEMS */

function getCartItems(pageSize = 100, pageToken = null) {

    if (!Number.isInteger(pageSize) ||
        pageSize < 1 || pageSize > 1000) {

        return Promise.reject(
            new Error("Page size must be between 1 and 1000.")
        );
    }

    const query = {
        pageSize: pageSize
    };

    if (pageToken) {
        query.pageToken = pageToken;
    }

    return firestoreRequest({

        path: cartPath(),
        method: "GET",
        token: requireToken(
            getCustomerIdToken(),
            "Please login to access your cart."
        ),
        query: query

    });

}


/* UPDATE CART QUANTITY */

function updateCartQuantity(id, quantity) {

    const updatedQuantity = Number(quantity);

    if (!id ||
        !Number.isInteger(updatedQuantity) ||
        updatedQuantity <= 0) {

        return Promise.reject(
            new Error("Valid product ID and positive quantity required.")
        );
    }

    return firestoreRequest({

        path: cartPath(id),
        method: "PATCH",

        token: requireToken(
            getCustomerIdToken(),
            "Please login to access your cart."
        ),

        data: {
            fields: {
                quantity: fsInt(updatedQuantity),
                updatedAt: fsTimestamp()
            }
        },

        query: {
            "updateMask.fieldPaths": [
                "quantity",
                "updatedAt"
            ]
        }

    });

}


/* REMOVE PRODUCT FROM CART */

function removeFromCart(id) {

    if (!id) {
        return Promise.reject(
            new Error("Product ID required.")
        );
    }

    return firestoreRequest({

        path: cartPath(id),
        method: "DELETE",

        token: requireToken(
            getCustomerIdToken(),
            "Please login to access your cart."
        )

    });

}


/* GET ALL CART ITEMS ACROSS PAGES */

function getAllCartItems() {

    const allDocuments = [];

    function fetchPage(pageToken = null) {

        return getCartItems(1000, pageToken)
            .then(response => {

                allDocuments.push(
                    ...(response.documents || [])
                );

                if (response.nextPageToken) {
                    return fetchPage(response.nextPageToken);
                }

                return allDocuments;

            });

    }

    return fetchPage();

}


/* CLEAR ENTIRE CART */

function clearCart() {

    return getAllCartItems()
        .then(documents => {

            return Promise.all(
                documents.map(document => {

                    const id = document.name.split("/").pop();

                    return removeFromCart(id);

                })
            );

        });

}
