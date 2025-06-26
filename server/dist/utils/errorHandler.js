"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleError = handleError;
const zod_1 = require("zod");
function handleError(error, res) {
    var _a, _b;
    if (error instanceof zod_1.z.ZodError) {
        console.log("Zod error:", ((_a = error.errors[0]) === null || _a === void 0 ? void 0 : _a.message) || "Validation failed");
        console.log(`--------`);
        return res.status(400).json({
            errorMessage: ((_b = error.errors[0]) === null || _b === void 0 ? void 0 : _b.message) || "Validation failed",
            errorDetails: error.errors,
        });
    }
    let errorMessage = "Internal server error";
    let errorDetails = "An unexpected error occurred";
    let statusCode = 500;
    if (error instanceof Error) {
        errorMessage = error.message;
        errorDetails = error.stack || error.message;
        if ("code" in error) {
            switch (error.code) {
                case "ER_DUP_ENTRY":
                    statusCode = 400;
                    errorMessage = "Email or username already exists";
                    break;
                case "ER_ACCESS_DENIED_ERROR":
                    statusCode = 500;
                    errorMessage = "Database access denied";
                    break;
                case "ER_NO_SUCH_TABLE":
                    statusCode = 500;
                    errorMessage = "Database table not found";
                    break;
            }
        }
    }
    else if (typeof error === "string") {
        errorMessage = error;
        errorDetails = error;
    }
    else {
        errorDetails = JSON.stringify(error);
    }
    console.error("Error:", errorDetails);
    console.log(`--------`);
    return res.status(statusCode).json({
        errorMessage,
        details: errorDetails,
    });
}
//# sourceMappingURL=errorHandler.js.map