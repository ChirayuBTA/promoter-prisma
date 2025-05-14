import { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";

dotenv.config();

export const verifyApiKey = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    res.status(403).json({ message: "Unauthorized request. Invalid API Key." });
    return; // ✅ Ensure the function stops execution here
  }

  next(); // ✅ Call next() to pass control to the next middleware
};
