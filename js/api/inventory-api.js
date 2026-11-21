
/* =========================================
   THE HAVEN - INVENTORY API
   Stock queries and stock administration
========================================= */


/* READ FIRESTORE FIELD */

function getInventoryField(document, fieldName, fieldType, fallback = null) {

    if (!document || !document.fields ||
        !document.fields[fieldName]) {
        return fallback;
    }

    const value = document.fields[fieldName][fieldType];

    if (value === undefined || value === null) {
        return fallback;
    }

    if (fieldType === "integerValue" ||
        fieldType === "doubleValue") {
        return Number(value);
    }

    return value;
}


/* COMMON INVENTORY QUERY */

function runInventoryQuery(filters = [], pageSize = 100) {

    if (!Array.isArray(filters) ||
        !Number.isInteger(pageSize) ||
        pageSize < 1 || pageSize > 1000) {
        return Promise.reject(
            new Error("Invalid inventory query parameters.")
        );
    }

    const query = {
        from: [{ collectionId: "products" }],
        limit: pageSize
    };

    if (filters.length === 1) {
        query.where = filters[0];

    } else if (filters.length > 1) {
        query.where = {
            compositeFilter: {
                op: "AND",
                filters: filters
            }
        };
    }

    return firestoreRunQuery(
        query,
        requireToken(getAdminIdToken(), "Admin login required.")
    );

}


/* GET ALL INVENTORY */

function getAllInventory(pageSize = 100) {

    return runInventoryQuery([], pageSize);

}


/* GET CATEGORY-WISE INVENTORY */

function getInventoryByCategory(id, pageSize = 100) {

    if (!id) {
        return Promise.reject(
            new Error("Category ID required.")
        );
    }

    return runInventoryQuery([{
        fieldFilter: {
            field: { fieldPath: "categoryId" },
            op: "EQUAL",
            value: fsString(id)
        }
    }], pageSize);

}


/* HIGH STOCK: QUANTITY > 100 */

function getHighStockProducts(pageSize = 100) {

    return runInventoryQuery([{
        fieldFilter: {
            field: { fieldPath: "qty" },
            op: "GREATER_THAN",
            value: fsInt(100)
        }
    }], pageSize);

}


/* LOW STOCK: QUANTITY < 15 */

function getLowStockProducts(pageSize = 100) {

    return runInventoryQuery([{
        fieldFilter: {
            field: { fieldPath: "qty" },
            op: "LESS_THAN",
            value: fsInt(15)
        }
    }], pageSize);

}


/* UPDATE STOCK QUANTITY */

function updateStockQuantity(id, qty) {

    const quantity = Number(qty);

    if (!id || !Number.isInteger(quantity) || quantity < 0) {
        return Promise.reject(
            new Error(
                "Valid product ID and non-negative quantity required."
            )
        );
    }

    return firestoreRequest({

        path: `products/${encodeURIComponent(id)}`,
        method: "PATCH",

        token: requireToken(
            getAdminIdToken(),
            "Admin login required."
        ),

        data: {
            fields: {
                qty: fsInt(quantity),
                updatedAt: fsTimestamp()
            }
        },

        query: {
            "updateMask.fieldPaths": ["qty", "updatedAt"]
        }

    });

}


/* CHECK STOCK AVAILABILITY */

function checkStockAvailability(id, requested) {

    const requestedQuantity = Number(requested);

    if (!id ||
        !Number.isInteger(requestedQuantity) ||
        requestedQuantity <= 0) {

        return Promise.reject(
            new Error(
                "Valid product ID and positive quantity required."
            )
        );
    }

    return getProductById(id).then(document => {

        const availableQuantity = getInventoryField(
            document,
            "qty",
            "integerValue",
            0
        );

        const active = getInventoryField(
            document,
            "active",
            "booleanValue",
            false
        );

        return {
            productId: id,
            requestedQuantity: requestedQuantity,
            availableQuantity: availableQuantity,
            active: active,
            available:
                active && availableQuantity >= requestedQuantity
        };

    });

}
