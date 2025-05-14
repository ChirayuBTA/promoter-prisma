import { Request, Response } from "express";
import multer from "multer";
import dotenv from "dotenv";
import prisma from "../config/db";
import { BlobServiceClient } from "@azure/storage-blob";
import OpenAI from "openai";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";

dotenv.config();

// Multer setup
const upload = multer({ dest: path.join(__dirname, "../../uploads") });

const AZURE_STORAGE_CONNECTION_STRING =
  process.env.AZURE_STORAGE_CONNECTION_STRING!;
const AZURE_CONTAINER_NAME = process.env.AZURE_CONTAINER_NAME!;

const blobServiceClient = BlobServiceClient.fromConnectionString(
  AZURE_STORAGE_CONNECTION_STRING
);
const containerClient =
  blobServiceClient.getContainerClient(AZURE_CONTAINER_NAME);

// Gemini via OpenAI SDK setup
const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

export const uploadMiddleware = upload.array("images", 50);

export const addOverlayToImage = async (
  imagePath: string,
  latitude: string,
  longitude: string,
  location: string
): Promise<string> => {
  const originalImage = await loadImage(imagePath);
  const width = originalImage.width;
  const height = originalImage.height;

  // Create canvas with same size
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Draw the original image
  ctx.drawImage(originalImage, 0, 0, width, height);

  // Calculate responsive dimensions
  const fontSize = Math.max(24, Math.floor(width / 30)); // Responsive font size based on image width
  const margin = Math.max(20, Math.floor(width / 50));
  const lineHeight = fontSize * 1.2;
  const padding = margin / 2;

  // Text style setup
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = "white";
  ctx.strokeStyle = "black";
  ctx.lineWidth = 2;

  // Text wrapping function
  const wrapText = (text: string, maxWidth: number): string[] => {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    words.forEach((word) => {
      const testLine =
        currentLine.length === 0 ? word : `${currentLine} ${word}`;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    return lines;
  };

  // Get current timestamp
  const timestamp = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Prepare text content
  const coordsText = `🌐 Lat: ${latitude} | Long: ${longitude}`;

  // Calculate max width for text wrapping (based on image width)
  const maxTextWidth = Math.min(
    width * 0.9 - padding * 2,
    width - margin * 2 - padding * 2
  );

  // Wrap location text if needed
  const locationLines = wrapText(`📍 Location: ${location}`, maxTextWidth);

  // Combine all lines
  const allLines = [`⏱ Timestamp: ${timestamp}`, coordsText, ...locationLines];

  // Calculate total height needed for all text lines
  const totalLinesHeight = allLines.length * lineHeight;
  const backgroundHeight = totalLinesHeight + padding * 2;

  // Find max line width for the background
  let maxLineWidth = 0;
  allLines.forEach((line) => {
    const metrics = ctx.measureText(line);
    maxLineWidth = Math.max(maxLineWidth, metrics.width);
  });

  const backgroundWidth = maxLineWidth + padding * 2;

  // Draw semi-transparent background
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(
    margin,
    height - margin - backgroundHeight,
    backgroundWidth,
    backgroundHeight
  );

  // Draw text on top of the background
  ctx.fillStyle = "white";
  let y = height - margin - backgroundHeight + padding + fontSize;

  allLines.forEach((line) => {
    ctx.strokeText(line, margin + padding, y);
    ctx.fillText(line, margin + padding, y);
    y += lineHeight;
  });

  // Save the updated image to a new file
  const newPath = path.join(
    path.dirname(imagePath),
    `overlay-${Date.now()}.png`
  );
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(newPath, buffer);

  return newPath;
};

// Upload to Azure
const uploadToAzure = async (
  filePath: string,
  blobName: string
): Promise<string> => {
  console.log("Uploading to Azure: ", blobName);
  console.log(filePath);

  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const stream = fs.createReadStream(filePath);
  await blockBlobClient.uploadStream(stream, stream.readableHighWaterMark);
  return blockBlobClient.url;
};

// // Gemini processing function for order image
// const processOrderWithGemini = async (base64Image: string) => {
//   // const prompt = `Extract structured JSON from the given order receipt image. The JSON format should be:
//   // {
//   //   "orderId": "string",
//   //   "totalBill": "number",
//   //   "deliveryAddress": "string",
//   //   "orderPlaced": "string",
//   //   "promoVoucher": "number",
//   //   "items": [
//   //     {
//   //       "name": "string",
//   //       "price": "number",
//   //       "quantity": "number"
//   //     }
//   //   ]
//   // }
//   // For promoVoucher, look at the value for this order from the image, not lifetime savings or delivery savings.
//   // Only return valid JSON with no extra text.`;
//   const prompt = `Extract structured JSON from the given order receipt image. The JSON format should be:
//   {
//     "orderId": "string",
//     "totalBill": "number",
//     "deliveryAddress": "string",
//     "orderPlaced": "string",
//     "promoVoucher": "number",
//     "items": [
//       {
//         "name": "string",
//         "price": "number",
//         "quantity": "number"
//       }
//     ]
//   }
//   For promoVoucher, extract the actual promo discount applied to this order, and ensure the value is always a **positive number** (no minus sign). Ignore lifetime savings or delivery discounts.
//   Only return valid JSON with no extra text.`;

//   return await sendToGemini(base64Image, prompt);
// };

// // Gemini processing function for profile image
// const processProfileWithGemini = async (base64Image: string) => {
//   const prompt = `Extract profile info from this image. Return JSON in this format:
//   {
//     "name": "string",
//     "phone": "string"
//   }
//   Only return valid JSON with no extra text.`;

//   return await sendToGemini(base64Image, prompt);
// };

// // Common Gemini function
const sendToGemini = async (base64Image: string, prompt: string) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64Image}` },
            },
          ],
        },
      ],
    });

    let content = response.choices?.[0]?.message?.content || "";
    content = content.replace(/```json|```/g, "").trim();
    return JSON.parse(content);
  } catch (err) {
    console.error("Gemini API Error:", err);
    return {};
  }
};

export const uploadImage = async (
  req: Request,
  res: Response
): Promise<void> => {
  const images = req.files as
    | Express.Multer.File[]
    | { [fieldname: string]: Express.Multer.File[] };
  const files = Array.isArray(images) ? images : images["images"]; // handle both .array() or .fields()

  if (!files || files.length === 0) {
    res.status(400).json({ success: false, message: "No images uploaded" });
    return;
  }

  const {
    promoterId,
    projectId,
    brandId,
    activityLocId,
    activityId,
    vendorId,
    entryType,
    deviceInfo,
    name: customerName,
    phone: customerPhone,
    latitude: latitude,
    longitude: longitude,
    location: location,
  } = req.body;

  let orderData: any = null;
  let profileData: any = null;
  let orderBlobUrl: string | null = null;
  let profileBlobUrl: string | null = null;
  let orderHistoryUrl: string | null = null;
  try {
    const brand = await prisma.brand.findUnique({
      where: { id: brandId || vendorId }, // adjust based on your relations
      select: { ocrPrompt: true },
    });

    // const defaultPrompt = `...your existing prompt...`;

    const promptToUse = brand?.ocrPrompt;

    for (const file of files) {
      const base64 = fs.readFileSync(file.path).toString("base64");

      const response = await processBothPossibilities(base64, promptToUse);
      const overlayedPath = await addOverlayToImage(
        file.path,
        latitude,
        longitude,
        location
      );

      const blobUrl = await uploadToAzure(
        overlayedPath,
        `uploads/${Date.now()}-${file.originalname}`
      );

      if (response.orderId) {
        orderData = response;
        orderBlobUrl = blobUrl;

        // ✅ Only set profileData if not already set and response contains valid data
        if (!profileData && (response.customerName || response.customerPhone)) {
          profileData = {
            name: response.customerName,
            phone: response.customerPhone,
          };
        }
      } else if (response.phone) {
        profileData = response;
        profileBlobUrl = blobUrl;
      } else {
        orderHistoryUrl = blobUrl;
      }

      // TODO: Cleanup after reading
      if (fs.existsSync(overlayedPath)) fs.unlinkSync(overlayedPath);
    }

    if (orderData === null) {
      const existingPhone = await prisma.orderCaptured.findFirst({
        where: {
          customerPhone: profileData.phone,
          OR: [{ projectId: projectId || undefined }],
        },
      });

      if (existingPhone) {
        res.status(400).json({
          success: false,
          message: "This customer phone number already exists.",
        });
        return;
      }
      if (
        entryType === "order" &&
        (!orderData?.orderId ||
          orderData.orderId === "N/A" ||
          orderData.orderId === "string")
      ) {
        res.status(400).json({
          success: false,
          message: "Order Image is required",
        });
        return;
      }

      if (
        entryType === "signup" &&
        (!profileData?.phone || profileData.phone.trim() === "")
      ) {
        res.status(400).json({
          success: false,
          message: "Profile Image is required",
        });
        return;
      }

      if (entryType === "both") {
        if (!orderBlobUrl || !profileBlobUrl) {
          res.status(400).json({
            success: false,
            message: "Both Order and Profile images are required",
          });
          return;
        }

        if (
          !orderData?.orderId ||
          orderData.orderId === "N/A" ||
          orderData.orderId === "string"
        ) {
          res.status(400).json({
            success: false,
            message: "Valid Order Image is required",
          });
          return;
        }

        if (!profileData?.phone || profileData.phone.trim() === "") {
          res.status(400).json({
            success: false,
            message: "Valid Profile Image with Phone number is required",
          });
          return;
        }
      }

      const newOrder = await prisma.orderCaptured.create({
        data: {
          customerName: !profileData ? customerName : profileData.name,
          customerPhone: !profileData ? customerPhone : profileData.phone,
          promoterId,
          projectId,
          activityLocId,
          activityId,
          vendorId,
          deviceInfo,
          orderImage: orderBlobUrl,
          profileImage: profileBlobUrl,
          OrderHistoryImage: orderHistoryUrl,
          orderId: null,
          orderAddress: null,
          cashbackAmount: null,
          orderPlacedAt: null,
          latitude,
          longitude,
          location,
        },
      });

      if (promoterId) {
        await prisma.promoter.update({
          where: { id: promoterId },
          data: { lastActive: new Date() },
        });
      }
    } else {
      if (!orderBlobUrl) {
        res.json({
          success: false,
          message: "Please Upload Order Image",
        });
        return;
      }
      if (
        (!orderData.orderId || orderData.orderId === "N/A",
        orderData.orderId === "string")
      ) {
        res.json({
          success: false,
          message: "Please Upload a valid Order Image",
        });
        return;
      }

      const existingOrder = await prisma.orderCaptured.findFirst({
        where: {
          orderId: orderData.orderId,
          OR: [{ projectId: projectId || undefined }],
        },
      });

      if (existingOrder) {
        res
          .status(400)
          .json({ success: false, message: "Order already exists" });
        return;
      }

      if (profileData?.phone && projectId) {
        const existingPhone = await prisma.orderCaptured.findFirst({
          where: {
            customerPhone: profileData.phone,
            OR: [{ projectId: projectId || undefined }],
          },
        });

        if (existingPhone) {
          res.status(400).json({
            success: false,
            message: "This customer phone number already exists.",
          });
          return;
        }
      }
      if (
        entryType === "order" &&
        (!orderData?.orderId ||
          orderData.orderId === "N/A" ||
          orderData.orderId === "string")
      ) {
        res.status(400).json({
          success: false,
          message: "Order Image is required",
        });
        return;
      }

      if (
        entryType === "signup" &&
        (!profileData?.phone || profileData.phone.trim() === "")
      ) {
        res.status(400).json({
          success: false,
          message: "Profile Image is required",
        });
        return;
      }

      if (entryType === "both") {
        if (!orderBlobUrl || !profileBlobUrl) {
          res.status(400).json({
            success: false,
            message: "Both Order and Profile images are required",
          });
          return;
        }

        if (
          !orderData?.orderId ||
          orderData.orderId === "N/A" ||
          orderData.orderId === "string"
        ) {
          res.status(400).json({
            success: false,
            message: "Valid Order Image is required",
          });
          return;
        }

        if (!profileData?.phone || profileData.phone.trim() === "") {
          res.status(400).json({
            success: false,
            message: "Valid Profile Image with Phone number is required",
          });
          return;
        }
      }

      const newOrder = await prisma.orderCaptured.create({
        data: {
          customerName: !profileData ? customerName : profileData.name,
          customerPhone: !profileData ? customerPhone : profileData.phone,
          promoterId,
          projectId,
          activityLocId,
          activityId,
          vendorId,
          deviceInfo,
          orderImage: orderBlobUrl,
          profileImage: profileBlobUrl,
          OrderHistoryImage: orderHistoryUrl,
          orderId: orderData.orderId,
          orderAddress: orderData.deliveryAddress,
          cashbackAmount: parseFloat(orderData.promoVoucher),
          orderPlacedAt: orderData.orderPlaced,
          latitude,
          longitude,
          location,
        },
      });

      if (promoterId) {
        await prisma.promoter.update({
          where: { id: promoterId },
          data: { lastActive: new Date() },
        });
      }
    }

    res.json({
      success: true,
      message: "Images processed and data saved",
      // data: newOrder,
    });
  } catch (err) {
    console.error("Error in uploadImage:", err);
    res.status(500).json({ success: false, message: "Processing failed" });
  }
};

const processBothPossibilities = async (
  base64Image: string,
  prompt: string
) => {
  return await sendToGemini(base64Image, prompt);
};
