import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/db";
const JWT_SECRET = process.env.JWT_SECRET;

interface AuthenticatedRequest extends Request {
  promoter?: { id: string; phone: string };
}

// export const authenticatePromoter = (
//   req: AuthenticatedRequest,
//   res: Response,
//   next: NextFunction
// ) => {
//   const token = req.headers.authorization?.split(" ")[1]; // Get token from `Authorization` header

//   if (!token) {
//     return res
//       .status(401)
//       .json({ message: "Unauthorized: No token provided." });
//   }

//   try {
//     const decoded = jwt.verify(token, JWT_SECRET) as {
//       id: string;
//       phone: string;
//     };
//     req.promoter = decoded; // Attach decoded user info to request
//     next(); // Proceed to next middleware or route
//   } catch (error) {
//     return res.status(401).json({ message: "Unauthorized: Invalid token." });
//   }
// };

export const authenticateUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const MIN_SUPPORTED_VERSION = "1.0.0"; // Change this to your minimum supported version
  try {
    // ✅ Version check
    const versionHeader = req.headers["x-app-version"];

    if (MIN_SUPPORTED_VERSION !== versionHeader) {
      res.status(426).json({
        success: false,
        message: "Please update your app to continue",
      });
      return;
    }

    // ✅ Auth check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res
        .status(401)
        .json({ success: false, message: "Unauthorized: No token provided" });
      return;
    }

    const token = authHeader.split(" ")[1];

    // ✅ Find promoter by session token
    const promoter = await prisma.promoter.findFirst({
      where: { sessionToken: token },
    });

    if (!promoter) {
      res
        .status(401)
        .json({ success: false, message: "Unauthorized: Invalid token" });
      return;
    }

    // ✅ Attach promoter to request
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        id: string;
        phone: string;
      };
      req.promoter = { id: decoded.id, phone: decoded.phone }; // Attach decoded user info to request
      next(); // ✅ Only one `next()`
    } catch (error) {
      res
        .status(401)
        .json({ success: false, message: "Unauthorized: Invalid session" });
      return;
    }
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ success: false, message: "Authentication failed" });
    return;
  }
};
