
/* =================================
   ADMIN AUTHENTICATION
================================= */

let adminIdToken = null;


// Admin Login using Firebase Authentication REST API
function adminLogin(email, password) {

    const url =
        `${FIREBASE_AUTH_URL}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;

    return $.ajax({
        url: url,
        method: "POST",
        contentType: "application/json",

        data: JSON.stringify({
            email: email,
            password: password,
            returnSecureToken: true
        })

    }).then(function(response) {

        adminIdToken = response.idToken;

        console.log("Admin login successful");

        return response;

    });
}


/* =================================
   GET CATEGORIES
================================= */

function getCategories() {

    return $.ajax({
        url: `${FIRESTORE_BASE_URL}/categories`,
        method: "GET",
        dataType: "json"
    });

}


/* =================================
   CREATE CATEGORY
================================= */

function createCategory(categoryName) {

    if (!adminIdToken) {
        return $.Deferred().reject(
            new Error("Please login as admin first.")
        ).promise();
    }

    const url = `${FIRESTORE_BASE_URL}/categories`;

    const categoryData = {

        fields: {
            name: {
                stringValue: categoryName
            },

            active: {
                booleanValue: true
            },

            createdAt: {
                timestampValue: new Date().toISOString()
            }
        }

    };

    return $.ajax({

        url: url,
        method: "POST",

        headers: {
            "Authorization": `Bearer ${adminIdToken}`
        },

        contentType: "application/json",

        data: JSON.stringify(categoryData)

    });

}

// CUSTOMER REGISTRATION - FIREBASE AUTH REST API

function registerCustomer(name, email, password, mobile) {

    const url = `${FIREBASE_AUTH_URL}/accounts:signUp?key=${FIREBASE_API_KEY}`;

    return $.ajax({
        url: url,
        method: "POST",
        contentType: "application/json",

        data: JSON.stringify({
            email: email,
            password: password,
            returnSecureToken: true
        })
    });
}

// CREATE CUSTOMER PROFILE IN FIRESTORE
function createCustomerProfile(uid, name, email, mobile, idToken) {

    const url = `${FIRESTORE_BASE_URL}/customers/${uid}`;

    const customerData = {
        fields: {
            name: {
                stringValue: name
            },
            email: {
                stringValue: email
            },
            mobile: {
                stringValue: mobile
            },
            creditLimit: {
                integerValue: "0"
            },
            active: {
                booleanValue: true
            },
            createdAt: {
                timestampValue: new Date().toISOString()
            }
        }
    };

    return $.ajax({
        url: url,
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${idToken}`
        },
        contentType: "application/json",
        data: JSON.stringify(customerData)
    });
}

// CUSTOMER LOGIN - FIREBASE AUTH REST API
function loginCustomer(email, password) {

    const url =
        `${FIREBASE_AUTH_URL}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;

    return $.ajax({
        url: url,
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({
            email: email,
            password: password,
            returnSecureToken: true
        })
    });
}

// CUSTOMER PASSWORD RESET - FIREBASE AUTH REST API
function resetCustomerPassword(email) {

    const url =
        `${FIREBASE_AUTH_URL}/accounts:sendOobCode?key=${FIREBASE_API_KEY}`;

    return $.ajax({
        url: url,
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({
            requestType: "PASSWORD_RESET",
            email: email
        })
    });
}

// GET CUSTOMER PROFILE FROM FIRESTORE
function getCustomerProfile(uid, idToken) {

    const url = `${FIRESTORE_BASE_URL}/customers/${uid}`;

    return $.ajax({
        url: url,
        method: "GET",
        headers: {
            Authorization: `Bearer ${idToken}`
        },
        dataType: "json"
    });
}

// REFRESH FIREBASE AUTHENTICATION TOKEN
function refreshAuthToken(refreshToken) {

    const url =
        `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;

    return $.ajax({
        url: url,
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        data: {
            grant_type: "refresh_token",
            refresh_token: refreshToken
        }
    });
}

