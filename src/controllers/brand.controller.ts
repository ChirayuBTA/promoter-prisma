import { Request, Response } from "express";
import prisma from "../config/db";
import dotenv from "dotenv";
import { BlobServiceClient } from "@azure/storage-blob";
import multer from "multer";
import fs from "fs";
import path from "path";
import { create_slug } from "../helper/createSlug";

dotenv.config();

// Configure Multer to store files outside "src/"
const upload = multer({ dest: path.join(__dirname, "../../uploads") });

const AZURE_STORAGE_CONNECTION_STRING =
  process.env.AZURE_STORAGE_CONNECTION_STRING!;
const AZURE_CONTAINER_NAME = "logo";

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
 * @desc Create a new brand
 * @route POST /brands
 */
export const createBrand = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    upload.single("logo")(req, res, async (err: any) => {
      if (err) {
        res.status(400).json({ success: false, message: "File upload failed" });
        return;
      }

      let {
        name,
        description,
        website,
        contactEmail,
        contactPhone,
        status,
        createdBy,
      } = req.body;

      name = name?.trim();
      description = description?.trim();
      website = website?.trim();
      contactEmail = contactEmail?.trim();
      contactPhone = contactPhone?.trim();

      const slug = create_slug(name);

      if (!name) {
        res
          .status(400)
          .json({ success: false, message: "Brand name is required" });
        return;
      }

      // Check if brand name, email, or phone already exists
      const existingBrand = await prisma.brand.findFirst({
        where: {
          OR: [
            {
              name: {
                equals: name.trim().replace(/\s+/g, " "), // Normalize spaces
                mode: "insensitive",
              },
            }, // Case-insensitive name check
            ...(contactEmail ? [{ contactEmail: contactEmail }] : []), // Only add if contactEmail is present
            ...(contactPhone ? [{ contactPhone: contactPhone }] : []), // Only add if contactPhone is present
            ...(website ? [{ website: website }] : []), // Only add if website is present
          ],
        },
      });

      if (existingBrand) {
        let duplicateField = "";
        if (existingBrand.name.toLowerCase() === name.toLowerCase()) {
          duplicateField = "Brand name";
        } else if (existingBrand.contactEmail === contactEmail)
          duplicateField = "Email";
        else if (existingBrand.contactPhone === contactPhone)
          duplicateField = "Phone";
        else if (existingBrand.website === website) duplicateField = "Website";
        res.status(400).json({
          success: false,
          message: `${duplicateField} already exists`,
        });
        return;
      }

      let logoUrl: string | null = null;

      // Upload logo to Azure Blob Storage if a file is provided
      if (req.file) {
        const blobName = `${Date.now()}-${req.file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        // Determine content type based on file extension
        let contentType = req.file.mimetype;
        const fileExtension = path.extname(req.file.originalname).toLowerCase();

        // Set correct content type for SVG files
        if (fileExtension === ".svg") {
          contentType = "image/svg+xml";
        }

        // Upload file to Azure Blob Storage with the correct content type
        const uploadOptions = {
          blobHTTPHeaders: {
            blobContentType: contentType,
          },
        };

        // Read file content
        const fileBuffer = fs.readFileSync(req.file.path);

        // Upload file with correct content type
        await blockBlobClient.uploadData(fileBuffer, uploadOptions);

        // Get the public URL of the uploaded logo
        logoUrl = blockBlobClient.url;

        // Clean up the local file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        } else {
          console.warn(`File not found for deletion: ${req.file.path}`);
        }
      }

      // Create brand if no duplicates exist
      const brand = await prisma.brand.create({
        data: {
          name,
          slug,
          description,
          website,
          contactEmail,
          contactPhone,
          status,
          logoUrl: logoUrl, // Save the logo URL
          createdBy,
        },
      });

      res.status(201).json({ success: true, data: brand });
    });
  } catch (error) {
    console.error("Error creating brand:", error);
    res.status(500).json({ success: false, message: "Failed to create brand" });
  }
};
/**
 * @desc Get all brands
 * @route GET /brands
 */
export const getAllBrands = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Extract query parameters
    const {
      search = "", // Search by brand name
      status,
      sortBy = "createdAt", // Sort field (default: createdAt)
      order = "desc", // Sort order (asc or desc)
      page, // Page number
      limit, // Results per page
      contactEmail, // Filter by contact email
      contactPhone, // Filter by contact phone
      from, // From date filter
      to, // To date filter
    } = req.query as Record<string, string>;

    // Ensure page and limit are valid numbers
    const pageNumber = page ? Math.max(1, parseInt(page, 10)) : null;
    const pageSize = limit ? Math.max(1, parseInt(limit, 10)) : null;

    // Build filter conditions
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { website: { contains: search, mode: "insensitive" } },
        { contactEmail: { contains: search, mode: "insensitive" } },
        { contactPhone: { contains: search, mode: "insensitive" } },
      ];
    }
    if (status) where.status = status;
    if (contactEmail) where.contactEmail = contactEmail;
    if (contactPhone) where.contactPhone = contactPhone;

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

    // Fetch brands with filters, sorting, and conditional pagination
    const brands = await prisma.brand.findMany({
      where,
      orderBy: { [sortBy]: order.toLowerCase() === "asc" ? "asc" : "desc" },
      ...(pageNumber && pageSize
        ? { skip: (pageNumber - 1) * pageSize, take: pageSize }
        : {}), // Apply pagination only if needed
    });

    // Get total count for pagination
    const totalCount = await prisma.brand.count({ where });

    res.json({
      success: true,
      total: totalCount,
      page: pageNumber ?? "All", // Show "All" when not paginated
      pageSize: pageSize ?? totalCount, // Show total when not paginated
      data: brands,
    });
  } catch (error) {
    console.error("Error fetching brands:", error);
    res.status(500).json({ success: false, message: "Failed to fetch brands" });
  }
};

/**
 * @desc Get all Selected brands
 * @route POST /brands
 */

export const getSelectedBrandsDownload = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body; // Accepts selected brand IDs from request body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid request. Provide an array of brand IDs.",
      });
      return;
    }

    // Fetch selected brands from the database
    const brands = await prisma.brand.findMany({
      where: { id: { in: ids } }, // Fetch only selected brands
    });

    res.json({
      success: true,
      data: brands,
    });
  } catch (error) {
    console.error("❌ Error fetching selected brands:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch selected brands" });
  }
};
/**
 * @desc Get a single brand by ID
 * @route GET /brands/:id
 */
export const getBrandById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const brand = await prisma.brand.findUnique({
      where: { id },
    });

    if (!brand) {
      res.status(404).json({ success: false, message: "Brand not found" });
      return;
    }

    res.json({ success: true, data: brand });
  } catch (error) {
    console.error("Error fetching brand:", error);
    res.status(500).json({ success: false, message: "Failed to fetch brand" });
  }
};

/**
 * @desc Update a brand by ID
 * @route PUT /brands/:id
 */
export const updateBrand = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    upload.single("logo")(req, res, async (err: any) => {
      if (err) {
        res.status(400).json({ success: false, message: "File upload failed" });
        return;
      }

      const { id } = req.params;
      let {
        name,
        description,
        website,
        contactEmail,
        status,
        contactPhone,
        updatedBy,
      } = req.body;

      name = name?.trim();
      description = description?.trim();
      website = website?.trim();
      contactEmail = contactEmail?.trim();
      contactPhone = contactPhone?.trim();

      if (!name) {
        res
          .status(400)
          .json({ success: false, message: "Brand name is required" });
        return;
      }

      // Check if brand exists
      const existingBrand = await prisma.brand.findUnique({ where: { id } });
      if (!existingBrand) {
        res.status(404).json({ success: false, message: "Brand not found" });
        return;
      }

      // Check for duplicate brand name, email, or phone
      const duplicateBrand = await prisma.brand.findFirst({
        where: {
          AND: [
            { id: { not: id } }, // Exclude the current brand
            {
              OR: [
                {
                  name: {
                    equals: name.trim().replace(/\s+/g, " "), // Normalize spaces
                    mode: "insensitive",
                  },
                }, // Case-insensitive name check
                ...(contactEmail ? [{ contactEmail: contactEmail }] : []), // Only add if contactEmail is present
                ...(contactPhone ? [{ contactPhone: contactPhone }] : []), // Only add if contactPhone is present
                ...(website ? [{ website: website }] : []), // Only add if website is present
              ],
            },
          ],
        },
      });

      if (duplicateBrand) {
        let duplicateField = "";
        if (existingBrand.name.toLowerCase() === name.toLowerCase()) {
          duplicateField = "Brand name";
        } else if (existingBrand.contactEmail === contactEmail)
          duplicateField = "Email";
        else if (existingBrand.contactPhone === contactPhone)
          duplicateField = "Phone";
        else if (existingBrand.website === website) duplicateField = "Website";
        res.status(400).json({
          success: false,
          message: `${duplicateField} already exists`,
        });
        return;
      }

      let logoUrl: string | undefined;

      // Upload new logo if provided
      if (req.file) {
        const blobName = `${Date.now()}-${req.file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        // Determine content type based on file extension
        let contentType = req.file.mimetype;
        const fileExtension = path.extname(req.file.originalname).toLowerCase();

        // Set correct content type for SVG files
        if (fileExtension === ".svg") {
          contentType = "image/svg+xml";
        }

        // Upload file to Azure Blob Storage with the correct content type
        const uploadOptions = {
          blobHTTPHeaders: {
            blobContentType: contentType,
          },
        };

        // Read file content
        const fileBuffer = fs.readFileSync(req.file.path);

        // Upload file with correct content type
        await blockBlobClient.uploadData(fileBuffer, uploadOptions);

        logoUrl = blockBlobClient.url; // Get public URL of new logo

        // Optional: Delete old logo from Azure
        if (existingBrand.logoUrl) {
          const oldBlobName = existingBrand.logoUrl.split("/").pop(); // Extract filename from URL
          const oldBlobClient = containerClient.getBlockBlobClient(
            oldBlobName as string
          );
          await oldBlobClient.deleteIfExists();
        }

        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        } else {
          console.warn(`File not found for deletion: ${req.file.path}`);
        }
      }

      // Update brand in database
      const updatedBrand = await prisma.brand.update({
        where: { id },
        data: {
          name,
          description,
          website,
          contactEmail,
          contactPhone,
          updatedBy,
          status,
          ...(logoUrl && { logoUrl }), // Update logo only if a new file is uploaded
        },
      });

      res.json({ success: true, data: updatedBrand });
    });
  } catch (error) {
    console.error("Error updating brand:", error);
    res.status(500).json({ success: false, message: "Failed to update brand" });
  }
};

