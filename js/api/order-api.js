/* =========================================
   THE HAVEN - ORDER API
   Order management
========================================= */


/* READ FIRESTORE FIELD */

function readOrderField(document, fieldName, fieldType, fallback = null) {

    const value = document?.fields?.[fieldName]?.[fieldType];

    if (value === undefined || value === null) {
        return fallback;
    }

    if (fieldType === "integerValue" ||
        fieldType === "doubleValue") {
        return Number(value);
    }

    return value;
}


/* CONVERT ORDER ITEMS TO FIRESTORE FORMAT */

function serializeOrderItems(items) {

    return {
        arrayValue: {
            values: items.map(item => ({

                mapValue: {
                    fields: {
                        productId: fsString(item.productId),
                        title: fsString(item.title),
                        categoryId: fsString(item.categoryId),
                        quantity: fsInt(item.quantity),
                        unitPrice: fsDouble(item.unitPrice),
                        lineTotal: fsDouble(
                            item.quantity * item.unitPrice
                        )
                    }
                }

            }))
        }
    };

}


/* VALIDATE DELIVERY ADDRESS */

function validateOrderAddress(address) {

    const requiredFields = [
        "name",
        "mobile",
        "address",
        "city",
        "state",
        "pincode"
    ];

    if (!address || typeof address !== "object") {
        return false;
    }

    return requiredFields.every(field =>
        typeof address[field] === "string" &&
        address[field].trim().length > 0
    );

}


/* GET VERIFIED PRODUCT DETAILS */

function getVerifiedOrderItems(items) {

    return Promise.all(

        items.map(item => {

            if (
                !item.productId ||
                !Number.isInteger(Number(item.quantity)) ||
                Number(item.quantity) <= 0
            ) {
                throw new Error("Invalid order item.");
            }

            return getProductById(item.productId)
                .then(document => {

                    const product = {
                        productId: item.productId,
                        updateTime: document.updateTime,

                        title: readOrderField(
                            document,
                            "title",
                            "stringValue",
                            ""
                        ),

                        categoryId: readOrderField(
                            document,
                            "categoryId",
                            "stringValue",
                            ""
                        ),

                        unitPrice: readOrderField(
                            document,
                            "price",
                            "doubleValue",
                            0
                        ),

                        availableQuantity: readOrderField(
                            document,
                            "qty",
                            "integerValue",
                            0
                        ),

                        active: readOrderField(
                            document,
                            "active",
                            "booleanValue",
                            false
                        ),

                        quantity: Number(item.quantity)
                    };

                    if (!product.active) {
                        throw new Error(
                            product.title + " is currently unavailable."
                        );
                    }

                    if (product.availableQuantity < product.quantity) {
                        throw new Error(
                            "Insufficient stock for " + product.title + "."
                        );
                    }

                    if (!Number.isFinite(product.unitPrice) ||
                        product.unitPrice < 0) {
                        throw new Error(
                            "Invalid product price for " + product.title + "."
                        );
                    }

                    return product;

                });

        })

    );

}


/* CREATE ORDER */


/* =========================================
   ATOMIC FIRESTORE COMMIT
========================================= */

/* =========================================
   ATOMIC FIRESTORE COMMIT
   Retry once after customer token refresh
========================================= */

function commitOrderWrites(writes, token) {

    function sendCommit(idToken) {

        return axios.post(
            `${FIRESTORE_BASE_URL}:commit`,
            { writes: writes },
            {
                headers: {
                    Authorization: `Bearer ${idToken}`,
                    "Content-Type": "application/json"
                }
            }
        ).then(response => response.data);

    }

    return sendCommit(token).catch(function(error) {

        if (error?.response?.status !== 401) {
            throw error;
        }

        const currentToken =
            sessionStorage.getItem("havenCustomerToken");

        // Another request may already have refreshed the token.
        if (currentToken && currentToken !== token) {
            return sendCommit(currentToken);
        }

        const refreshToken =
            sessionStorage.getItem("havenCustomerRefreshToken");

        if (!refreshToken) {
            throw new Error(
                "Your session has expired. Please sign in again."
            );
        }

        return refreshAuthToken(refreshToken)
            .then(function(response) {

                if (!response.id_token) {
                    throw new Error(
                        "Unable to refresh your session. Please sign in again."
                    );
                }

                return sendCommit(response.id_token);

            });

    });

}

/* GENERATE ORDER ID */

