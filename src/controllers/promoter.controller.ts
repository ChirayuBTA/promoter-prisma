import { Request, Response } from "express";
import prisma from "../config/db";
import multer from "multer";
import fs from "fs";
import path from "path";
import { BlobServiceClient } from "@azure/storage-blob";
import dotenv from "dotenv";

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

/**
 * @desc Create a new promoter and assign to projects
 * @route POST /promoter
 */
export const createPromoter = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    let {
      name,
      email,
      phone,
      altPhone,
      vendorId,
      cityId,
      createdBy,
      projectIds = [],
    } = req.body;

    name = name.trim().replace(/\s+/g, " ");

    if (!phone) {
      res.status(201).json({
        success: false,
        message: "Phone number is required",
      });
      return;
    }

    // Check for duplicate email or phone
    const existingPromoter = await prisma.promoter.findFirst({
      where: {
        OR: [
          { phone: { equals: phone } },
          ...(email ? [{ email: email }] : []), // Only add if contactEmail is present
        ],
      },
    });

    if (existingPromoter) {
      let duplicateField = "";
      if (existingPromoter.phone === phone) duplicateField = "Phone";
      if (existingPromoter.email === email) duplicateField = "Email";

      res.status(400).json({
        success: false,
        message: `${duplicateField} already exists`,
      });
      return;
    }

    // Create promoter
    const newPromoter = await prisma.promoter.create({
      data: {
        name,
        email,
        phone,
        altPhone,
        vendorId,
        cityId,
        createdBy,
      },
    });

    // Assign promoter to selected projects
    if (projectIds.length > 0) {
      const projectPromoterData = projectIds.map((projectId: string) => ({
        projectId,
        promoterId: newPromoter.id,
      }));

      await prisma.projectPromoter.createMany({ data: projectPromoterData });
    }

    res.status(201).json({ success: true, data: newPromoter });
  } catch (error) {
    console.error("Error creating promoter:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to create promoter" });
  }
};

/**
 * @desc Update a promoter and assigned projects
 * @route PUT /promoter/:id
 */
export const updatePromoter = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    let {
      name,
      email,
      phone,
      altPhone,
      vendorId,
      cityId,
      status,
      updatedBy,
      projectIds = [],
    } = req.body;

    name = name.trim().replace(/\s+/g, " ");

    const existingPromoter = await prisma.promoter.findUnique({
      where: { id },
      include: { projects: true }, // Fetch associated projects
    });

    if (!existingPromoter) {
      res.status(404).json({
        success: false,
        message: "Promoter not found",
      });
      return;
    }

    const duplicatePromoter = await prisma.promoter.findFirst({
      where: {
        AND: [
          { id: { not: id } },
          {
            OR: [
              { phone: { equals: phone } },
              ...(email ? [{ email: email }] : []), // Only add if contactEmail is present
            ],
          },
        ],
      },
    });

    if (duplicatePromoter) {
      let duplicateField = "";
      if (duplicatePromoter.phone === phone) duplicateField = "Phone";
      if (duplicatePromoter.email === email) duplicateField = "Email";

      res.status(400).json({
        success: false,
        message: `${duplicateField} already exists`,
      });
      return;
    }

    // 🛠️ Use upsert for project assignments
    const updatedPromoter = await prisma.promoter.update({
      where: { id },
      data: {
        name,
        email,
        phone,
        altPhone,
        vendorId,
        cityId,
        status,
        updatedBy,
        projects: {
          deleteMany: {}, // Remove old assignments
          create: projectIds.map((projectId: string) => ({
            project: { connect: { id: projectId } },
          })),
        },
      },
      include: { projects: true }, // Return updated projects
    });

    res.json({
      success: true,
      message: "Promoter updated successfully",
      data: updatedPromoter,
    });
  } catch (error) {
    console.error("Error updating promoter:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update promoter" });
  }
};

/**
 * @desc Update status of multiple promoter
 * @route PATCH /promoter/updateSelectedPromotersStatus
 */
