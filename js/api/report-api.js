
/* =========================================
   THE HAVEN - REPORT API
   Customer, inventory and sales reports
========================================= */


/* READ FIRESTORE FIELD */

function readReportField(document, fieldName, fieldType, fallback = null) {

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


/* EXTRACT DOCUMENTS FROM RUN QUERY */

function getReportDocuments(rows) {

    return (rows || [])
        .filter(row => row && row.document)
        .map(row => row.document);

}


/* VALIDATE REPORT DATE RANGE */

function validateReportDates(start, end) {

    if (!start || !end ||
        !Number.isFinite(Date.parse(start)) ||
        !Number.isFinite(Date.parse(end))) {

        throw new Error("Valid start and end dates are required.");
    }

    if (new Date(start) > new Date(end)) {
        throw new Error("Start date cannot be after end date.");
    }

}


/* COMMON ADMIN REPORT QUERY */

function runReportQuery(filters = [], pageSize = 500) {

    if (!Array.isArray(filters) ||
        !Number.isInteger(pageSize) ||
        pageSize < 1 || pageSize > 1000) {

        return Promise.reject(
            new Error("Invalid report query parameters.")
        );
    }

    const token = requireToken(
        getAdminIdToken(),
        "Admin login required."
    );

    const allRows = [];

    function fetchPage(offset = 0) {

        const query = {
            from: [{ collectionId: "orders" }],
            limit: pageSize,
            offset: offset
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

        return firestoreRunQuery(query, token)
            .then(rows => {

                const currentRows = rows || [];

                allRows.push(...currentRows);

                if (currentRows.length === pageSize) {
                    return fetchPage(offset + pageSize);
                }

                return allRows;

            });

    }

    return fetchPage();

}


/* GET ALL CUSTOMERS */

function getAllCustomerReport(pageSize = 100, pageToken = null) {

    if (!Number.isInteger(pageSize) ||
        pageSize < 1 || pageSize > 1000) {

        return Promise.reject(
            new Error("Invalid customer report page size.")
        );
    }

    const query = {
        pageSize: pageSize
    };

    if (pageToken) {
        query.pageToken = pageToken;
    }

    return firestoreRequest({

        path: "customers",
        method: "GET",

        token: requireToken(
            getAdminIdToken(),
            "Admin login required."
        ),

        query: query

    });

}


/* TOP 10 CUSTOMERS BY PURCHASE VALUE */

function getTop10Customers(start, end) {

    let filters;

    try {

        validateReportDates(start, end);
        filters = dateFilters("createdAt", start, end);

    } catch (error) {
        return Promise.reject(error);
    }

    return runReportQuery(filters).then(rows => {

        const totals = {};

        getReportDocuments(rows).forEach(document => {

            const customerId = readReportField(
                document,
                "customerId",
                "stringValue"
            );

            const status = readReportField(
                document,
                "orderStatus",
                "stringValue"
            );

            if (!customerId || status === "CANCELLED") {
                return;
            }

            const amount =
                readReportField(
                    document,
                    "totalAmount",
                    "doubleValue",
                    null
                ) ??
                readReportField(
                    document,
                    "totalAmount",
                    "integerValue",
                    0
                );

            totals[customerId] =
                (totals[customerId] || 0) + amount;

        });

        const topCustomers = Object.entries(totals)
            .map(([customerId, totalPurchase]) => ({
                customerId: customerId,
                totalPurchase: totalPurchase
            }))
            .sort((a, b) => b.totalPurchase - a.totalPurchase)
            .slice(0, 10);

        return Promise.all(

            topCustomers.map(customer => {

                return firestoreRequest({

                    path: `customers/${encodeURIComponent(customer.customerId)}`,
                    method: "GET",

                    token: requireToken(
                        getAdminIdToken(),
                        "Admin login required."
                    )

                })
                .then(document => ({

                    ...customer,

                    name: readReportField(
                        document,
                        "name",
                        "stringValue",
                        "Unknown customer"
                    ),

                    email: readReportField(
                        document,
                        "email",
                        "stringValue",
                        ""
                    ),

                    mobile: readReportField(
                        document,
                        "mobile",
                        "stringValue",
                        ""
                    )

                }))
                .catch(() => ({

                    ...customer,
                    name: "Customer profile unavailable",
                    email: "",
                    mobile: ""

                }));

            })

        );

    });

}


/* CASH / CREDIT PURCHASE REPORT */

function getPurchaseReportByMethod(start, end, method) {

    if (!["CASH", "CREDIT"].includes(method)) {
        return Promise.reject(
            new Error("Invalid payment method.")
        );
    }

    let filters;

    try {

        validateReportDates(start, end);
        filters = dateFilters("createdAt", start, end);

    } catch (error) {
        return Promise.reject(error);
    }

    filters.push({

        fieldFilter: {
            field: { fieldPath: "paymentMethod" },
            op: "EQUAL",
            value: fsString(method)
        }

    });

    return runReportQuery(filters);

}


/* CASH PURCHASES */

function getCashPurchaseReport(start, end) {

    return getPurchaseReportByMethod(start, end, "CASH");

}


/* CREDIT PURCHASES */

function getCreditPurchaseReport(start, end) {

    return getPurchaseReportByMethod(start, end, "CREDIT");

}


/* INVENTORY REPORTS */

function getStockReport(pageSize = 100) {

    return getAllInventory(pageSize);

}


function getCategoryStockReport(id, pageSize = 100) {

    return getInventoryByCategory(id, pageSize);

}


function getHighStockReport(pageSize = 100) {

    return getHighStockProducts(pageSize);

}


function getLowStockReport(pageSize = 100) {

    return getLowStockProducts(pageSize);

}


/* SALES REPORT BY DATE RANGE */

function getSalesReport(start, end) {

    let filters;

    try {

        validateReportDates(start, end);
        filters = dateFilters("createdAt", start, end);

    } catch (error) {
        return Promise.reject(error);
    }

    return runReportQuery(filters);

}


/* CASH SALES */

function getCashSalesReport(start, end) {

    return getCashPurchaseReport(start, end);

}


/* CREDIT SALES */

function getCreditSalesReport(start, end) {

    return getCreditPurchaseReport(start, end);

}


/* AGGREGATE PRODUCT SALES */

function aggregateProductSales(rows) {

    const totals = {};

    getReportDocuments(rows).forEach(document => {

        if (
            readReportField(
                document,
                "orderStatus",
                "stringValue"
            ) === "CANCELLED"
        ) {
            return;
        }

        const items =
            document.fields?.items?.arrayValue?.values || [];

        items.forEach(item => {

            const fields = item.mapValue?.fields || {};

            const productId = fields.productId?.stringValue;

            if (!productId) {
                return;
            }

            if (!totals[productId]) {

                totals[productId] = {

                    productId: productId,

                    title:
                        fields.title?.stringValue ||
                        "Unknown product",

                    quantitySold: 0,

                    salesValue: 0

                };

            }

            totals[productId].quantitySold +=
                Number(fields.quantity?.integerValue || 0);

            totals[productId].salesValue +=
                Number(
                    fields.lineTotal?.doubleValue ??
                    fields.lineTotal?.integerValue ??
                    0
                );

        });

    });

    return Object.values(totals);

}


/* TOP 10 PRODUCTS */

function getTop10Products(start, end) {

    let filters;

    try {

        validateReportDates(start, end);
        filters = dateFilters("createdAt", start, end);

    } catch (error) {
        return Promise.reject(error);
    }

    return runReportQuery(filters).then(rows => {

        return aggregateProductSales(rows)

            .sort((a, b) =>
                b.quantitySold - a.quantitySold
            )

            .slice(0, 10);

    });

}


/* BOTTOM 10 PRODUCTS */

function getBottom10Products(start, end) {

    let filters;

    try {

        validateReportDates(start, end);
        filters = dateFilters("createdAt", start, end);

    } catch (error) {
        return Promise.reject(error);
    }

    return runReportQuery(filters).then(rows => {

        return aggregateProductSales(rows)

            .sort((a, b) =>
                a.quantitySold - b.quantitySold
            )

            .slice(0, 10);

    });

}


/* CATEGORY-WISE SALES REPORT */

function getCategorySalesReport(start, end) {

    let filters;

    try {

        validateReportDates(start, end);
        filters = dateFilters("createdAt", start, end);

    } catch (error) {
        return Promise.reject(error);
    }

    return runReportQuery(filters).then(rows => {

        const totals = {};

        getReportDocuments(rows).forEach(document => {

            if (
                readReportField(
                    document,
                    "orderStatus",
                    "stringValue"
                ) === "CANCELLED"
            ) {
                return;
            }

            const items =
                document.fields?.items?.arrayValue?.values || [];

            items.forEach(item => {

                const fields = item.mapValue?.fields || {};

                const categoryId =
                    fields.categoryId?.stringValue;

                if (!categoryId) {
                    return;
                }

                if (!totals[categoryId]) {

                    totals[categoryId] = {
                        categoryId: categoryId,
                        quantitySold: 0,
                        salesValue: 0
                    };

                }

                totals[categoryId].quantitySold +=
                    Number(fields.quantity?.integerValue || 0);

                totals[categoryId].salesValue +=
                    Number(
                        fields.lineTotal?.doubleValue ??
                        fields.lineTotal?.integerValue ??
                        0
                    );

            });

        });

        return Object.values(totals);

    });

}
