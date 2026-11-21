
/* =========================================
   THE HAVEN - PAYMENT API
   Payment and credit information
========================================= */


/* READ PAYMENT / ORDER FIELD */

function readPaymentField(document, fieldName, fieldType, fallback = null) {

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


/* GET CUSTOMER CREDIT INFORMATION */

/* GET CUSTOMER CREDIT INFORMATION */

function getCustomerCreditInfo() {

    return getCustomerProfile().then(document => {

        const creditLimit = readPaymentField(
            document,
            "creditLimit",
            "integerValue",
            readPaymentField(document, "creditLimit", "doubleValue", 0)
        );

        const creditUsed = readPaymentField(
            document,
            "creditUsed",
            "integerValue",
            readPaymentField(document, "creditUsed", "doubleValue", 0)
        );

        return {
            customerId: getCustomerUid(),
            creditLimit: creditLimit,
            creditUsed: creditUsed,
            availableCredit: Math.max(
                0,
                creditLimit - creditUsed
            )
        };

    });

}


/* CALCULATE PAYMENT TOTAL */

function calculatePaymentTotal(subtotal) {

    const amount = Number(subtotal);

    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("Invalid subtotal.");
    }

    const deliveryFee = amount >= 999 ? 0 : 60;

    return {
        subtotal: amount,
        deliveryFee: deliveryFee,
        totalAmount: amount + deliveryFee
    };

}


/* CHECK CREDIT ELIGIBILITY - ADVISORY ONLY */

function checkCreditEligibility(amount) {

    const requestedAmount = Number(amount);

    if (!Number.isFinite(requestedAmount) ||
        requestedAmount <= 0) {

        return Promise.reject(
            new Error("Valid amount required.")
        );
    }

    return getCustomerCreditInfo().then(info => {

        return {
            ...info,
            requestedAmount: requestedAmount,
            eligibleForReview:
                info.availableCredit >= requestedAmount
        };

    });

}


/* VERIFY ORDER BEFORE CREATING PAYMENT */

function verifyPaymentOrder(orderId, amount, method, token) {

    return firestoreRequest({

        path: `orders/${encodeURIComponent(orderId)}`,
        method: "GET",
        token: token

    }).then(order => {

        const customerId = readPaymentField(
            order,
            "customerId",
            "stringValue"
        );

        const orderAmount = readPaymentField(
            order,
            "totalAmount",
            "doubleValue",
            0
        );

        const orderMethod = readPaymentField(
            order,
            "paymentMethod",
            "stringValue"
        );

        const orderStatus = readPaymentField(
            order,
            "orderStatus",
            "stringValue"
        );

        if (customerId !== getCustomerUid()) {
            throw new Error(
                "This order does not belong to your account."
            );
        }

        if (orderStatus === "CANCELLED") {
            throw new Error(
                "Payment cannot be created for a cancelled order."
            );
        }

        if (Math.abs(orderAmount - amount) > 0.001) {
            throw new Error(
                "Payment amount does not match the order total."
            );
        }

        if (orderMethod !== method) {
            throw new Error(
                "Payment method does not match the order."
            );
        }

        return order;

    });

}


/* CREATE PAYMENT RECORD */


/* CREATE PAYMENT RECORD - IDEMPOTENT */

function createPaymentRecord(orderId, amount, method) {

    const uid = getCustomerUid();
    const paymentAmount = Number(amount);

    if (!uid) {
        return Promise.reject(new Error("Please login."));
    }

    if (
        !orderId ||
        !Number.isFinite(paymentAmount) ||
        paymentAmount <= 0 ||
        !["CASH", "CREDIT"].includes(method)
    ) {
        return Promise.reject(new Error("Invalid payment details."));
    }

    const token = requireToken(
        getCustomerIdToken(),
        "Please login to continue."
    );

    const paymentPath =
        `payments/${encodeURIComponent(orderId)}`;

    function verifyExistingPayment(payment) {

        const existingOrderId = readPaymentField(
            payment, "orderId", "stringValue"
        );

        const existingCustomerId = readPaymentField(
            payment, "customerId", "stringValue"
        );

        const existingAmount = readPaymentField(
            payment, "amount", "doubleValue", 0
        );

        const existingMethod = readPaymentField(
            payment, "paymentMethod", "stringValue"
        );

        if (
            existingOrderId !== orderId ||
            existingCustomerId !== uid ||
            Math.abs(existingAmount - paymentAmount) > 0.001 ||
            existingMethod !== method
        ) {
            throw new Error(
                "A payment record already exists with different details. Please contact support."
            );
        }

        // Existing matching payment: do not create another.
        return payment;
    }

    function getExistingPayment() {

        return firestoreRequest({
            path: paymentPath,
            method: "GET",
            token: token
        }).then(verifyExistingPayment);
    }

    return verifyPaymentOrder(
        orderId,
        paymentAmount,
        method,
        token
    ).then(function () {

        // First check whether a payment already exists.
        return getExistingPayment().catch(function (error) {

            if (error.response?.status !== 404) {
                throw error;
            }

            // Use orderId as payment document ID.
            // This makes retries target the same document.
            return firestoreRequest({

                path: "payments",
                method: "POST",
                token: token,

                query: {
                    documentId: orderId
                },

                data: {
                    fields: {
                        orderId: fsString(orderId),
                        customerId: fsString(uid),
                        amount: fsDouble(paymentAmount),
                        paymentMethod: fsString(method),

                        paymentStatus: fsString(
                            method === "CASH"
                                ? "PENDING_COLLECTION"
                                : "PENDING_APPROVAL"
                        ),

                        createdAt: fsTimestamp()
                    }
                }

            }).catch(function (createError) {

                // If another submission created the same
                // document simultaneously, read and verify it.
                if (createError.response?.status === 409) {
                    return getExistingPayment();
                }

                throw createError;
            });

        });

    });

}


/* GET PAYMENT DETAILS - CUSTOMER */

function getPaymentDetails(id) {

    if (!id) {
        return Promise.reject(
            new Error("Payment ID required.")
        );
    }

    const token = requireToken(
        getCustomerIdToken(),
        "Please login to view payment details."
    );

    return firestoreRequest({

        path: `payments/${encodeURIComponent(id)}`,
        method: "GET",
        token: token

    }).then(payment => {

        const customerId = readPaymentField(
            payment,
            "customerId",
            "stringValue"
        );

        if (customerId !== getCustomerUid()) {
            throw new Error(
                "You are not authorized to view this payment."
            );
        }

        return payment;

    });

}


/* GET CUSTOMER PAYMENT HISTORY */

function getCustomerPayments(pageSize = 20) {

    const uid = getCustomerUid();

    if (!uid) {
        return Promise.reject(
            new Error("Please login.")
        );
    }

    if (!Number.isInteger(pageSize) ||
        pageSize < 1 || pageSize > 1000) {

        return Promise.reject(
            new Error("Invalid page size.")
        );
    }

    return firestoreRunQuery({

        from: [{ collectionId: "payments" }],

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
        "Please login to view payment history."
    ));

}
