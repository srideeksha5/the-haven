
/* =========================================
   THE HAVEN - CUSTOMER API
   Customer profile management
========================================= */


/* CREATE CUSTOMER PROFILE */

function createCustomerProfile(
    uid,
    name,
    email,
    mobile,
    idToken = getCustomerIdToken()
) {

    if (!uid || !idToken) {
        return Promise.reject(
            new Error("Customer ID and token are required.")
        );
    }

    return firestoreRequest({

        path: `customers/${encodeURIComponent(uid)}`,
        method: "PATCH",
        token: idToken,

        data: {
            fields: {
                name: fsString(name),
                email: fsString(email),
                mobile: fsString(mobile),
                creditLimit: fsInt(0),
                creditUsed: fsInt(0),
                active: fsBool(true),
                createdAt: fsTimestamp()
            }
        }

    });

}


/* GET CUSTOMER PROFILE */

function getCustomerProfile(
    uid = getCustomerUid(),
    idToken = getCustomerIdToken()
) {

    if (!uid) {
        return Promise.reject(
            new Error("Customer ID is required.")
        );
    }

    return firestoreRequest({
        path: `customers/${encodeURIComponent(uid)}`,
        method: "GET",
        token: requireToken(idToken)
    });

}


/* UPDATE CUSTOMER PROFILE */

function updateCustomerProfile(uid, changes, idToken = getCustomerIdToken()) {

    if (!uid) {
        return Promise.reject(
            new Error("Customer ID is required.")
        );
    }

    const fields = {};
    const updateMask = [];

    ["name", "mobile"].forEach(key => {

        if (changes[key] !== undefined) {

            if (!String(changes[key]).trim()) {
                throw new Error(`${key} cannot be empty.`);
            }

            fields[key] = fsString(changes[key].trim());
            updateMask.push(key);

        }

    });

    if (updateMask.length === 0) {
        return Promise.reject(
            new Error("No profile fields supplied.")
        );
    }

    fields.updatedAt = fsTimestamp();
    updateMask.push("updatedAt");

    return firestoreRequest({

        path: `customers/${encodeURIComponent(uid)}`,
        method: "PATCH",
        token: requireToken(idToken),

        data: { fields },

        query: {
            "updateMask.fieldPaths": updateMask
        }

    });

}


/* UPDATE CUSTOMER CREDIT LIMIT - ADMIN */

function updateCustomerCreditLimit(
    uid,
    limit,
    adminToken = getAdminIdToken()
) {

    const amount = Number(limit);

    if (!uid || !Number.isInteger(amount) || amount < 0) {
        return Promise.reject(
            new Error("Valid customer ID and non-negative integer credit limit required.")
        );
    }

    return firestoreRequest({

        path: `customers/${encodeURIComponent(uid)}`,
        method: "PATCH",
        token: requireToken(adminToken, "Admin login required."),

        data: {
            fields: {
                creditLimit: fsInt(amount),
                updatedAt: fsTimestamp()
            }
        },

        query: {
            "updateMask.fieldPaths": [
                "creditLimit",
                "updatedAt"
            ]
        }

    });

}

/* DEACTIVATE / ACTIVATE CUSTOMER - ADMIN */

function updateCustomerStatus(
    uid,
    active,
    adminToken = getAdminIdToken()
) {

    if (!uid || typeof active !== "boolean") {
        return Promise.reject(
            new Error("Valid customer ID and status are required.")
        );
    }

    return firestoreRequest({

        path: `customers/${encodeURIComponent(uid)}`,
        method: "PATCH",
        token: requireToken(adminToken, "Admin login required."),

        data: {
            fields: {
                active: fsBool(active),
                updatedAt: fsTimestamp()
            }
        },

        query: {
            "updateMask.fieldPaths": [
                "active",
                "updatedAt"
            ]
        }

    });

}
