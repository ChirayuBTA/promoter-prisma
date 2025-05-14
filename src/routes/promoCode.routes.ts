import express from "express";
import {
  createPromoCode,
  getPromoCode,
} from "../controllers/promoCode.controller";

const router = express.Router();

// Promoter Routes
router.post("/", createPromoCode);
router.get("/", getPromoCode);

export default router;
