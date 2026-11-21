
/* =========================================
   THE HAVEN - CATEGORY API
   Category management
========================================= */


/* GET ALL CATEGORIES */

function getCategories(pageSize = 100, pageToken = null) {

    const query = { pageSize };

    if (pageToken) {
        query.pageToken = pageToken;
    }

    return firestoreRequest({
        path: "categories",
        method: "GET",
        query
    });

}


/* GET CATEGORY BY ID */

function getCategoryById(id) {

    if (!id) {
        return Promise.reject(
            new Error("Category ID required.")
        );
    }

    return firestoreRequest({
        path: `categories/${encodeURIComponent(id)}`,
        method: "GET"
    });

}


/* CREATE CATEGORY */

function createCategory(name) {

    if (!name?.trim()) {
        return Promise.reject(
            new Error("Category name required.")
        );
    }

    return firestoreRequest({

        path: "categories",
        method: "POST",
        token: requireToken(getAdminIdToken(), "Admin login required."),

        data: {
            fields: {
                name: fsString(name.trim()),
                active: fsBool(true),
                createdAt: fsTimestamp()
            }
        }

    });

}


/* UPDATE CATEGORY */

function updateCategory(id, name) {

    if (!id || !name?.trim()) {
        return Promise.reject(
            new Error("Category ID and name required.")
        );
    }

    return firestoreRequest({

        path: `categories/${encodeURIComponent(id)}`,
        method: "PATCH",
        token: requireToken(getAdminIdToken(), "Admin login required."),

        data: {
            fields: {
                name: fsString(name.trim()),
                updatedAt: fsTimestamp()
            }
        },

        query: {
            "updateMask.fieldPaths": ["name", "updatedAt"]
        }

    });

}


/* ACTIVATE / DEACTIVATE CATEGORY */

function updateCategoryStatus(id, active) {

    if (!id || typeof active !== "boolean") {
        return Promise.reject(
            new Error("Valid category ID/status required.")
        );
    }

    return firestoreRequest({

        path: `categories/${encodeURIComponent(id)}`,
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


/* DELETE CATEGORY */

function deleteCategory(id) {

    if (!id) {
        return Promise.reject(
            new Error("Category ID required.")
        );
    }

    return firestoreRequest({
        path: `categories/${encodeURIComponent(id)}`,
        method: "DELETE",
        token: requireToken(getAdminIdToken(), "Admin login required.")
    });

}