function generateOrderId() {

    if (window.crypto && window.crypto.randomUUID) {
        return "HAVEN-" + window.crypto.randomUUID();
    }

    return "HAVEN-" +
        Date.now() + "-" +
        Math.random().toString(36).slice(2, 12);

}


/* =========================================
   CREATE ORDER AND DEDUCT STOCK ATOMICALLY
========================================= */

function createOrder(items, address, paymentMethod) {

    const uid = getCustomerUid();

    const token = requireToken(
        getCustomerIdToken(),
        "Please login before ordering."
    );

    if (!uid) {
        return Promise.reject(
            new Error("Please login before ordering.")
        );
    }

    if (!Array.isArray(items) || items.length === 0) {
        return Promise.reject(
            new Error("Order must contain items.")
        );
    }

    if (!validateOrderAddress(address)) {
        return Promise.reject(
            new Error("Please provide a complete delivery address.")
        );
    }

    if (!["CASH", "CREDIT"].includes(paymentMethod)) {
        return Promise.reject(
            new Error("Invalid payment method.")
        );
    }

    // Combine duplicate product IDs before stock validation.
    const combinedItems = {};

    items.forEach(item => {

        const productId = String(item.productId || "");
        const quantity = Number(item.quantity);

        if (
            !productId ||
            !Number.isSafeInteger(quantity) ||
            quantity <= 0
        ) {
            throw new Error("Invalid order item.");
        }

        combinedItems[productId] =
            (combinedItems[productId] || 0) + quantity;

    });

    const normalizedItems = Object.entries(combinedItems)
        .map(([productId, quantity]) => ({
            productId,
            quantity
        }));

    return getVerifiedOrderItems(normalizedItems)

        .then(verifiedItems => {

            const subtotal = verifiedItems.reduce(
                (sum, item) =>
                    sum + item.quantity * item.unitPrice,
                0
            );

            const deliveryFee = subtotal >= 999 ? 0 : 60;
            const totalAmount = subtotal + deliveryFee;

            const orderId = generateOrderId();

            const stockChanges = {};

            const writes = [];

            // Product stock updates.
            verifiedItems.forEach(item => {

                const productId = item.productId;

                const stockChange = item.quantity;

                stockChanges[productId] = {
                    integerValue: String(stockChange)
                };

                // getVerifiedOrderItems currently fetches product
                // data, but we need updateTime for atomic protection.
                writes.push({
                    update: {
                        name:
                            `${FIRESTORE_BASE_URL}/products/` +
                            encodeURIComponent(productId),

                        fields: {
                            qty: fsInt(
                                item.availableQuantity - item.quantity
                            ),

                            lastStockOrderId: fsString(orderId),

                            updatedAt: fsTimestamp()
                        }
                    },

                    updateMask: {
                        fieldPaths: [
                            "qty",
                            "lastStockOrderId",
                            "updatedAt"
                        ]
                    },

                    currentDocument: {
                        updateTime: item.updateTime
                    }
                });

            });

            const addressFields = {};

            [
                "name",
                "mobile",
                "address",
                "city",
                "state",
                "pincode"
            ].forEach(key => {

                addressFields[key] = fsString(
                    address[key].trim()
                );

            });

            // Create the order document in the same commit.
            writes.push({

                update: {

                    name:
                        `${FIRESTORE_BASE_URL}/orders/` +
                        encodeURIComponent(orderId),

                    fields: {

                        customerId: fsString(uid),

                        items: serializeOrderItems(verifiedItems),

                        stockChanges: {
                            mapValue: {
                                fields: stockChanges
                            }
                        },

                        shippingAddress: {
                            mapValue: {
                                fields: addressFields
                            }
                        },

                        subtotal: fsDouble(subtotal),

                        deliveryFee: fsDouble(deliveryFee),

                        totalAmount: fsDouble(totalAmount),

                        creditAmount: fsDouble(
                            paymentMethod === "CREDIT" ? totalAmount : 0
                        ),

                        paymentMethod: fsString(paymentMethod),

                        paymentStatus: fsString(
                            paymentMethod === "CASH"
                                ? "PENDING_COLLECTION"
                                : "PENDING_APPROVAL"
                        ),

                        orderStatus: fsString("PLACED"),

                        createdAt: fsTimestamp()

                    }

                },

                currentDocument: {
                    exists: false
                }

            });


            /* APPLY CREDIT AND COMMIT ORDER */

            const commitOrder = function () {

                return commitOrderWrites(writes, token)
                    .then(() => ({
                        name:
                            `${FIRESTORE_BASE_URL}/orders/` +
                            encodeURIComponent(orderId),

                        orderId: orderId,
                        totalAmount: totalAmount
                    }));

            };

            if (paymentMethod === "CASH") {
                return commitOrder();
            }

            return getCustomerProfile().then(customer => {

                const creditLimit = readOrderField(
                    customer,
                    "creditLimit",
                    "integerValue",
                    readOrderField(
                        customer,
                        "creditLimit",
                        "doubleValue",
                        0
                    )
                );

                const creditUsed = readOrderField(
                    customer,
                    "creditUsed",
                    "integerValue",
                    readOrderField(
                        customer,
                        "creditUsed",
                        "doubleValue",
                        0
                    )
                );

                if (!customer.updateTime) {
                    throw new Error(
                        "Customer credit information could not be verified."
                    );
                }

                if (
                    !Number.isFinite(creditLimit) ||
                    !Number.isFinite(creditUsed) ||
                    creditLimit < 0 ||
                    creditUsed < 0
                ) {
                    throw new Error(
                        "Invalid customer credit information."
                    );
                }

                const availableCredit = creditLimit - creditUsed;

                if (totalAmount > availableCredit) {
                    throw new Error(
                        `Insufficient credit. Available credit: ₹${Math.max(0, availableCredit).toFixed(2)}`
                    );
                }

                const updatedCreditUsed = creditUsed + totalAmount;


                // Update customer credit in the same atomic commit.
                writes.push({

                    update: {

                        name:
                            `${FIRESTORE_BASE_URL}/customers/` +
                            encodeURIComponent(uid),

                        fields: {

                            creditUsed: fsDouble(updatedCreditUsed),

                            lastCreditOrderId: fsString(orderId),

                            updatedAt: fsTimestamp()

                        }

                    },

                    updateMask: {

                        fieldPaths: [
                            "creditUsed",
                            "lastCreditOrderId",
                            "updatedAt"
                        ]

                    },

                    currentDocument: {
                        updateTime: customer.updateTime
                    }

                });

                return commitOrder();

            });

        });

}