export const updateSelectedPromotersStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids, status } = req.body;

    // Validate input parameters
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid request. Please provide an array of promoter IDs.",
      });
      return;
    }

    if (!status || !["ACTIVE", "INACTIVE"].includes(status)) {
      res.status(400).json({
        success: false,
        message: "Invalid status. Status must be either ACTIVE or INACTIVE.",
      });
      return;
    }

    // Check if all Promoters exist
    const existingPromoters = await prisma.promoter.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (existingPromoters.length !== ids.length) {
      // Some Promoters were not found
      const existingIds = existingPromoters.map((promoter) => promoter.id);
      const missingIds = ids.filter((id) => !existingIds.includes(id));

      res.status(404).json({
        success: false,
        message: `Some Promoters were not found: ${missingIds.join(", ")}`,
      });
      return;
    }

    // Update status of all specified Promoters
    const updateResult = await prisma.promoter.updateMany({
      where: { id: { in: ids } },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: `Successfully updated status to ${status} for ${updateResult.count} Promoters.`,
      updatedCount: updateResult.count,
    });
  } catch (error) {
    console.error("Error updating Promoters status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update Promoters status",
    });
  }
};

/**
 * @desc Get all promoters with search, sorting, and pagination
 * @route GET /promoters
 */
export const getAllPromoters = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      search = "",
      status,
      sortBy = "createdAt",
      order = "desc",
      page,
      limit,
      vendorId,
      cityId,
      projectId,
      from,
      to,
      createdBy,
    } = req.query as Record<string, string>;

    const pageNumber = page ? Math.max(1, parseInt(page, 10)) : null;
    const pageSize = limit ? Math.max(1, parseInt(limit, 10)) : null;

    const where: any = {};

    // ✅ Search filter (Promoter Name, Email, Phone, Vendor Name, Project Name)
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
        { city: { name: { contains: search, mode: "insensitive" } } },

        {
          projects: {
            some: {
              project: { name: { contains: search, mode: "insensitive" } },
            },
          },
        },
      ];
    }
    if (status) where.status = status;

    if (vendorId) where.vendorId = vendorId;
    if (cityId) where.cityId = cityId;
    if (createdBy) where.createdBy = createdBy;

    // ✅ Filter by date range
    if (from || to) {
      const fromDate = from ? new Date(from as string) : undefined;
      const toDate = to
        ? new Date(new Date(to as string).setHours(23, 59, 59, 999))
        : undefined;

      where.createdAt = {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      };
    }

    // ✅ Filter by projectId
    if (projectId) {
      where.projects = {
        some: { projectId },
      };
    }
    if (vendorId) where.vendorId = vendorId;
    if (cityId) where.cityId = cityId;

    // Fetch promoters including vendor & projects
    let promoters = await prisma.promoter.findMany({
      where,
      include: {
        vendor: true, // Include vendor details
        city: true, // Include city details
        projects: {
          include: {
            project: {
              select: {
                name: true,
                brand: { select: { name: true } }, // ✅ Keep brand as it was
              },
            },
          }, // Include assigned projects
        },
      },
    });

    // ✅ Sorting Logic (Handles vendor name & project name sorting)
    if (sortBy === "vendor") {
      promoters.sort((a, b) => {
        const vendorA = a.vendor?.name || "";
        const vendorB = b.vendor?.name || "";
        return order.toLowerCase() === "asc"
          ? vendorA.localeCompare(vendorB)
          : vendorB.localeCompare(vendorA);
      });
    } else if (sortBy === "city") {
      promoters.sort((a, b) => {
        const cityA = a.city?.name || "";
        const cityB = b.city?.name || "";
        return order.toLowerCase() === "asc"
          ? cityA.localeCompare(cityB)
          : cityB.localeCompare(cityA);
      });
    } else if (sortBy === "project") {
      promoters.sort((a, b) => {
        const projectA = a.projects?.[0]?.project?.name || "";
        const projectB = b.projects?.[0]?.project?.name || "";
        return order.toLowerCase() === "asc"
          ? projectA.localeCompare(projectB)
          : projectB.localeCompare(projectA);
      });
    } else {
      promoters.sort((a, b) => {
        const fieldA = (a as any)[sortBy];
        const fieldB = (b as any)[sortBy];

        if (typeof fieldA === "string" && typeof fieldB === "string") {
          return order.toLowerCase() === "asc"
            ? fieldA.localeCompare(fieldB)
            : fieldB.localeCompare(fieldA);
        }
        return order.toLowerCase() === "asc"
          ? fieldA - fieldB
          : fieldB - fieldA;
      });
    }

    // ✅ Apply Pagination
    const totalCount = promoters.length;
    if (pageNumber && pageSize) {
      promoters = promoters.slice(
        (pageNumber - 1) * pageSize,
        pageNumber * pageSize
      );
    }

    res.json({
      success: true,
      total: totalCount,
      page: pageNumber ?? "All",
      pageSize: pageSize ?? totalCount,
      data: promoters,
    });
  } catch (error) {
    console.error("❌ Error fetching promoters:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch promoters" });
  }
};

