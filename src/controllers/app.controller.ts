import { Request, Response } from "express";
import prisma from "../config/db";
import jwt from "jsonwebtoken";
import { startOfDay, endOfDay } from "date-fns";
import multer from "multer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { BlobServiceClient } from "@azure/storage-blob";

const JWT_SECRET = process.env.JWT_SECRET;

dotenv.config();

// Configure Multer to store files outside "src/"
const upload = multer({ dest: path.join(__dirname, "../../uploads") });

const AZURE_STORAGE_CONNECTION_STRING =
  process.env.AZURE_STORAGE_CONNECTION_STRING!;
const AZURE_CONTAINER_NAME = "events";

if (!AZURE_STORAGE_CONNECTION_STRING || !AZURE_CONTAINER_NAME) {
  console.error("Azure storage configuration missing in .env");
  process.exit(1);
}

const blobServiceClient = BlobServiceClient.fromConnectionString(
  AZURE_STORAGE_CONNECTION_STRING
);
const containerClient =
  blobServiceClient.getContainerClient(AZURE_CONTAINER_NAME);

export const getAllCities = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { page, limit, search = "" } = req.query as Record<string, string>;

    const promoterId = (req as any).promoter?.id;
    if (!promoterId) {
      res
        .status(401)
        .json({ success: false, message: "Unauthorized: No promoter data" });
      return;
    }

    await prisma.promoter.update({
      where: { id: promoterId },
      data: { lastActive: new Date() },
    });

    const pageNumber = page ? Math.max(1, parseInt(page, 10)) : null;
    const pageSize = limit ? Math.max(1, parseInt(limit, 10)) : null;

    const where: any = {};

    if (search) {
      where.OR = [{ name: { contains: search, mode: "insensitive" } }];
    }
    where.status = "ACTIVE";
    // ✅ Fetch only active cities
    let cities = await prisma.city.findMany({
      where, // ✅ Only active cities
      select: {
        id: true,
        name: true, // ✅ City name
        status: true, // ✅ City status
      },
    });

    // ✅ Apply Pagination
    const totalCount = cities.length;
    if (pageNumber && pageSize) {
      cities = cities.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
    }

    res.json({
      success: true,
      total: totalCount,
      page: pageNumber ?? "All",
      pageSize: pageSize ?? totalCount,
      data: cities,
    });
  } catch (error) {
    console.error("❌ Error fetching cities:", error);
    res.status(500).json({ success: false, message: "Failed to fetch cities" });
  }
};

export const getAllActivityLocations = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      page,
      limit,
      cityId,
      search = "",
      projectId,
    } = req.query as Record<string, string>;

    const promoterId = (req as any).promoter?.id;
    if (!promoterId) {
      res
        .status(401)
        .json({ success: false, message: "Unauthorized: No promoter data" });
      return;
    }

    await prisma.promoter.update({
      where: { id: promoterId },
      data: { lastActive: new Date() },
    });

    const pageNumber = page ? Math.max(1, parseInt(page, 10)) : null;
    const pageSize = limit ? Math.max(1, parseInt(limit, 10)) : null;

    const where: any = {
      status: "ACTIVE",
    };

    if (search) {
      where.OR = [{ name: { contains: search, mode: "insensitive" } }];
    }

    if (cityId) {
      where.area = { cityId };
    }

    if (projectId) {
      where.ProjectLocation = {
        some: {
          projectId,
        },
      };
    }

    // let activityLocations = await prisma.activityLocation.findMany({
    //   where,
    //   select: {
    //     id: true,
    //     name: true,
    //     status: true,
    //     activity: {
    //       select: {
    //         id: true,
    //         name: true,
    //       },
    //     },
    //   },
    // });

    let activityLocations = await prisma.activityLocation.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        area: {
          select: {
            name: true,
            city: {
              select: {
                name: true,
              },
            },
          },
        },
        ProjectLocation: {
          select: {
            project: {
              select: {
                brand: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        activity: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const totalCount = activityLocations.length;

    if (pageNumber && pageSize) {
      activityLocations = activityLocations.slice(
        (pageNumber - 1) * pageSize,
        pageNumber * pageSize
      );
    }
    const simplifiedData = activityLocations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      status: loc.status,
      areaName: loc.area?.name ?? null,
      cityName: loc.area?.city?.name ?? null,
      activityId: loc.activity?.id ?? null,
      activityName: loc.activity?.name ?? null,
      brandNames: loc.ProjectLocation.map(
        (pl) => pl.project?.brand?.name
      ).filter(Boolean), // in case of nulls
    }));

    res.json({
      success: true,
      total: totalCount,
      page: pageNumber ?? "All",
      pageSize: pageSize ?? totalCount,
      data: simplifiedData,
    });
  } catch (error) {
    console.error("❌ Error fetching activity locations:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch activity locations" });
  }
};

