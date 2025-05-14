import { Request, Response } from "express";
import prisma from "../config/db";
import { Prisma } from "@prisma/client";
import { create_slug } from "../helper/createSlug";
/**
 * @desc Create a new vendor and assign to projects
 * @route POST /vendor
 */
export const createVendor = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    let {
      name,
      email,
      phone,
      address,
      gstNumber,
      panNumber,
      status = "ACTIVE",
      contactPerson,
      website,
      logo,
      createdBy,
      projectIds = [], // Accepting project IDs to assign vendor
    } = req.body;

    name = name?.trim();
    email = email?.trim();
    website = website?.trim();

    const slug = create_slug(name);

    if (!name) {
      // res.status(400).json({ success: true , message: "Vendor name is required" });
      res
        .status(201)
        .json({ success: false, message: "Vendor name is required" });

      return;
    }

    // Check for duplicate email, phone, GST, or PAN
    const existingVendor = await prisma.vendor.findFirst({
      where: {
        OR: [
          {
            name: {
              equals: name.trim().replace(/\s+/g, " "),
              mode: Prisma.QueryMode.insensitive,
            },
          }, // Fix mode type
          email ? { email: email } : null, // Remove undefined values
          phone ? { phone: phone } : null,
          gstNumber
            ? {
                gstNumber: {
                  equals: gstNumber,
                  mode: Prisma.QueryMode.insensitive,
                },
              }
            : null,
          panNumber
            ? {
                panNumber: {
                  equals: panNumber,
                  mode: Prisma.QueryMode.insensitive,
                },
              }
            : null,
        ].filter(Boolean), // Remove null values from OR array
      },
    });

    if (existingVendor) {
      let duplicateField = "";
      if (existingVendor.name.toLowerCase() === name.toLowerCase())
        duplicateField = "Name";
      if (existingVendor.email === email) duplicateField = "Email";
      if (existingVendor.phone === phone) duplicateField = "Phone";
      if (existingVendor.gstNumber === gstNumber) duplicateField = "GST Number";
      if (existingVendor.panNumber === panNumber) duplicateField = "PAN Number";

      res.status(400).json({
        success: false,
        message: `${duplicateField} already exists`,
      });
      return;
    }

    // Create vendor
    const newVendor = await prisma.vendor.create({
      data: {
        name,
        slug,
        email,
        phone,
        address,
        gstNumber,
        panNumber,
        status,
        contactPerson,
        website,
        logo,
        createdBy,
      },
    });

    // Assign vendor to selected projects
    if (projectIds.length > 0) {
      const projectVendorData = projectIds.map((projectId: string) => ({
        projectId,
        vendorId: newVendor.id,
      }));

      await prisma.projectVendor.createMany({ data: projectVendorData });
    }

    res.status(201).json({ success: true, data: newVendor });
  } catch (error) {
    console.error("Error creating vendor:", error);
    res.status(500).json({ success: true, message: "Failed to create vendor" });
  }
};

/**
 * @desc Update vendor and assigned projects
 * @route PUT /vendor/:id
 */
