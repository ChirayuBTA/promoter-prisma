import express from "express";
import { getProxyImage } from "../controllers/proxyImage.controller";

const router = express.Router();

router.get("/", getProxyImage);

export default router;
