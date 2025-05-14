import express from "express";
import {
  uploadImage,
  uploadMiddleware,
} from "../controllers/customerData.controller";
import { authenticateUser } from "../middlewares/authMiddleware";

const router = express.Router();

router.post("/", authenticateUser, uploadMiddleware, uploadImage);

export default router;