export const updateVendor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let {
      name,
      email,
      phone,
      address,
      gstNumber,
      panNumber,
      status,
      contactPerson,
      website,
      logo,
      updatedBy,
      projectIds = [], // Updated project assignments
    } = req.body;

    name = name?.trim();
    email = email?.trim();
    website = website?.trim();

    const existingVendor = await prisma.vendor.findUnique({ where: { id } });

    if (!existingVendor) {
      // res.status(404).json({ success: true , message: "Vendor not found" });
      res.status(201).json({
        success: false,
        message: "Vendor not found",
      });
      return;
    }

    const duplicateVendor = await prisma.vendor.findFirst({
      where: {
        AND: [
          { id: { not: id } },
          {
            OR: [
              {
                name: {
                  equals: name.trim().replace(/\s+/g, " "),
                  mode: Prisma.QueryMode.insensitive,
                },
              }, // Fix mode type
              email ? { email: email } : null, // Remove undefined values
              phone ? { phone: phone } : null,
              gstNumber
                ? {
                    gstNumber: {
                      equals: gstNumber,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  }
                : null,
              panNumber
                ? {
                    panNumber: {
                      equals: panNumber,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  }
                : null,
            ].filter(Boolean),
          },
        ],
      },
    });

    if (duplicateVendor) {
      let duplicateField = "";
      if (duplicateVendor.name.toLowerCase() === name.toLowerCase())
        duplicateField = "Name";
      if (duplicateVendor.email === email) duplicateField = "Email";
      if (duplicateVendor.phone === phone) duplicateField = "Phone";
      if (duplicateVendor.gstNumber === gstNumber)
        duplicateField = "GST Number";
      if (duplicateVendor.panNumber === panNumber)
        duplicateField = "PAN Number";

      res.status(400).json({
        success: false,
        message: `${duplicateField} already exists`,
      });
      return;
    }

    // Update vendor
    const updatedVendor = await prisma.vendor.update({
      where: { id },
      data: {
        name,
        email,
        phone,
        address,
        gstNumber,
        panNumber,
        status,
        contactPerson,
        website,
        logo,
        updatedBy,
      },
    });

    // Update project assignments: Remove old assignments and add new ones
    await prisma.projectVendor.deleteMany({ where: { vendorId: id } });

    if (projectIds.length > 0) {
      const projectVendorData = projectIds.map((projectId: string) => ({
        projectId,
        vendorId: id,
      }));

      await prisma.projectVendor.createMany({ data: projectVendorData });
    }

    res.json({
      success: true,
      message: "Vendor updated successfully",
      data: updatedVendor,
    });
  } catch (error) {
    console.error("Error updating vendor:", error);
    res.status(500).json({ success: true, message: "Failed to update vendor" });
  }
};

/**
 * @desc Update status of multiple vendors
 * @route PATCH /vendor/updateSelectedVendorsStatus
 */
export const updateSelectedVendorsStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids, status } = req.body;

    // Validate input parameters
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid request. Please provide an array of vendor IDs.",
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

    // Check if all vendors exist
    const existingVendors = await prisma.vendor.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (existingVendors.length !== ids.length) {
      // Some vendors were not found
      const existingIds = existingVendors.map((vendor) => vendor.id);
      const missingIds = ids.filter((id) => !existingIds.includes(id));

      res.status(404).json({
        success: false,
        message: `Some vendors were not found: ${missingIds.join(", ")}`,
      });
      return;
    }

    // Update status of all specified vendors
    const updateResult = await prisma.vendor.updateMany({
      where: { id: { in: ids } },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: `Successfully updated status to ${status} for ${updateResult.count} vendors.`,
      updatedCount: updateResult.count,
    });
  } catch (error) {
    console.error("Error updating vendors status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update vendors status",
    });
  }
};

/**
 * @desc Get all vendors with their assigned projects
 * @route GET /vendors
 */
