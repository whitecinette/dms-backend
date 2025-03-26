const mongoose = require('mongoose');
exports.getAdditionalFields = (role, data) => {
    let additionalFields = {};
    switch (role.toLowerCase()) {
        case "admin":
        case "super_admin":
            additionalFields = {
                phone: data.phone || "0000000000",
                verified: data.verified || false,
            };
            break;
        case "employee":
        case "hr":
            additionalFields = {
                phone: data.phone || "0000000000",
                verified: data.verified || false,
                birth_date: data.birth_date || "01-01-2000",
                address: data.address || "Not Provided",
                family_info: {
                    father_name: data.family_info?.father_name || "Not Provided",
                    father_bday: data.family_info?.father_bday || "01-01-2000",
                    mother_name: data.family_info?.mother_name || "Not Provided",
                    mother_bday: data.family_info?.mother_bday || "01-01-2000",
                    spouse_name: data.family_info?.spouse_name || "Not Provided",
                    spouse_bday: data.family_info?.spouse_bday || "01-01-2000",
                    wedding_anniversary: data.family_info?.wedding_anniversary || "01-01-2000",
                    children: Array.isArray(data.family_info?.children) ? data.family_info?.children.map(child => ({
                        name: child.name || "Not Provided",
                        birth_date: child.birth_date || "01-01-2000"
                    })) : []
                },
                bank_details: {
                    account_holder_name: data.bank_details?.account_holder_name || "Not Provided",
                    account_number: data.bank_details?.account_number || "0000000000",
                    ifsc: data.bank_details?.ifsc || "DEFAULTIFSC",
                    bank_name: data.bank_details?.bank_name || "Not Provided",
                    phone_number: data.bank_details?.bank_phone || "0000000000"
                }
                //  latitude: data.latitude || "0.0",
                // longitude: data.longitude || "0.0"
               
            };
            break;
        case "mdd":
            additionalFields = {
                city: data.city || "Unknown",
                address: data.address || "Not Provided",
                distributor_type: data.distributor_type || "Not Specified",
                owner_details: {
                    name: data.owner_details?.owner_name || "Not Provided",
                    phone: data.owner_details?.owner_phone || "0000000000",
                    email: data.owner_details?.owner_email || "notprovided@example.com",
                    birth_date: data.owner_details?.owner_birth_date || "01-01-2000",
                    family_info: {
                        father_name: data.owner_details?.family_info?.father_name || "Not Provided",
                        father_bday: data.owner_details?.family_info?.father_bday || "01-01-2000",
                        mother_name: data.owner_details?.family_info?.mother_name || "Not Provided",
                        mother_bday: data.owner_details?.family_info?.mother_bday || "01-01-2000",
                        spouse_name: data.owner_details?.family_info?.spouse_name || "Not Provided",
                        spouse_bday: data.owner_details?.family_info?.spouse_bday || "01-01-2000",
                        wedding_anniversary: data.owner_details?.family_info?.wedding_anniversary || "01-01-2000",
                        children: Array.isArray(data.owner_details?.family_info?.children) ? data.owner_details?.family_info?.children.map(child => ({
                            name: child.name || "Not Provided",
                            birth_date: child.birth_date || "01-01-2000"
                        })) : []
                    }
                },
                shop_anniversary: data.shop_anniversary || "01-01-2000",
                credit_limit: data.credit_limit || 0,
                geotag_picture: data.geotag_picture || "Not Available",
                latitude: data.latitude || "0.0",
                longitude: data.longitude || "0.0"
            };
            break;
       case "dealer":
        additionalFields = {
         city: data.city || "Unknown",
         cluster: data.cluster || "Not Provided",
         address: data.address || "Not Provided",
         category: data.category || "Not Specified",
         owner_details: {
             name: data.owner_details?.name || "Not Provided",
             phone: data.owner_details?.phone || "0000000000",
             email: data.owner_details?.email || "notprovided@example.com",
             birth_date: data.owner_details?.birth_date || "01-01-2000",
             family_info: {
                 father_name: data.owner_details?.family_info?.father_name || "Not Provided",
                 father_bday: data.owner_details?.family_info?.father_bday || "01-01-2000",
                 mother_name: data.owner_details?.family_info?.mother_name || "Not Provided",
                 mother_bday: data.owner_details?.family_info?.mother_bday || "01-01-2000",
                 spouse_name: data.owner_details?.family_info?.spouse_name || "Not Provided",
                 spouse_bday: data.owner_details?.family_info?.spouse_bday || "01-01-2000",
                 wedding_anniversary: data.owner_details?.family_info?.wedding_anniversary || "01-01-2000",
                 children: Array.isArray(data.owner_details?.family_info?.children)
                     ? data.owner_details.family_info.children.map(child => ({
                         name: child.name || "Not Provided",
                         birth_date: child.birth_date || "01-01-2000"
                     }))
                     : []
             }
         },
         shop_anniversary: data.shop_anniversary || "01-01-2000",
         credit_limit: data.credit_limit || 0,
         geotag_picture: data.geotag_picture || "Not Available",
         latitude: mongoose.Types.Decimal128.fromString(data.latitude?.toString() || "0.0"),
         longitude: mongoose.Types.Decimal128.fromString(data.longitude?.toString() || "0.0")
     };
    break;

    }
    return additionalFields;
};
