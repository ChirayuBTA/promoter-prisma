import express from "express";
import {
  adminLogin,
  createAdmin,
  getAllUsers,
  deleteAdmin,
  updateAdminRoleStatus,
  getAdminById,
  changeAdminPassword,
  resetAdminPassword,
  sendAdminResetOTP,
} from "../controllers/admin.controller";
import { adminAuth } from "../middlewares/adminAuth";
import prisma from "../config/db";
const router = express.Router();

router.post("/login", adminLogin);
router.post("/sendOtp", sendAdminResetOTP);
router.post("/resetPassword", resetAdminPassword);

// Only ADMIN or SUPER_ADMIN can access this
router.get("/protected", adminAuth(["ADMIN", "SUPER_ADMIN"]), (req, res) => {
  res.json({ success: true, message: "This is a protected admin route" });
});

// Only SUPER_ADMIN can access this
router.get("/", adminAuth(["SUPER_ADMIN"]), getAllUsers);
router.get("/:id", adminAuth(["SUPER_ADMIN"]), getAdminById);
router.post("/", adminAuth(["SUPER_ADMIN"]), createAdmin);
router.delete("/:id", adminAuth(["SUPER_ADMIN"]), deleteAdmin); // delete route
router.put(
  "/changePassword",
  adminAuth(["SUPER_ADMIN", "ADMIN"]),
  changeAdminPassword
); // delete route
router.put("/:id", adminAuth(["SUPER_ADMIN"]), updateAdminRoleStatus); // delete route

export default router;