/**
 * @desc Update status of multiple brands
 * @route PATCH /brand/updateSelectedBrandsStatus
 */
export const updateSelectedBrandsStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids, status } = req.body;

    // Validate input parameters
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid request. Please provide an array of brand IDs.",
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

    // Check if all brands exist
    const existingBrands = await prisma.brand.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (existingBrands.length !== ids.length) {
      // Some brands were not found
      const existingIds = existingBrands.map((brand) => brand.id);
      const missingIds = ids.filter((id) => !existingIds.includes(id));

      res.status(404).json({
        success: false,
        message: `Some brands were not found: ${missingIds.join(", ")}`,
      });
      return;
    }

    // Update status of all specified brands
    const updateResult = await prisma.brand.updateMany({
      where: { id: { in: ids } },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: `Successfully updated status to ${status} for ${updateResult.count} brands.`,
      updatedCount: updateResult.count,
    });
  } catch (error) {
    console.error("Error updating brands status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update brands status",
    });
  }
};

/**
 * @desc Delete a brand by Multiple ID
 * @route DELETE /brands
 */
export const deleteBrand = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body; // Expecting an array of brand IDs

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid request. Provide an array of brand IDs.",
      });
      return;
    }

    // Delete multiple brands at once
    const deleteResult = await prisma.brand.deleteMany({
      where: { id: { in: ids } }, // Deletes only the selected brand IDs
    });

    if (deleteResult.count === 0) {
      res.status(404).json({
        success: false,
        message: "No brands found for the given IDs.",
      });
      return;
    }

    res.json({
      success: true,
      message: `Successfully deleted ${deleteResult.count} brands.`,
    });
  } catch (error) {
    console.error("❌ Error deleting brands:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete brands." });
  }
};

