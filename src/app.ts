// import express from "express";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes";
import brandRoutes from "./routes/brand.routes";
import projectRoutes from "./routes/project.routes";
import socRoutes from "./routes/society.routes";
import cityRoutes from "./routes/city.routes";
import areaRoutes from "./routes/area.routes";
import activityRoutes from "./routes/activity.routes";
import vendorRoutes from "./routes/vendor.routes";
import orderRoutes from "./routes/customerData.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import adminRoutes from "./routes/admin.routes";
import adminDashboardRoutes from "./routes/adminDashboard.routes";
import reportsRoutes from "./routes/reports.routes";
import promotersRoutes from "./routes/promoter.routes";
import promoRoutes from "./routes/promoCode.routes";
import appRoutes from "./routes/app.routes";
import proxyImage from "./routes/proxyImage.routes";
import "./cron/dailyJob";

import bodyParser from "body-parser";

// Load environment variables
dotenv.config();

const app = express();

var corsOptions = {
  // origin: ["http://localhost:3000", "http://localhost:3001"],
  origin: true,
  methods: ["GET", "POST", "DELETE", "PUT", "PATCH"],
  credentials: true,
};

// Middleware
app.use(cors(corsOptions)); // Enable CORS for cross-origin requests
app.use(express.json()); // Parse incoming JSON requests
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = process.hrtime(); // Start time
  const timestamp = new Date().toISOString();
  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

  // console.log(`[${timestamp}] ${req.method} ${fullUrl}`);

  // if (Object.keys(req.body).length) console.log("Body:", req.body);
  // if (Object.keys(req.query).length) console.log("Query Params:", req.query);

  // ✅ Capture Response Time
  res.on("finish", () => {
    const diff = process.hrtime(start);
    const responseTime = (diff[0] * 1e3 + diff[1] / 1e6).toFixed(2); // Convert to milliseconds
    console.log(
      `🚀 ~ apiURL :- ${req.method} ${fullUrl} Response Time:- ${responseTime} ms`
    );
    if (Object.keys(req.body).length) console.log("Body:", req.body);
    if (Object.keys(req.query).length) console.log("Query Params:", req.query);
  });

  next();
});

// Routes
app.use("/auth", authRoutes); // Authentication routes
app.use("/brand", brandRoutes); // Brand routes
app.use("/project", projectRoutes); // Project routes
app.use("/soc", socRoutes); // Society routes
app.use("/city", cityRoutes); // City routes
app.use("/areas", areaRoutes); // Area routes
app.use("/activity", activityRoutes); // Activity routes
app.use("/vendor", vendorRoutes); // Vendor routes
app.use("/order", orderRoutes); // Order routes
app.use("/dashboard", dashboardRoutes); // Dashboard routes
app.use("/admin", adminRoutes);
app.use("/adminDashboard", adminDashboardRoutes);
app.use("/report", reportsRoutes);
app.use("/promoter", promotersRoutes);
app.use("/promo", promoRoutes);
app.use("/app", appRoutes);
app.use("/proxy-image", proxyImage);

// Health check endpoint
app.get("/", (req, res) => {
  res.send("API is running...");
});

export default app;
