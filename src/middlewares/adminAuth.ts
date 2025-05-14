import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// ✅ Extend Express Request to include `user`
interface AuthRequest extends Request {
  user?: {
    adminId: string;
    role: string;
  };
}

export const adminAuth = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const token = req.header("Authorization")?.split(" ")[1];

    if (!token) {
      res
        .status(403)
        .json({ success: false, message: "Access denied, no token provided" });
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
        adminId: string;
        role: string;
      };

      if (!roles.includes(decoded.role)) {
        res
          .status(403)
          .json({
            success: false,
            message: "Access denied, insufficient permissions",
          });
        return;
      }

      req.user = decoded; // ✅ Attach user data to request

      next();
    } catch (error) {
      res.status(401).json({ success: false, message: "Invalid token" });
    }
  };
};