export const getSelectedPromotersDownload = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body; // Accepts selected promoter IDs from request body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid request. Provide an array of promoter IDs.",
      });
      return;
    }

    // Fetch selected promoters from the database
    const promoters = await prisma.promoter.findMany({
      where: { id: { in: ids } }, // Fetch only selected promoters
      include: {
        projects: {
          include: {
            project: {
              select: {
                name: true,
                brand: { select: { name: true } }, // ✅ Keep brand as it was
              },
            },
          }, // Include assigned projects
        }, // Include assigned projects
        vendor: true, // Include vendor details
        city: true, // Include city details
      }, // Include assigned projects
    });

    res.json({
      success: true,
      data: promoters,
    });
  } catch (error) {
    console.error("❌ Error fetching selected promoters:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch selected promoters" });
  }
};
/**
 * @desc Get a single promoter by ID
 * @route GET /promoter/:id
 */
export const getPromoterById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const promoter = await prisma.promoter.findUnique({
      where: { id },
      include: {
        projects: { include: { project: true } },
        vendor: true,
        city: true,
      },
    });

    if (!promoter) {
      res.status(404).json({ success: false, message: "Promoter not found" });
      return;
    }

    res.json({ success: true, data: promoter });
  } catch (error) {
    console.error("Error fetching promoter:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch promoter" });
  }
};

/**
 * @desc Delete multiple promoters
 * @route DELETE /promoters
 */
export const deletePromoters = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res
        .status(400)
        .json({ success: false, message: "Provide an array of promoter IDs" });
      return;
    }

    const deleteResult = await prisma.promoter.deleteMany({
      where: { id: { in: ids } },
    });

    if (deleteResult.count === 0) {
      res
        .status(404)
        .json({ success: false, message: "No promoters found for given IDs" });
      return;
    }

    res.json({
      success: true,
      message: `Successfully deleted ${deleteResult.count} promoters`,
    });
  } catch (error) {
    console.error("Error deleting promoters:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete promoters" });
  }
};

// Bulk Update
export const updatePromoterProjects = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { oldProjectId, newProjectId, promoterIds } = req.body;

    if (
      !newProjectId ||
      !Array.isArray(promoterIds) ||
      promoterIds.length === 0
    ) {
      res.status(400).json({ success: false, message: "Invalid data" });
      return;
    }

    // Update projectId for all matching promoterIds
    const updateResult = await prisma.projectPromoter.updateMany({
      where: {
        OR: [{ projectId: oldProjectId }, { promoterId: { in: promoterIds } }],
      },
      data: {
        projectId: newProjectId,
      },
    });

    if (updateResult.count === 0) {
      res.status(400).json({
        success: false,
        message:
          "No records updated. Check if the promoters are assigned to the old project.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: `Updated ${updateResult.count} promoters to the new project.`,
    });
  } catch (error) {
    console.error("Error updating promoters' projects:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update promoters' projects",
    });
  }
};

