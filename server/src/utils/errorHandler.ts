import { Response } from "express";
import { z } from "zod";

export function handleError(error: unknown, res: Response) {
  //* Zod error
  if (error instanceof z.ZodError) {
    console.log("Zod error:", error.errors[0]?.message || "Validation failed");
    console.log(`--------`);
    return res.status(400).json({
      errorMessage: error.errors[0]?.message || "Validation failed",
      errorDetails: error.errors,
    });
  }

  //* internal server error
  let errorMessage = "Internal server error";
  let errorDetails = "An unexpected error occurred";
  let statusCode = 500;

  if (error instanceof Error) {
    errorMessage = error.message;
    errorDetails = error.stack || error.message;

    //* MySQL error
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
  } else if (typeof error === "string") {
    errorMessage = error;
    errorDetails = error;
  } else {
    errorDetails = JSON.stringify(error);
  }

  console.error("Error:", errorDetails);
  console.log(`--------`);
  return res.status(statusCode).json({
    errorMessage,
    details: errorDetails,
  });
}