/* GET ALL ORDERS - ADMIN */

function getAllOrders(pageSize = 20, pageToken = null) {

    const query = { pageSize };

    if (pageToken) {
        query.pageToken = pageToken;
    }

    return firestoreRequest({

        path: "orders",
        method: "GET",

        token: requireToken(
            getAdminIdToken(),
            "Admin login required."
        ),

        query: query

    });

}


/* GET ORDER BY ID - CUSTOMER */

function getOrderById(id) {

    if (!id) {
        return Promise.reject(
            new Error("Order ID required.")
        );
    }

    return firestoreRequest({

        path: `orders/${encodeURIComponent(id)}`,
        method: "GET",

        token: requireToken(
            getCustomerIdToken(),
            "Please login to view this order."
        )

    });

}


/* GET CUSTOMER ORDER HISTORY */

function getCustomerOrders(pageSize = 20) {

    const uid = getCustomerUid();

    if (!uid) {
        return Promise.reject(
            new Error("Please login to view orders.")
        );
    }

    if (!Number.isInteger(pageSize) ||
        pageSize < 1 || pageSize > 1000) {
        return Promise.reject(
            new Error("Invalid page size.")
        );
    }

    return firestoreRunQuery({

        from: [{ collectionId: "orders" }],

        where: {
            fieldFilter: {
                field: { fieldPath: "customerId" },
                op: "EQUAL",
                value: fsString(uid)
            }
        },

        orderBy: [{
            field: { fieldPath: "createdAt" },
            direction: "DESCENDING"
        }],

        limit: pageSize

    }, requireToken(
        getCustomerIdToken(),
        "Please login to view orders."
    ));

}


/* =========================================
   READ ORDER ITEMS FOR STOCK RESTORATION
========================================= */

function getOrderStockItems(order) {

    const itemValues =
        order?.fields?.items?.arrayValue?.values || [];

    const stockFields =
        order?.fields?.stockChanges?.mapValue?.fields || {};

    if (!itemValues.length || !Object.keys(stockFields).length) {
        throw new Error(
            "This order does not contain stock restoration details."
        );
    }

    return itemValues.map(value => {

        const fields = value?.mapValue?.fields || {};

        const productId = fields.productId?.stringValue;

        const quantity = Number(
            fields.quantity?.integerValue
        );

        const recordedQuantity = Number(
            stockFields[productId]?.integerValue
        );

        if (
            !productId ||
            !Number.isSafeInteger(quantity) ||
            quantity <= 0 ||
            recordedQuantity !== quantity
        ) {
            throw new Error(
                "Invalid stock information in this order."
            );
        }

        return {
            productId,
            quantity
        };

    });

}