export const getPromotersByProjects = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { projectIds } = req.body; // Expecting an array of project IDs

    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      res.status(400).json({
        success: false,
        message: "Project IDs are required and must be an array",
      });
      return;
    }

    const promoters = await prisma.promoter.findMany({
      where: {
        vendor: {
          projects: {
            some: {
              projectId: { in: projectIds }, // Only fetch promoters assigned to given projects
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        vendor: {
          select: {
            projects: {
              where: { projectId: { in: projectIds } }, // Filter only given projectIds
              select: {
                project: {
                  select: {
                    id: true,
                    name: true, // Get only projects related to the requested ones
                  },
                },
              },
            },
          },
        },
      },
    });

    res.status(200).json({ success: true, data: promoters });
  } catch (error) {
    console.error("Error updating promoters' projects:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update promoters' projects",
    });
  }
};

export const bulkUploadPromoters = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { promoters, createdBy } = req.body;

    if (!Array.isArray(promoters) || promoters.length === 0) {
      res.status(400).json({
        success: false,
        message: "No promoter data provided",
      });
      return;
    }

    const updatedList = [];
    const failedList = [];

    for (const promoter of promoters) {
      let { name, email, phone, altPhone, vendorSlug, citySlug, projectSlug } =
        promoter;

      name = name?.trim().replace(/\s+/g, " ");
      if (!phone) {
        failedList.push({ ...promoter, reason: "Missing phone number" });
        continue;
      }

      // Resolve slugs
      const [vendor, city, project] = await Promise.all([
        prisma.vendor.findUnique({ where: { slug: vendorSlug } }),
        prisma.city.findUnique({ where: { slug: citySlug } }),
        prisma.project.findUnique({ where: { slug: projectSlug } }),
      ]);

      if (!vendor || !city || !project) {
        failedList.push({
          ...promoter,
          reason: [
            !vendor ? "Invalid vendorSlug" : null,
            !city ? "Invalid citySlug" : null,
            !project ? "Invalid projectSlug" : null,
          ]
            .filter(Boolean)
            .join(", "),
        });
        continue;
      }

      // Check for existing promoter by phone/email
      const existing = await prisma.promoter.findFirst({
        where: {
          OR: [{ phone: { equals: phone } }],
        },
      });

      let promoterRecord;
      if (existing) {
        promoterRecord = await prisma.promoter.update({
          where: { id: existing.id },
          data: {
            name,
            email,
            altPhone,
            vendorId: vendor.id,
            cityId: city.id,
            createdBy,
          },
        });
      } else {
        promoterRecord = await prisma.promoter.create({
          data: {
            name,
            email,
            phone,
            altPhone,
            vendorId: vendor.id,
            cityId: city.id,
            createdBy,
          },
        });
      }

      // Ensure promoter is linked to the project
      const existingLink = await prisma.projectPromoter.findFirst({
        where: {
          promoterId: promoterRecord.id,
        },
      });

      if (!existingLink) {
        await prisma.projectPromoter.create({
          data: {
            promoterId: promoterRecord.id,
            projectId: project.id,
          },
        });
      } else {
        await prisma.projectPromoter.updateMany({
          where: { promoterId: promoterRecord.id },
          data: {
            projectId: project.id,
          },
        });
      }

      updatedList.push(promoterRecord);
    }

    res.status(201).json({
      success: true,
      message: "Bulk upload complete with upserts",
      updatedOrCreated: updatedList.length,
      failed: failedList.length,
      failedRecords: failedList,
    });
  } catch (error) {
    console.error("Error in bulkUploadPromoters (upsert):", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
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

export const loginUploadImages = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    res.status(400).json({ success: false, message: "No files uploaded" });
    return;
  }

  const { promoterId } = req.body;
  if (!promoterId) {
    res.status(400).json({ success: false, message: "promoterId is required" });
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
      const newImage = await prisma.promoterSession.create({
        data: {
          loginAt: new Date(),
          loginPhotoUrl: blobUrl,
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

export const logoutUploadImages = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    res.status(400).json({ success: false, message: "No files uploaded" });
    return;
  }

  const { promoterId, id } = req.body;
  if (!promoterId) {
    res.status(400).json({ success: false, message: "promoterId is required" });
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
      const newImage = await prisma.promoterSession.update({
        where: { id: id },
        data: {
          logoutPhotoUrl: blobUrl,
          logoutAt: new Date(),
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