export const getDashboardData = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      activityLocId,
      promoterId,
      todaysPage,
      todaysLimit,
      totalPage,
      totalLimit,
    } = req.query;

    const promoterIds = (req as any).promoter?.id;
    if (!promoterIds) {
      res
        .status(401)
        .json({ success: false, message: "Unauthorized: No promoter data" });
      return;
    }

    await prisma.promoter.update({
      where: { id: promoterIds },
      data: { lastActive: new Date() },
    });

    if (!activityLocId || typeof activityLocId !== "string") {
      res.status(400).json({
        success: false,
        message: "activityLocId is required and must be a string",
      });
      return;
    }

    if (!promoterId || typeof promoterId !== "string") {
      res.status(400).json({
        success: false,
        message: "promoterId is required and must be a string",
      });
      return;
    }

    // Convert pagination params
    const todaysPageNumber = todaysPage
      ? Math.max(1, parseInt(todaysPage as string, 10))
      : 1;
    const todaysPageSize = todaysLimit
      ? Math.max(1, parseInt(todaysLimit as string, 10))
      : 10;

    const totalPageNumber = totalPage
      ? Math.max(1, parseInt(totalPage as string, 10))
      : 1;
    const totalPageSize = totalLimit
      ? Math.max(1, parseInt(totalLimit as string, 10))
      : 10;

    // Get the start and end of today
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    // ✅ Count of today's entries
    const todaysCount = await prisma.orderCaptured.count({
      where: {
        activityLocId,
        promoterId,
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    // ✅ Get today's entries with pagination
    const todaysEntries = await prisma.orderCaptured.findMany({
      where: {
        activityLocId,
        promoterId,
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (todaysPageNumber - 1) * todaysPageSize,
      take: todaysPageSize,
    });

    // ✅ Count of all entries
    const totalCount = await prisma.orderCaptured.count({
      where: { activityLocId, promoterId },
    });

    // ✅ Get all entries with pagination
    const totalEntries = await prisma.orderCaptured.findMany({
      where: {
        activityLocId,
        promoterId,
      },
      orderBy: { createdAt: "desc" },
      skip: (totalPageNumber - 1) * totalPageSize,
      take: totalPageSize,
    });

    res.json({
      success: true,
      data: {
        todaysCount,
        todaysEntries,
        todaysPagination: {
          page: todaysPageNumber,
          pageSize: todaysPageSize,
          totalPages: Math.ceil(todaysCount / todaysPageSize),
          totalCount: todaysCount,
        },
        totalCount,
        totalEntries,
        totalPagination: {
          page: totalPageNumber,
          pageSize: totalPageSize,
          totalPages: Math.ceil(totalCount / totalPageSize),
          totalCount: totalCount,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch dashboard data" });
  }
};

export const uploadImages = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    res.status(400).json({ success: false, message: "No files uploaded" });
    return;
  }

  const { activityLocId, promoterId } = req.body;
  if (!activityLocId) {
    res
      .status(400)
      .json({ success: false, message: "activityLocId is required" });
    return;
  }

  try {
    const uploadedImages = [];

    // Loop through each uploaded file
    for (const file of req.files as Express.Multer.File[]) {
      const imagePath = path.join(__dirname, "../../uploads", file.filename);
      const blobName = `events/${Date.now()}-${file.originalname}`;
      const blobUrl = await uploadToAzure(imagePath, blobName);

      // Save image in ActivityImages table
      const newImage = await prisma.activityImages.create({
        data: {
          imgName: blobName,
          imgURL: blobUrl,
          activityLocationId: activityLocId, // ✅ Directly linking image to location
          promoterId: promoterId,
        },
      });

      uploadedImages.push(newImage);

      // Delete local file after processing
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }

    res.json({
      success: true,
      message: "Images uploaded successfully",
      uploadedImages,
    });
  } catch (error) {
    console.error("Error processing images:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to process images" });
  }
};

const uploadToAzure = async (
  filePath: string,
  blobName: string
): Promise<string> => {
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const stream = fs.createReadStream(filePath);

  await blockBlobClient.uploadStream(stream, stream.readableHighWaterMark);
  return blockBlobClient.url; // Returns the public URL of the uploaded image
};

// ✅ Middleware to handle multiple file uploads
export const uploadMiddleware = upload.array("images", 50);

export const getActivityLocation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const activityLocation = await prisma.activityLocation.findUnique({
      where: { id },
      include: {
        images: true, // ✅ Directly fetch all images for this location
      },
    });

    if (!activityLocation) {
      res
        .status(404)
        .json({ success: false, message: "Activity location not found" });
      return;
    }

    res.json({
      success: true,
      data: activityLocation,
    });
  } catch (error) {
    console.error("Error fetching activity location:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch activity location" });
  }
};

export const updateOrderFlag = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id, isFlagged } = req.body;

    const updateOrder = await prisma.orderCaptured.update({
      where: {
        id: id,
      },
      data: {
        isFlagged: isFlagged,
      },
    });

    res.json({
      success: true,
      message: `Updated  orders flag successfully.`,
      Order: updateOrder,
    });
  } catch (error) {
    console.error("❌ Error updating orders:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update orders flag." });
  }
};
