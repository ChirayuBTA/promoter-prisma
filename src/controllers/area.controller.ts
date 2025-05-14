import { Request, Response } from "express";
import prisma from "../config/db";
import { create_slug } from "../helper/createSlug";
/**
 * @desc Create a new area
 * @route POST /area
 */
export const createArea = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    let {
      name,
      cityId,
      pincode,
      latitude,
      longitude,
      status,
      areaType,
      createdBy,
    } = req.body;

    name = name?.trim();
    if (!name || !cityId) {
      res
        .status(400)
        .json({ success: false, message: "Name and City ID are required" });
      return;
    }

    const existingArea = await prisma.area.findFirst({
      where: {
        cityId,
        OR: [
          {
            name: {
              equals: name.trim().replace(/\s+/g, " "),
              mode: "insensitive",
            },
          }, // Case-insensitive name check
          { pincode: { equals: pincode, mode: "insensitive" } },
        ],
      },
    });

    if (existingArea) {
      let duplicateField = "";
      if (existingArea.name.toLowerCase() === name.toLowerCase())
        duplicateField = "Name";
      else if (existingArea.pincode === pincode) duplicateField = "Pincode";

      res.status(400).json({
        success: false,
        message: `${duplicateField} already exists`,
      });
      return;
    }

    let slugBase = create_slug(name);
    let slug = slugBase;
    let counter = 1;

    while (
      await prisma.area.findFirst({
        where: { slug },
      })
    ) {
      slug = `${slugBase}-${counter}`;
      counter++;
    }

    const newArea = await prisma.area.create({
      data: {
        name,
        slug,
        cityId,
        pincode,
        latitude,
        longitude,
        status,
        areaType,
        createdBy,
      },
    });

    res.status(201).json({ success: true, data: newArea });
  } catch (error) {
    console.error("Error creating area:", error);
    res.status(500).json({ success: false, message: "Failed to create area" });
  }
};

/**
 * @desc Update an area
 * @route PUT /area/:id
 */
export const updateArea = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    let {
      name,
      cityId,
      pincode,
      latitude,
      longitude,
      status,
      areaType,
      updatedBy,
    } = req.body;

    name = name?.trim();

    // Check if the area exists
    const existingArea = await prisma.area.findUnique({ where: { id } });
    if (!existingArea) {
      res.status(404).json({ success: false, message: "Area not found" });
      return;
    }

    // Check if the new cityId is valid (Optional Validation)
    if (cityId) {
      const existingCity = await prisma.city.findUnique({
        where: { id: cityId },
      });
      if (!existingCity) {
        res
          .status(400)
          .json({ success: false, message: "Invalid cityId provided" });
        return;
      }
    }

    const duplicateArea = await prisma.area.findFirst({
      where: {
        cityId,
        AND: [
          { id: { not: id } },
          {
            OR: [
              {
                name: {
                  equals: name.trim().replace(/\s+/g, " "),
                  mode: "insensitive",
                },
              }, // Case-insensitive name check
              { pincode: { equals: pincode, mode: "insensitive" } },
            ],
          },
        ],
      },
    });

    if (duplicateArea) {
      let duplicateField = "";
      if (duplicateArea.name.toLowerCase() === name.toLowerCase())
        duplicateField = "Name";
      else if (duplicateArea.pincode === pincode) duplicateField = "Pincode";

      res.status(400).json({
        success: false,
        message: `${duplicateField} already exists`,
      });
      return;
    }

    // Update the area, including cityId
    const updatedArea = await prisma.area.update({
      where: { id },
      data: {
        name,
        cityId,
        pincode,
        latitude,
        longitude,
        status,
        areaType,
        updatedBy,
      },
    });

    res.json({ success: true, data: updatedArea });
  } catch (error) {
    console.error("❌ Error updating area:", error);
    res.status(500).json({ success: false, error: "Failed to update area" });
  }
};

/**
 * @desc Update status of multiple areas
 * @route PATCH /area/updateSelectedAreasStatus
 */
export const updateSelectedAreasStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids, status } = req.body;

    // Validate input parameters
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid request. Please provide an array of area IDs.",
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

    // Check if all areas exist
    const existingAreas = await prisma.area.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (existingAreas.length !== ids.length) {
      // Some Areas were not found
      const existingIds = existingAreas.map((area) => area.id);
      const missingIds = ids.filter((id) => !existingIds.includes(id));

      res.status(404).json({
        success: false,
        message: `Some Areas were not found: ${missingIds.join(", ")}`,
      });
      return;
    }

    // Update status of all specified areas
    const updateResult = await prisma.area.updateMany({
      where: { id: { in: ids } },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: `Successfully updated status to ${status} for ${updateResult.count} areas.`,
      updatedCount: updateResult.count,
    });
  } catch (error) {
    console.error("Error updating areas status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update areas status",
    });
  }
};

