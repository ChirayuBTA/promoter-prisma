import { Request, Response } from "express";
import prisma from "../config/db";
import { create_slug } from "../helper/createSlug";
/**
 * @desc Create a new city
 * @route POST /city
 */
export const createCity = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    let {
      name,
      state,
      pincode,
      status = "ACTIVE",
      latitude,
      longitude,
      createdBy,
    } = req.body;

    name = name?.trim();
    state = state?.trim();

    const slug = create_slug(name);
    if (!name) {
      res
        .status(400)
        .json({ success: false, message: "City name is required" });
      return;
    }

    // Check for duplicate city
    const existingCity = await prisma.city.findFirst({
      where: {
        name: { equals: name.trim().replace(/\s+/g, " "), mode: "insensitive" }, // Case-insensitive name check
      },
    });
    if (existingCity) {
      res.status(400).json({ success: false, message: "City already exists" });
      return;
    }

    const newCity = await prisma.city.create({
      data: {
        name,
        slug,
        state,
        pincode,
        latitude,
        status,
        longitude,
        createdBy,
      },
    });

    res.status(201).json({ success: true, data: newCity });
  } catch (error) {
    console.error("Error creating city:", error);
    res.status(500).json({ success: false, message: "Failed to create city" });
  }
};

/**
 * @desc Update an existing city
 * @route PUT /city/:id
 */
export const updateCity = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    let { name, state, pincode, status, latitude, longitude, updatedBy } =
      req.body;
    name = name?.trim();
    state = state?.trim();

    const existingCity = await prisma.city.findUnique({ where: { id } });
    if (!existingCity) {
      res.status(404).json({ success: false, message: "City not found" });
      return;
    }

    if (name && name !== existingCity.name) {
      const duplicateCity = await prisma.city.findFirst({
        where: {
          name: {
            equals: name.trim().replace(/\s+/g, " "),
            mode: "insensitive",
          },
        }, // Case-insensitive name check
      });
      if (duplicateCity) {
        res
          .status(400)
          .json({ success: false, message: "City name already in use" });
        return;
      }
    }

    const updatedCity = await prisma.city.update({
      where: { id },
      data: { name, state, pincode, status, latitude, longitude, updatedBy },
    });

    res.json({ success: true, data: updatedCity });
  } catch (error) {
    console.error("Error updating city:", error);
    res.status(500).json({ success: false, message: "Failed to update city" });
  }
};

/**
 * @desc Update status of multiple city
 * @route PATCH /project/updateSelectedCityStatus
 */
export const updateSelectedCityStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids, status } = req.body;

    // Validate input parameters
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid request. Please provide an array of city IDs.",
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

    // Check if all cities exist
    const existingCities = await prisma.city.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (existingCities.length !== ids.length) {
      // Some cities were not found
      const existingIds = existingCities.map((city) => city.id);
      const missingIds = ids.filter((id) => !existingIds.includes(id));

      res.status(404).json({
        success: false,
        message: `Some cities were not found: ${missingIds.join(", ")}`,
      });
      return;
    }

    // Update status of all specified cities
    const updateResult = await prisma.city.updateMany({
      where: { id: { in: ids } },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: `Successfully updated status to ${status} for ${updateResult.count} cities.`,
      updatedCount: updateResult.count,
    });
  } catch (error) {
    console.error("Error updating cities status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update cities status",
    });
  }
};

/**
 * @desc Get all cities
 * @route GET /cities
 */
export const getAllCities = async (
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
      state,
      country,
      status,
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
        { state: { contains: search, mode: "insensitive" } },
      ];
    }
    if (state) where.state = { contains: state, mode: "insensitive" };
    if (createdBy) where.createdBy = createdBy;
    if (status) where.status = status;

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
    // ✅ Fetch cities with areas and activityLocation count
    let cities = await prisma.city.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        state: true,
        status: true,
        pincode: true,
        latitude: true,
        longitude: true,
        createdBy: true,
        updatedBy: true,
        createdAt: true,
        updatedAt: true,
        areas: {
          select: {
            locations: {
              select: { id: true },
              take: 1,
            },
          },
          take: 1,
        },
      },
    });

    // ✅ Add hasSoc field
    cities = cities.map((city) => {
      const hasSoc = city.areas.some((area) => area.locations.length > 0);
      return {
        ...city,
        hasSoc,
      };
    });

    // ✅ Handle sorting manually
    cities.sort((a, b) => {
      const fieldA = (a as any)[sortBy];
      const fieldB = (b as any)[sortBy];

      if (typeof fieldA === "string" && typeof fieldB === "string") {
        return order.toLowerCase() === "asc"
          ? fieldA.localeCompare(fieldB)
          : fieldB.localeCompare(fieldA);
      }
      return order.toLowerCase() === "asc" ? fieldA - fieldB : fieldB - fieldA;
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

/**
 * @desc Get city by ID
 * @route GET /city/:id
 */
export const getCityById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const city = await prisma.city.findUnique({ where: { id } });

    if (!city) {
      res.status(404).json({ success: false, message: "City not found" });
      return;
    }

    res.json({ success: true, data: city });
  } catch (error) {
    console.error("Error fetching city:", error);
    res.status(500).json({ success: false, message: "Failed to fetch city" });
  }
};

/**
 * @desc Delete cities
 * @route DELETE /city
 */
export const deleteCities = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res
        .status(400)
        .json({ success: false, message: "Provide an array of city IDs" });
      return;
    }

    const deleteResult = await prisma.city.deleteMany({
      where: { id: { in: ids } },
    });

    if (deleteResult.count === 0) {
      res
        .status(404)
        .json({ success: false, message: "No cities found for the given IDs" });
      return;
    }

    res.json({
      success: true,
      message: `Successfully deleted ${deleteResult.count} cities.`,
    });
  } catch (error) {
    console.error("Error deleting cities:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete cities" });
  }
};

/**
 * @desc Get selected cities for bulk download
 * @route POST /city/download
 */
export const getSelectedCitiesDownload = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res
        .status(400)
        .json({ success: false, message: "Provide an array of city IDs" });
      return;
    }

    const cities = await prisma.city.findMany({ where: { id: { in: ids } } });
    res.json({ success: true, data: cities });
  } catch (error) {
    console.error("Error fetching selected cities:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch selected cities" });
  }
};

export const bulkUploadCities = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const cities = req.body.cities;

    if (!Array.isArray(cities) || cities.length === 0) {
      res.status(400).json({ error: "cities array is required." });
      return;
    }

    const formatted = cities.map((city: any) => {
      const name = city.Name || city.name;
      return {
        id: city.id || undefined,
        name: name,
        slug: city.slug || create_slug(name),
        state: city.State,
        status: city.Status || "ACTIVE",
        createdBy: city.createdBy || null,
        updatedBy: city.updatedBy || null,
      };
    });

    const createdCity = await prisma.city.createMany({
      data: formatted,
      skipDuplicates: true,
    });

    res.status(201).json({
      success: true,
      message: "Cities uploaded",
      count: createdCity.count,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Failed to upload cities" });
  }
};