/* =========================================
   PAYMENT DOCUMENT HELPERS
========================================= */

function getAdminPaymentByOrderId(orderId, token) {

    return firestoreRequest({
        path: `payments/${encodeURIComponent(orderId)}`,
        method: "GET",
        token: token
    });

}


function paymentField(document, fieldName, fallback = null) {

    return readOrderField(
        document,
        fieldName,
        "stringValue",
        fallback
    );

}


function validateLinkedPayment(order, payment, orderId) {

    const customerId = readOrderField(
        order,
        "customerId",
        "stringValue",
        ""
    );

    const orderAmount = readOrderField(
        order,
        "totalAmount",
        "doubleValue",
        NaN
    );

    const paymentOrderId = paymentField(
        payment,
        "orderId",
        ""
    );

    const paymentCustomerId = paymentField(
        payment,
        "customerId",
        ""
    );

    const paymentAmount = readOrderField(
        payment,
        "amount",
        "doubleValue",
        NaN
    );

    const orderMethod = paymentField(
        order,
        "paymentMethod",
        ""
    );

    const paymentMethod = paymentField(
        payment,
        "paymentMethod",
        ""
    );

    if (
        paymentOrderId !== orderId ||
        paymentCustomerId !== customerId ||
        paymentMethod !== orderMethod ||
        !Number.isFinite(orderAmount) ||
        !Number.isFinite(paymentAmount) ||
        Math.abs(paymentAmount - orderAmount) > 0.001
    ) {
        throw new Error(
            "The payment record does not match this order. No changes were made."
        );
    }

}


function buildOrderUpdateWrite(orderId, order, fields, fieldPaths) {

    if (!order.updateTime) {
        throw new Error(
            "Order update time is missing. Refresh and retry."
        );
    }

    return {
        update: {
            name:
                `${FIRESTORE_BASE_URL}/orders/` +
                encodeURIComponent(orderId),

            fields: fields
        },

        updateMask: {
            fieldPaths: fieldPaths
        },

        currentDocument: {
            updateTime: order.updateTime
        }
    };

}


function buildPaymentUpdateWrite(
    orderId,
    payment,
    status,
    extraFields = {}
) {

    if (!payment.updateTime) {
        throw new Error(
            "Payment update time is missing. Refresh and retry."
        );
    }

    return {
        update: {
            name:
                `${FIRESTORE_BASE_URL}/payments/` +
                encodeURIComponent(orderId),

            fields: {
                paymentStatus: fsString(status),
                updatedAt: fsTimestamp(),
                ...extraFields
            }
        },

        updateMask: {
            fieldPaths: [
                "paymentStatus",
                "updatedAt",
                ...Object.keys(extraFields)
            ]
        },

        currentDocument: {
            updateTime: payment.updateTime
        }
    };

}


/* =========================================
   ATOMIC ORDER CANCELLATION
   Restore stock + release credit + update payment
========================================= */

