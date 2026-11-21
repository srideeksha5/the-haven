
/* =========================================
   THE HAVEN - PRODUCT API
   Product catalogue management
========================================= */


/* CREATE PRODUCT */

function createProduct(product) {

    const validation = validateRequiredFields(product, [
        "categoryId",
        "title",
        "description",
        "qty",
        "price"
    ]);

    if (!validation.valid) {
        return Promise.reject(
            new Error(validation.errors.join(" "))
        );
    }

    const qty = Number(product.qty);
    const price = Number(product.price);

    if (!Number.isInteger(qty) || qty < 0 ||
        !Number.isFinite(price) || price < 0) {
        return Promise.reject(
            new Error("Invalid quantity or price.")
        );
    }

    return firestoreRequest({

        path: "products",
        method: "POST",
        token: requireToken(getAdminIdToken(), "Admin login required."),

        data: {
            fields: {
                categoryId: fsString(product.categoryId),
                title: fsString(product.title.trim()),
                description: fsString(product.description.trim()),
                qty: fsInt(qty),
                price: fsDouble(price),
                imageUrl: fsString(product.imageUrl || ""),
                active: fsBool(true),
                createdAt: fsTimestamp()
            }
        }

    });

}



/* GET ALL PRODUCTS WITH PAGINATION */

function getProducts(pageSize = 10, pageToken = null) {

    const query = { pageSize };

    if (pageToken) {
        query.pageToken = pageToken;
    }

    return firestoreRequest({
        path: "products",
        method: "GET",
        query
    });

}


/* GET PRODUCT BY ID */

function getProductById(id) {

    if (!id) {
        return Promise.reject(
            new Error("Product ID required.")
        );
    }

    return firestoreRequest({
        path: `products/${encodeURIComponent(id)}`,
        method: "GET"
    });

}


/* GET PRODUCTS BY CATEGORY */

function getProductsByCategory(categoryId, pageSize = 10) {

    if (!categoryId) {
        return Promise.reject(
            new Error("Category ID required.")
        );
    }

    return firestoreRunQuery({

        from: [{ collectionId: "products" }],

        where: {
            fieldFilter: {
                field: { fieldPath: "categoryId" },
                op: "EQUAL",
                value: fsString(categoryId)
            }
        },

        limit: pageSize

    });

}


/* UPDATE PRODUCT */


function updateProduct(id, product) {

    if (!id) {
        return Promise.reject(
            new Error("Product ID required.")
        );
    }

    const validation = validateRequiredFields(product, [
        "categoryId",
        "title",
        "description",
        "qty",
        "price"
    ]);

    if (!validation.valid) {
        return Promise.reject(
            new Error(validation.errors.join(" "))
        );
    }

    const qty = Number(product.qty);
    const price = Number(product.price);

    if (!Number.isInteger(qty) || qty < 0 ||
        !Number.isFinite(price) || price < 0) {
        return Promise.reject(
            new Error("Invalid quantity or price.")
        );
    }

    const fields = {
        categoryId: fsString(product.categoryId),
        title: fsString(product.title.trim()),
        description: fsString(product.description.trim()),
        qty: fsInt(qty),
        price: fsDouble(price),
        imageUrl: fsString(product.imageUrl || ""),
        updatedAt: fsTimestamp()
    };

    return firestoreRequest({

        path: `products/${encodeURIComponent(id)}`,
        method: "PATCH",
        token: requireToken(getAdminIdToken(), "Admin login required."),

        data: { fields },

        query: {
            "updateMask.fieldPaths": Object.keys(fields)
        }

    });

}


/* ACTIVATE / DEACTIVATE PRODUCT */

function updateProductStatus(id, active) {

    if (!id || typeof active !== "boolean") {
        return Promise.reject(
            new Error("Valid product ID/status required.")
        );
    }

    return firestoreRequest({

        path: `products/${encodeURIComponent(id)}`,
        method: "PATCH",
        token: requireToken(getAdminIdToken(), "Admin login required."),

        data: {
            fields: {
                active: fsBool(active),
                updatedAt: fsTimestamp()
            }
        },

        query: {
            "updateMask.fieldPaths": ["active", "updatedAt"]
        }

    });

}


/* DELETE PRODUCT */

function deleteProduct(id) {

    if (!id) {
        return Promise.reject(
            new Error("Product ID required.")
        );
    }

    return firestoreRequest({
        path: `products/${encodeURIComponent(id)}`,
        method: "DELETE",
        token: requireToken(getAdminIdToken(), "Admin login required.")
    });

}