export const getAllVendors = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      search = "",
      sortBy = "createdAt",
      order = "desc",
      page,
      limit,
      status,
      projectId,
      from,
      to,
      createdBy,
    } = req.query as Record<string, string>;
    const pageNumber = page ? Math.max(1, parseInt(page, 10)) : null;
    const pageSize = limit ? Math.max(1, parseInt(limit, 10)) : null;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { website: { contains: search, mode: "insensitive" } },
        { contactPerson: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
        { gstNumber: { contains: search, mode: "insensitive" } },
        { panNumber: { contains: search, mode: "insensitive" } },
        {
          projects: {
            some: {
              project: { name: { contains: search, mode: "insensitive" } },
            },
          },
        }, // ✅ Search by project name
      ];
    }
    if (status) where.status = status;
    if (createdBy) where.createdBy = createdBy;

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

    if (projectId) {
      where.projects = { some: { projectId } };
    }

    // ✅ Fetch vendors including project details
    let vendors = await prisma.vendor.findMany({
      where,
      include: { projects: { include: { project: true } } }, // ✅ Join Project table
    });

    // ✅ Handle sorting manually if sorting by `projects.name`
    if (sortBy === "projects") {
      vendors.sort((a, b) => {
        const projectA =
          a.projects.length > 0 ? a.projects[0].project.name : "";
        const projectB =
          b.projects.length > 0 ? b.projects[0].project.name : "";
        return order.toLowerCase() === "asc"
          ? projectA.localeCompare(projectB)
          : projectB.localeCompare(projectA);
      });
    } else {
      // ✅ Prisma-native sorting for other fields
      vendors.sort((a, b) => {
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

    // Apply pagination
    const totalCount = vendors.length;
    if (pageNumber && pageSize) {
      vendors = vendors.slice(
        (pageNumber - 1) * pageSize,
        pageNumber * pageSize
      );
    }

    res.json({
      success: true,
      total: totalCount,
      page: pageNumber ?? "All",
      pageSize: pageSize ?? totalCount,
      data: vendors,
    });
  } catch (error) {
    console.error("❌ Error fetching vendors:", error);
    res.status(500).json({ success: true, message: "Failed to fetch vendors" });
  }
};

export const getSelectedVendorsDownload = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body; // Accepts selected vendor IDs from request body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: true,
        message: "Invalid request. Provide an array of vendor IDs.",
      });
      return;
    }

    // Fetch selected vendors from the database
    const vendors = await prisma.vendor.findMany({
      where: { id: { in: ids } }, // Fetch only selected vendors
      include: { projects: { include: { project: true } } }, // Include assigned projects
    });

    res.json({
      success: true,
      data: vendors,
    });
  } catch (error) {
    console.error("❌ Error fetching selected vendors:", error);
    res
      .status(500)
      .json({ success: true, message: "Failed to fetch selected vendors" });
  }
};

/**
 * @desc Get a single vendor by ID with assigned projects
 * @route GET /vendor/:id
 */
export const getVendorById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: { projects: { include: { project: true } } },
    });

    if (!vendor) {
      res.status(404).json({ success: true, message: "Vendor not found" });
      return;
    }

    res.json({ success: true, data: vendor });
  } catch (error) {
    console.error("Error fetching vendor:", error);
    res.status(500).json({ success: true, message: "Failed to fetch vendor" });
  }
};

/**
 * @desc Delete vendors and remove from projects
 * @route DELETE /vendor
 */
export const deleteVendors = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body; // Expecting an array of vendor IDs

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: true,
        message: "Invalid request. Provide an array of vendor IDs.",
      });
      return;
    }

    // Delete multiple vendors at once
    const deleteResult = await prisma.vendor.deleteMany({
      where: { id: { in: ids } }, // Deletes only the selected vendor IDs
    });

    if (deleteResult.count === 0) {
      res.status(404).json({
        success: true,
        message: "No vendors found for the given IDs.",
      });
      return;
    }

    res.json({
      success: true,
      message: `Successfully deleted ${deleteResult.count} vendors.`,
    });
  } catch (error) {
    console.error("❌ Error deleting vendors:", error);
    res
      .status(500)
      .json({ success: true, message: "Failed to delete vendors." });
  }
};

export const getProjectsByVendorId = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    console.log("api hitsssss");

    const { id: vendorId } = req.params; // ✅ Read from query params
    if (!vendorId || typeof vendorId !== "string") {
      res.status(400).json({ success: false, error: "Vendor ID is required" });
      return;
    }

    const vendorExists = await prisma.vendor.findUnique({
      where: { id: vendorId },
    });

    if (!vendorExists) {
      res.status(404).json({ success: false, error: "Vendor not found" });
      return;
    }

    const projects = await prisma.project.findMany({
      where: {
        vendors: {
          some: { vendorId }, // ✅ Check projects where vendor is assigned
        },
      },
      include: {
        brand: true,
      },
    });

    res.json({
      success: true,
      total: projects.length,
      data: projects,
    });
  } catch (error) {
    console.error("❌ Error fetching projects for vendor:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch projects for vendor" });
  }
};