export const dashboardSummary = async (req, res) => {
  console.log("req dashboard", req.params);
  const { brandId } = req.params;

  const projects = await prisma.project.findMany({
    where: { brandId },
    select: { id: true },
  });

  const projectIds = projects.map((p) => p.id);

  const [totalOrders, cashbackData, statusBreakdown, dailyOrders] =
    await Promise.all([
      prisma.orderCaptured.count({
        where: { projectId: { in: projectIds } },
      }),

      prisma.orderCaptured.aggregate({
        _sum: { cashbackAmount: true },
        where: { projectId: { in: projectIds } },
      }),

      prisma.orderCaptured.groupBy({
        by: ["status"],
        _count: { status: true },
        where: { projectId: { in: projectIds } },
      }),

      prisma.orderCaptured.groupBy({
        by: ["createdAt"],
        _count: true,
        where: { projectId: { in: projectIds } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  res.json({
    totalOrders,
    totalCashback: cashbackData._sum.cashbackAmount || 0,
    statusBreakdown,
    dailyOrders: dailyOrders.map((d) => ({
      date: d.createdAt.toISOString().split("T")[0],
      count: d._count,
    })),
  });
};

export const report = async (req, res) => {
  const { brandId } = req.params;
  const { from, to } = req.query;

  const projects = await prisma.project.findMany({
    where: { brandId },
    select: { id: true },
  });

  const projectIds = projects.map((p) => p.id);

  const orders = await prisma.orderCaptured.findMany({
    where: {
      projectId: { in: projectIds },
      createdAt: {
        gte: new Date(from),
        lte: new Date(to),
      },
    },
    include: {
      promoter: true,
      project: true,
      vendor: true,
    },
  });

  res.json(orders); // OR convert to CSV using json2csv
};

export const bulkUploadBrands = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const brands = req.body.brands;

    if (!Array.isArray(brands) || brands.length === 0) {
      res.status(400).json({ error: "Brands array is required." });
      return;
    }

    const formatted = brands.map((brand: any) => {
      const name = brand.Name || brand.name;
      return {
        id: brand.id || undefined,
        name: name,
        slug: brand.slug || create_slug(name),
        description: brand.Description || null,
        logoUrl: brand.logoUrl || null,
        website: brand.Website || null,
        contactEmail: brand.Email || null,
        contactPhone: brand.contactPhone || null,
        status: brand.Status || "ACTIVE",
        createdBy: brand.createdBy || null,
        updatedBy: brand.updatedBy || null,
      };
    });

    const createdBrands = await prisma.brand.createMany({
      data: formatted,
      skipDuplicates: true,
    });

    res.status(201).json({
      success: true,
      message: "Brands uploaded",
      count: createdBrands.count,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Failed to upload brands" });
  }
};
