
/* =========================================
   THE HAVEN - API CORE
   Common Axios and Firebase API utilities
========================================= */


/* =========================================
   1. AUTHENTICATION HELPERS
========================================= */

function getCustomerUid() {
    return sessionStorage.getItem("havenCustomerUID");
}

function getCustomerIdToken() {
    return sessionStorage.getItem("havenCustomerToken");
}

function getAdminIdToken() {
    const token = sessionStorage.getItem("havenAdminToken");
    const uid = sessionStorage.getItem("havenAdminUID");

    if (!token || !uid) {
        throw new Error("Admin authentication required. Please sign in again.");
    }

    return token;
}


/* =========================================
   2. FIREBASE AUTHENTICATION REQUEST
========================================= */

function firebaseAuthRequest(endpoint, payload) {
    const url =
        `${FIREBASE_AUTH_URL}/${endpoint}?key=${FIREBASE_API_KEY}`;

    return axios.post(url, payload).then(function(response) {
        return response.data;
    });
}


/* =========================================
   3. ADMIN TOKEN REFRESH
========================================= */

/*
   Share one refresh request when multiple API calls
   receive 401 at approximately the same time.
*/

var havenAdminRefreshPromise = null;

function refreshAdminIdToken() {

    if (havenAdminRefreshPromise) {
        return havenAdminRefreshPromise;
    }

    const refreshToken =
        sessionStorage.getItem("havenAdminRefreshToken");

    if (!refreshToken) {
        return Promise.reject(
            new Error(
                "Admin session has expired. Please sign in again."
            )
        );
    }

    const url =
        `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;

    const formData = new URLSearchParams();

    formData.append("grant_type", "refresh_token");
    formData.append("refresh_token", refreshToken);

    havenAdminRefreshPromise = axios.post(url, formData, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    }).then(function(response) {

        const data = response.data;

        if (!data.id_token || !data.refresh_token || !data.user_id) {
            throw new Error("Firebase returned an incomplete refreshed token.");
        }

        const currentAdminUID =
            sessionStorage.getItem("havenAdminUID");

        if (currentAdminUID && data.user_id !== currentAdminUID) {
            throw new Error(
                "The refreshed token does not belong to the signed-in admin."
            );
        }

        sessionStorage.setItem("havenAdminToken", data.id_token);
        sessionStorage.setItem("havenAdminRefreshToken", data.refresh_token);
        sessionStorage.setItem("havenAdminUID", data.user_id);

        if (data.expires_in) {
            sessionStorage.setItem(
                "havenAdminExpiresIn",
                data.expires_in
            );

            sessionStorage.setItem(
                "havenAdminTokenExpiry",
                String(Date.now() + Number(data.expires_in) * 1000)
            );
        }

        return data.id_token;

    }).catch(function(error) {

        const firebaseError =
            error.response?.data?.error?.message || "";

        if (
            firebaseError === "INVALID_REFRESH_TOKEN" ||
            firebaseError === "TOKEN_EXPIRED" ||
            firebaseError === "USER_DISABLED" ||
            firebaseError === "USER_NOT_FOUND"
        ) {
            [
                "havenAdminLoggedIn",
                "havenAdminUID",
                "havenAdminToken",
                "havenAdminEmail",
                "havenAdminRefreshToken",
                "havenAdminExpiresIn",
                "havenAdminTokenExpiry"
            ].forEach(function(key) {
                sessionStorage.removeItem(key);
            });
        }

        throw new Error(
            firebaseError
                ? "Admin session could not be refreshed. Please sign in again."
                : error.message || "Unable to refresh admin authentication."
        );

    }).finally(function() {

        havenAdminRefreshPromise = null;

    });

    return havenAdminRefreshPromise;
}


/* =========================================
   4. ADMIN REQUEST DETECTION
========================================= */

function isAdminFirestoreRequest(token) {

    const storedAdminToken =
        sessionStorage.getItem("havenAdminToken");

    const adminUID =
        sessionStorage.getItem("havenAdminUID");

    return Boolean(
        token &&
        adminUID &&
        storedAdminToken &&
        token === storedAdminToken
    );
}


/* =========================================
   5. FIRESTORE REST API REQUEST
========================================= */

function firestoreRequest(options) {

    const {
        path,
        method = "GET",
        token = null,
        data = null,
        query = {}
    } = options;

    if (!path) {
        return Promise.reject(
            new Error("Firestore document path is required.")
        );
    }

    const url = new URL(
        `${FIRESTORE_BASE_URL}/${path}`
    );

    Object.entries(query).forEach(function([key, value]) {

        if (Array.isArray(value)) {

            value.forEach(function(item) {
                url.searchParams.append(key, item);
            });

        } else if (value !== undefined && value !== null) {

            url.searchParams.append(key, value);

        }

    });

    function sendRequest(requestToken) {

        const headers = {};

        if (requestToken) {
            headers.Authorization = `Bearer ${requestToken}`;
        }

        return axios({
            url: url.toString(),
            method: method,
            headers: headers,
            data: data
        }).then(function(response) {

            return response.data;

        });

    }

    return sendRequest(token).catch(function(error) {

        if (
            error.response?.status === 401 &&
            isAdminFirestoreRequest(token)
        ) {

            return refreshAdminIdToken().then(function(newToken) {
                return sendRequest(newToken);
            });

        }

        throw error;

    });

}


/* =========================================
   6. FIRESTORE STRUCTURED QUERY
========================================= */

function firestoreRunQuery(query, token = null) {

    if (!query || typeof query !== "object") {
        return Promise.reject(
            new Error("Valid Firestore query is required.")
        );
    }

    const url = `${FIRESTORE_BASE_URL}:runQuery`;

    function sendQuery(requestToken) {

        const headers = {};

        if (requestToken) {
            headers.Authorization = `Bearer ${requestToken}`;
        }

        return axios({
            url: url,
            method: "POST",
            headers: headers,
            data: {
                structuredQuery: query
            }
        }).then(function(response) {

            return response.data;

        });

    }

    return sendQuery(token).catch(function(error) {

        if (
            error.response?.status === 401 &&
            isAdminFirestoreRequest(token)
        ) {

            return refreshAdminIdToken().then(function(newToken) {
                return sendQuery(newToken);
            });

        }

        throw error;

    });

}


/* =========================================
   7. FIRESTORE FIELD EXTRACTION
========================================= */

function fsField(
    document,
    fieldName,
    fieldType = "stringValue",
    fallback = null
) {

    if (
        !document ||
        !document.fields ||
        !document.fields[fieldName]
    ) {
        return fallback;
    }

    const value = document.fields[fieldName][fieldType];

    if (value === undefined || value === null) {
        return fallback;
    }

    if (
        fieldType === "integerValue" ||
        fieldType === "doubleValue"
    ) {
        return Number(value);
    }

    return value;

}


/* =========================================
   8. EXTRACT DOCUMENTS FROM QUERY RESULTS
========================================= */

function queryDocs(rows) {

    if (!Array.isArray(rows)) {
        return [];
    }

    return rows
        .filter(function(row) {
            return row && row.document;
        })
        .map(function(row) {
            return row.document;
        });

}


/* =========================================
   9. FIRESTORE DATE FILTERS
   Start date: inclusive
   End date: inclusive
========================================= */

function dateFilters(fieldName, start, end) {

    if (!fieldName || !start || !end) {
        throw new Error(
            "Field name, start date and end date are required."
        );
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (
        !datePattern.test(start) ||
        !datePattern.test(end)
    ) {
        throw new Error(
            "Dates must use YYYY-MM-DD format."
        );
    }

    const startParts = start.split("-").map(Number);
    const endParts = end.split("-").map(Number);

    const startDate = new Date(
        startParts[0],
        startParts[1] - 1,
        startParts[2]
    );

    const endDate = new Date(
        endParts[0],
        endParts[1] - 1,
        endParts[2]
    );

    if (
        startDate.getFullYear() !== startParts[0] ||
        startDate.getMonth() !== startParts[1] - 1 ||
        startDate.getDate() !== startParts[2] ||
        endDate.getFullYear() !== endParts[0] ||
        endDate.getMonth() !== endParts[1] - 1 ||
        endDate.getDate() !== endParts[2]
    ) {
        throw new Error("Invalid calendar date.");
    }

    if (startDate > endDate) {
        throw new Error(
            "Start date cannot be after end date."
        );
    }

    const nextDay = new Date(endDate);
    nextDay.setDate(nextDay.getDate() + 1);

    return [
        {
            fieldFilter: {
                field: {
                    fieldPath: fieldName
                },
                op: "GREATER_THAN_OR_EQUAL",
                value: {
                    timestampValue: startDate.toISOString()
                }
            }
        },
        {
            fieldFilter: {
                field: {
                    fieldPath: fieldName
                },
                op: "LESS_THAN",
                value: {
                    timestampValue: nextDay.toISOString()
                }
            }
        }
    ];

}


/* =========================================
   10. COMMON API ERROR HANDLER
========================================= */

function handleApiError(error) {

    console.error("API Error:", error);

    if (error.response?.data?.error?.message) {
        return error.response.data.error.message;
    }

    if (error.message) {
        return error.message;
    }

    return "Something went wrong. Please try again.";

}


/* =========================================
   11. REQUIRED FIELD VALIDATION
========================================= */

function validateRequiredFields(data, requiredFields) {

    const errors = [];

    requiredFields.forEach(function(field) {

        const value = data[field];

        if (
            value === undefined ||
            value === null ||
            String(value).trim() === ""
        ) {
            errors.push(`${field} is required.`);
        }

    });

    return {
        valid: errors.length === 0,
        errors: errors
    };

}


/* =========================================
   12. FIRESTORE VALUE HELPERS
========================================= */

function fsString(value) {
    return {
        stringValue: String(value)
    };
}

function fsInt(value) {
    return {
        integerValue: String(value)
    };
}

function fsDouble(value) {
    return {
        doubleValue: Number(value)
    };
}

function fsBool(value) {
    return {
        booleanValue: Boolean(value)
    };
}

function fsTimestamp(value = new Date()) {
    return {
        timestampValue: value.toISOString()
    };
}


/* =========================================
   13. AUTHENTICATION TOKEN VALIDATION
========================================= */

function requireToken(
    token,
    message = "Authentication required."
) {

    if (!token) {
        throw new Error(message);
    }

    return token;

}
