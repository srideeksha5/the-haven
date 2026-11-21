
/* =========================================
   THE HAVEN - ADDRESS API
   Customer saved address management
========================================= */


/* =====================================
   ADDRESS VALIDATION
===================================== */

function validateSavedAddress(address) {

    if (!address || typeof address !== "object") {
        throw new Error("Invalid address information.");
    }

    const requiredFields = [
        "name",
        "mobile",
        "address",
        "city",
        "state",
        "pincode"
    ];

    requiredFields.forEach(function (field) {

        if (
            typeof address[field] !== "string" ||
            !address[field].trim()
        ) {
            throw new Error(
                "Please provide a valid " + field + "."
            );
        }

    });

    if (!/^[A-Za-z][A-Za-z .'-]{1,79}$/.test(address.name.trim())) {
        throw new Error("Enter a valid full name.");
    }

    if (!/^[6-9]\d{9}$/.test(address.mobile.trim())) {
        throw new Error("Enter a valid 10-digit mobile number.");
    }

    if (!/^[A-Za-z][A-Za-z .'-]{1,59}$/.test(address.city.trim())) {
        throw new Error("Enter a valid city.");
    }

    if (!/^[A-Za-z][A-Za-z .'-]{1,59}$/.test(address.state.trim())) {
        throw new Error("Enter a valid state.");
    }

    if (!/^[1-9][0-9]{5}$/.test(address.pincode.trim())) {
        throw new Error("Enter a valid 6-digit PIN code.");
    }

}


/* =====================================
   CUSTOMER ADDRESS PATH
===================================== */

function getAddressCollectionPath() {

    const uid = getCustomerUid();

    if (!uid) {
        throw new Error("Please login to manage addresses.");
    }

    return "customers/" +
        encodeURIComponent(uid) +
        "/addresses";
}


/* =====================================
   ADDRESS AUTHENTICATION
===================================== */

function getAddressToken() {

    return requireToken(
        getCustomerIdToken(),
        "Please login to manage your saved addresses."
    );

}


/* =====================================
   READ FIRESTORE ADDRESS
===================================== */

function normalizeSavedAddress(document) {

    const fields = document?.fields || {};

    const documentName = document?.name || "";

    return {

        id: documentName
            ? documentName.split("/").pop()
            : "",

        name: fields.name?.stringValue || "",

        mobile: fields.mobile?.stringValue || "",

        address: fields.address?.stringValue || "",

        city: fields.city?.stringValue || "",

        state: fields.state?.stringValue || "",

        pincode: fields.pincode?.stringValue || "",

        isDefault: fields.isDefault?.booleanValue === true,

        createdAt: fields.createdAt?.timestampValue || null,

        updatedAt: fields.updatedAt?.timestampValue || null

    };

}


/* =====================================
   GET ALL SAVED ADDRESSES
===================================== */

function getSavedAddresses() {

    return firestoreRequest({

        path: getAddressCollectionPath(),

        method: "GET",

        token: getAddressToken(),

        query: {
            pageSize: 100
        }

    }).then(function (response) {

        const documents = response?.documents || [];

        return documents.map(normalizeSavedAddress);

    });

}


/* =====================================
   GET SINGLE SAVED ADDRESS
===================================== */

function getSavedAddressById(addressId) {

    if (!addressId) {
        return Promise.reject(
            new Error("Address ID is required.")
        );
    }

    return firestoreRequest({

        path: getAddressCollectionPath() +
            "/" + encodeURIComponent(addressId),

        method: "GET",

        token: getAddressToken()

    }).then(normalizeSavedAddress);

}


/* =====================================
   ADD SAVED ADDRESS
===================================== */

function addSavedAddress(address) {

    try {
        validateSavedAddress(address);
    } catch (error) {
        return Promise.reject(error);
    }

    return getSavedAddresses().then(function (addresses) {

        // The first saved address becomes the default.
        const makeDefault =
            addresses.length === 0 ||
            address.isDefault === true;

        const createAddress = function () {

            return firestoreRequest({

                path: getAddressCollectionPath(),

                method: "POST",

                token: getAddressToken(),

                data: {

                    fields: {

                        name: fsString(address.name.trim()),

                        mobile: fsString(address.mobile.trim()),

                        address: fsString(address.address.trim()),

                        city: fsString(address.city.trim()),

                        state: fsString(address.state.trim()),

                        pincode: fsString(address.pincode.trim()),

                        isDefault: fsBool(makeDefault),

                        createdAt: fsTimestamp()

                    }

                }

            });

        };

        // If the new address is default, unset the previous default.
        if (makeDefault) {

            return Promise.all(
                addresses
                    .filter(item => item.isDefault)
                    .map(item => updateSavedAddress(item.id, {
                        ...item,
                        isDefault: false
                    }))
            ).then(createAddress);

        }

        return createAddress();

    });

}


/* =====================================
   UPDATE SAVED ADDRESS
===================================== */

function updateSavedAddress(addressId, address) {

    if (!addressId) {
        return Promise.reject(
            new Error("Address ID is required.")
        );
    }

    try {
        validateSavedAddress(address);
    } catch (error) {
        return Promise.reject(error);
    }

    return firestoreRequest({

        path: getAddressCollectionPath() +
            "/" + encodeURIComponent(addressId),

        method: "PATCH",

        token: getAddressToken(),

        query: {

            "updateMask.fieldPaths": [
                "name",
                "mobile",
                "address",
                "city",
                "state",
                "pincode",
                "isDefault",
                "updatedAt"
            ]

        },

        data: {

            fields: {

                name: fsString(address.name.trim()),

                mobile: fsString(address.mobile.trim()),

                address: fsString(address.address.trim()),

                city: fsString(address.city.trim()),

                state: fsString(address.state.trim()),

                pincode: fsString(address.pincode.trim()),

                isDefault: fsBool(address.isDefault === true),

                updatedAt: fsTimestamp()

            }

        }

    });

}


/* =====================================
   SET DEFAULT ADDRESS
===================================== */

function setDefaultAddress(addressId) {

    if (!addressId) {
        return Promise.reject(
            new Error("Address ID is required.")
        );
    }

    return getSavedAddresses().then(function (addresses) {

        const selectedAddress = addresses.find(function (item) {
            return item.id === addressId;
        });

        if (!selectedAddress) {
            throw new Error("Saved address not found.");
        }

        // Remove the default flag from other addresses.
        const updateOtherAddresses = addresses
            .filter(function (item) {
                return item.id !== addressId && item.isDefault;
            })
            .map(function (item) {

                return updateSavedAddress(item.id, {
                    ...item,
                    isDefault: false
                });

            });

        return Promise.all(updateOtherAddresses);

    }).then(function () {

        return firestoreRequest({

            path: getAddressCollectionPath() +
                "/" + encodeURIComponent(addressId),

            method: "PATCH",

            token: getAddressToken(),

            query: {
                "updateMask.fieldPaths": [
                    "isDefault",
                    "updatedAt"
                ]
            },

            data: {

                fields: {
                    isDefault: fsBool(true),
                    updatedAt: fsTimestamp()
                }

            }

        });

    });

}


/* =====================================
   DELETE SAVED ADDRESS
===================================== */

function deleteSavedAddress(addressId) {

    if (!addressId) {
        return Promise.reject(
            new Error("Address ID is required.")
        );
    }

    return firestoreRequest({

        path: getAddressCollectionPath() +
            "/" + encodeURIComponent(addressId),

        method: "DELETE",

        token: getAddressToken()

    });

}
