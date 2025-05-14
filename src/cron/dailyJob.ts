import cron from "node-cron";
import prisma from "../config/db"; // Adjust path based on your project structure

const runDailyJob = async () => {
  console.log("⏰ Running 12 AM cleanup: Removing promoter tokens");

  try {
    await prisma.promoter.updateMany({
      data: {
        sessionToken: null,
      },
    });

    console.log("✅ Successfully cleared all promoter tokens");
  } catch (error) {
    console.error("❌ Failed to clear promoter tokens:", error);
  }
};

// Schedule the task to run every day at 12 AM
cron.schedule("0 0 * * *", () => {
  runDailyJob();
});

// cron.schedule("*/2 * * * *", () => {
//   runDailyJob();
// });
