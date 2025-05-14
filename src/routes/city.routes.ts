import express from "express";
import {
  createCity,
  updateCity,
  getAllCities,
  getCityById,
  getSelectedCitiesDownload,
  deleteCities,
  updateSelectedCityStatus,
  bulkUploadCities,
} from "../controllers/city.controller"; // ✅ Import controller
import { verifyApiKey } from "../middlewares/apiKeyMiddleware";

const router = express.Router();

router.post("/", createCity);
router.get("/", verifyApiKey, getAllCities);
router.get("/:id", getCityById);
router.put("/:id", updateCity);
router.patch("/updateSelectedCityStatus", updateSelectedCityStatus);
router.delete("/:id", deleteCities);
router.post("/getSelectedCitiesDownload", getSelectedCitiesDownload);
router.post("/bulkUploadCities", bulkUploadCities);

export default router;