function cancelOrderAndRestoreStock(
    id,
    isAdmin = false,
    paymentStatusOverride = null
) {

    if (!id) {
        return Promise.reject(
            new Error("Order ID required.")
        );
    }

    const token = requireToken(
        isAdmin ? getAdminIdToken() : getCustomerIdToken(),
        "Please login to continue."
    );

    const uid = isAdmin ? null : getCustomerUid();

    if (!isAdmin && !uid) {
        return Promise.reject(
            new Error("Please login to cancel your order.")
        );
    }

    return firestoreRequest({

        path: `orders/${encodeURIComponent(id)}`,
        method: "GET",
        token: token

    }).then(async order => {

        const orderCustomerId = readOrderField(
            order,
            "customerId",
            "stringValue",
            ""
        );

        const orderStatus = readOrderField(
            order,
            "orderStatus",
            "stringValue",
            ""
        );

        const paymentMethod = readOrderField(
            order,
            "paymentMethod",
            "stringValue",
            ""
        );

        const paymentStatus = readOrderField(
            order,
            "paymentStatus",
            "stringValue",
            ""
        );

        if (!isAdmin && orderCustomerId !== uid) {
            throw new Error(
                "You are not authorized to cancel this order."
            );
        }

        if (!isAdmin && paymentMethod === "CREDIT") {
            throw new Error(
                "Credit orders must be cancelled by the store administrator so your reserved credit can be released safely."
            );
        }

        if (orderStatus !== "PLACED") {
            throw new Error(
                "Only placed orders can be cancelled."
            );
        }

        if (!order.updateTime) {
            throw new Error(
                "Order update time is missing. Please refresh and retry."
            );
        }

        const items = getOrderStockItems(order);

        const paymentPromise = isAdmin
            ? getAdminPaymentByOrderId(id, token).catch(error => {
                if (error?.response?.status === 404) {
                    return null;
                }

                throw error;
            })
            : Promise.resolve(null);

        const [products, payment] = await Promise.all([

            Promise.all(items.map(async item => {

                const product = await getProductById(item.productId);

                const currentQty = readOrderField(
                    product,
                    "qty",
                    "integerValue",
                    0
                );

                if (
                    !product.updateTime ||
                    !Number.isSafeInteger(currentQty) ||
                    currentQty < 0
                ) {
                    throw new Error(
                        "Product stock information could not be verified."
                    );
                }

                return {
                    productId: item.productId,
                    quantity: item.quantity,
                    currentQty,
                    updateTime: product.updateTime
                };

            })),

            paymentPromise

        ]);

        const writes = [];

        products.forEach(product => {

            writes.push({

                update: {

                    name:
                        `${FIRESTORE_BASE_URL}/products/` +
                        encodeURIComponent(product.productId),

                    fields: {

                        qty: fsInt(
                            product.currentQty + product.quantity
                        ),

                        lastStockOrderId: fsString(id),

                        updatedAt: fsTimestamp()

                    }

                },

                updateMask: {
                    fieldPaths: [
                        "qty",
                        "lastStockOrderId",
                        "updatedAt"
                    ]
                },

                currentDocument: {
                    updateTime: product.updateTime
                }

            });

        });

        const orderFields = {
            orderStatus: fsString("CANCELLED"),
            updatedAt: fsTimestamp()
        };

        const orderPaths = [
            "orderStatus",
            "updatedAt"
        ];

        if (isAdmin) {

            const nextPaymentStatus =
                paymentStatusOverride || "CANCELLED";

            orderFields.paymentStatus = fsString(nextPaymentStatus);

            orderPaths.push("paymentStatus");

            if (payment) {

                validateLinkedPayment(order, payment, id);

                const currentPaymentStatus = paymentField(
                    payment,
                    "paymentStatus",
                    ""
                );

                if (
                    [
                        "PENDING_COLLECTION",
                        "PENDING_APPROVAL"
                    ].includes(currentPaymentStatus)
                ) {

                    writes.push(
                        buildPaymentUpdateWrite(
                            id,
                            payment,
                            nextPaymentStatus
                        )
                    );

                } else {

                    throw new Error(
                        "This payment is no longer pending. A completed payment requires a separate refund workflow before the order can be cancelled."
                    );

                }

            } else if (paymentStatusOverride) {

                throw new Error(
                    "Payment record not found. Credit order was not rejected."
                );

            }

            if (paymentMethod === "CREDIT") {

                const creditAmount = readOrderField(
                    order,
                    "creditAmount",
                    "doubleValue",
                    readOrderField(
                        order,
                        "totalAmount",
                        "doubleValue",
                        0
                    )
                );

                if (
                    !Number.isFinite(creditAmount) ||
                    creditAmount < 0
                ) {
                    throw new Error(
                        "Reserved credit amount is invalid."
                    );
                }

                const customer = await firestoreRequest({

                    path:
                        `customers/${encodeURIComponent(orderCustomerId)}`,

                    method: "GET",
                    token: token

                });

                const creditUsed = readOrderField(
                    customer,
                    "creditUsed",
                    "doubleValue",
                    readOrderField(
                        customer,
                        "creditUsed",
                        "integerValue",
                        0
                    )
                );

                if (
                    !customer.updateTime ||
                    !Number.isFinite(creditUsed) ||
                    creditUsed < creditAmount
                ) {
                    throw new Error(
                        "Customer credit balance is inconsistent. Contact support; no cancellation was committed."
                    );
                }

                writes.push({

                    update: {

                        name:
                            `${FIRESTORE_BASE_URL}/customers/` +
                            encodeURIComponent(orderCustomerId),

                        fields: {

                            creditUsed: fsDouble(
                                creditUsed - creditAmount
                            ),

                            updatedAt: fsTimestamp()

                        }

                    },

                    updateMask: {
                        fieldPaths: [
                            "creditUsed",
                            "updatedAt"
                        ]
                    },

                    currentDocument: {
                        updateTime: customer.updateTime
                    }

                });

            }

        }

        writes.push(
            buildOrderUpdateWrite(
                id,
                order,
                orderFields,
                orderPaths
            )
        );

        return commitOrderWrites(writes, token);

    });

}