/**
 * @desc Get all areas with pagination
 * @route GET /areas
 */
export const getAllAreas = async (
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
      cityId,
      from,
      to,
      createdBy,
    } = req.query as Record<string, string>;

    const pageNumber = page ? Math.max(1, parseInt(page, 10)) : null;
    const pageSize = limit ? Math.max(1, parseInt(limit, 10)) : null;

    // ✅ Filtering
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { city: { name: { contains: search, mode: "insensitive" } } }, // 🔍 Search by city name
      ];
    }
    if (status) where.status = status;
    if (cityId) where.cityId = cityId;
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

    // ✅ Fetch areas including city details
    let areas = await prisma.area.findMany({
      where,
      include: { city: true }, // Include city details
    });

    // ✅ Handle sorting manually if sorting by `city.name`
    if (sortBy === "city") {
      areas.sort((a, b) => {
        const cityA = a.city?.name || "";
        const cityB = b.city?.name || "";
        return order.toLowerCase() === "asc"
          ? cityA.localeCompare(cityB)
          : cityB.localeCompare(cityA);
      });
    } else {
      // ✅ Prisma-native sorting for other fields
      areas.sort((a, b) => {
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
    const totalCount = areas.length;
    if (pageNumber && pageSize) {
      areas = areas.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
    }

    res.json({
      success: true,
      total: totalCount,
      page: pageNumber ?? "All",
      pageSize: pageSize ?? totalCount,
      data: areas,
    });
  } catch (error) {
    console.error("❌ Error fetching areas:", error);
    res.status(500).json({ success: false, message: "Failed to fetch areas" });
  }
};

/**
 * @desc Get an area by ID
 * @route GET /area/:id
 */
export const getAreaById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const area = await prisma.area.findUnique({
      where: { id },
      include: { city: true },
    });

    if (!area) {
      res.status(404).json({ success: false, message: "Area not found" });
      return;
    }
    res.json({ success: true, data: area });
  } catch (error) {
    console.error("Error fetching area:", error);
    res.status(500).json({ success: false, message: "Failed to fetch area" });
  }
};

export const getSelectedAreasDownload = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body; // Expecting an array of area IDs

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid request. Provide an array of area IDs.",
      });
      return;
    }

    // Fetch selected areas from the database
    const areas = await prisma.area.findMany({
      where: { id: { in: ids } }, // Fetch only selected areas
      include: { city: true }, // Include related city details
    });

    res.json({
      success: true,
      data: areas,
    });
  } catch (error) {
    console.error("❌ Error fetching selected areas:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch selected areas" });
  }
};

/**
 * @desc Delete areas
 * @route DELETE /area
 */
export const deleteAreas = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res
        .status(400)
        .json({ success: false, message: "Provide an array of area IDs." });
      return;
    }
    const deleteResult = await prisma.area.deleteMany({
      where: { id: { in: ids } },
    });
    res.json({
      success: true,
      message: `Deleted ${deleteResult.count} areas.`,
    });
  } catch (error) {
    console.error("Error deleting areas:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete areas." });
  }
};

export const bulkUploadAreas = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const areas = req.body.areas;

    if (!Array.isArray(areas) || areas.length === 0) {
      res.status(400).json({ error: "areas array is required." });
      return;
    }

    const formatted = areas
      .filter((area: any) => area["Name"] && area["City"]) // skip empty rows
      .map((area: any) => {
        const name = area["Name"];
        const city = area["City"];
        const slug = create_slug(name);

        return {
          name,
          slug,
          status: area["Status"] || "ACTIVE",
          city: city,
        };
      });

    // Fetch brand IDs
    const cityMap = await prisma.city.findMany({
      where: {
        name: {
          in: formatted.map((p) => p.city),
        },
      },
      select: { name: true, id: true },
    });

    const cityIdLookup = Object.fromEntries(cityMap.map((b) => [b.name, b.id]));

    const areaData = formatted.map((p) => ({
      name: p.name,
      slug: p.slug,
      status: p.status,
      cityId: cityIdLookup[p.city] || null,
    }));

    const created = await prisma.area.createMany({
      data: areaData,
      skipDuplicates: true,
    });

    res.status(201).json({
      success: true,
      message: "areaData uploaded successfully",
      count: created.count,
    });
  } catch (error) {
    console.error("Bulk upload error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to upload projects" });
  }
};
