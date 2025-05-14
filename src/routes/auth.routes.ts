import express from "express";
import {
  sendOTP,
  verifyOTP,
  selfRegisterPromoter,
  verifyPromoCode,
} from "../controllers/auth.controller"; // ✅ Correct import
import { verifyApiKey } from "../middlewares/apiKeyMiddleware";
import multer from "multer";

const router = express.Router();
const upload = multer();

router.post("/send-otp", verifyApiKey, sendOTP); // ✅ Ensure no extra parentheses
router.post("/verify-otp", verifyApiKey, verifyOTP); // 🔒 Secure OTP verification
router.post("/verify-promoCode", verifyApiKey, verifyPromoCode); // 🔒 Secure OTP verification
router.post(
  "/selfRegisterPromoter",
  upload.none(),
  verifyApiKey,
  selfRegisterPromoter
);
router.post("/verify-promoCode", verifyPromoCode);
export default router;