/* =========================================
   ADMIN PAYMENT ACTIONS
========================================= */

function processAdminPayment(orderId, action) {

    const allowedActions = [
        "COLLECT_CASH",
        "APPROVE_CREDIT",
        "REJECT_CREDIT"
    ];

    if (!orderId || !allowedActions.includes(action)) {
        return Promise.reject(
            new Error("Invalid payment action.")
        );
    }

    const token = requireToken(
        getAdminIdToken(),
        "Admin login required."
    );

    if (action === "REJECT_CREDIT") {
        return cancelOrderAndRestoreStock(
            orderId,
            true,
            "REJECTED"
        );
    }

    return Promise.all([

        firestoreRequest({

            path: `orders/${encodeURIComponent(orderId)}`,
            method: "GET",
            token: token

        }),

        getAdminPaymentByOrderId(orderId, token)

    ]).then(([order, payment]) => {

        validateLinkedPayment(order, payment, orderId);

        const method = paymentField(
            order,
            "paymentMethod",
            ""
        );

        const orderStatus = paymentField(
            order,
            "orderStatus",
            ""
        );

        const orderPaymentStatus = paymentField(
            order,
            "paymentStatus",
            ""
        );

        const paymentStatus = paymentField(
            payment,
            "paymentStatus",
            ""
        );

        let nextStatus;
        let nextOrderStatus = orderStatus;

        if (action === "COLLECT_CASH") {

            if (
                method !== "CASH" ||
                orderPaymentStatus !== "PENDING_COLLECTION" ||
                paymentStatus !== "PENDING_COLLECTION"
            ) {
                throw new Error(
                    "This CASH payment is not pending collection."
                );
            }

            nextStatus = "COMPLETED";

        } else {

            if (
                method !== "CREDIT" ||
                orderPaymentStatus !== "PENDING_APPROVAL" ||
                paymentStatus !== "PENDING_APPROVAL" ||
                orderStatus !== "PLACED"
            ) {
                throw new Error(
                    "This CREDIT order is not awaiting approval."
                );
            }

            nextStatus = "APPROVED";
            nextOrderStatus = "CONFIRMED";

        }

        const orderFields = {
            paymentStatus: fsString(nextStatus),
            updatedAt: fsTimestamp()
        };

        const orderPaths = [
            "paymentStatus",
            "updatedAt"
        ];

        if (nextOrderStatus !== orderStatus) {

            orderFields.orderStatus = fsString(nextOrderStatus);

            orderPaths.push("orderStatus");

        }

        const paymentExtra = action === "COLLECT_CASH"
            ? {
                collectedAt: fsTimestamp()
            }
            : {
                approvedAt: fsTimestamp()
            };

        const writes = [

            buildOrderUpdateWrite(
                orderId,
                order,
                orderFields,
                orderPaths
            ),

            buildPaymentUpdateWrite(
                orderId,
                payment,
                nextStatus,
                paymentExtra
            )

        ];

        return commitOrderWrites(writes, token);

    });

}


/* =========================================
   UPDATE ORDER STATUS - ADMIN
========================================= */

function updateOrderStatus(id, status) {

    const allowed = [
        "PLACED",
        "CONFIRMED",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED"
    ];

    if (!id || !allowed.includes(status)) {
        return Promise.reject(
            new Error("Invalid order ID/status.")
        );
    }

    // Cancellation must restore inventory.
    if (status === "CANCELLED") {
        return cancelOrderAndRestoreStock(id, true);
    }

    return firestoreRequest({

        path: `orders/${encodeURIComponent(id)}`,
        method: "PATCH",

        token: requireToken(
            getAdminIdToken(),
            "Admin login required."
        ),

        data: {

            fields: {
                orderStatus: fsString(status),
                updatedAt: fsTimestamp()
            }

        },

        query: {
            "updateMask.fieldPaths": [
                "orderStatus",
                "updatedAt"
            ]
        }

    });

}


/* =========================================
   CANCEL CUSTOMER ORDER
========================================= */

function cancelCustomerOrder(id) {

    return cancelOrderAndRestoreStock(id, false);

}