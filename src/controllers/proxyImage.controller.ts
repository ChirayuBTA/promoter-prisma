import { Request, Response } from "express";

export const getProxyImage = async (
  req: Request,
  res: Response
): Promise<void> => {
  const imageUrl = Array.isArray(req.query.url)
    ? req.query.url[0]
    : req.query.url;

  if (typeof imageUrl !== "string") {
    res.status(400).send("Invalid image URL");
    return;
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Failed to fetch image");

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();

    res.setHeader("Content-Type", contentType);
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error("Image proxy error:", err);
    res.status(500).send("Failed to fetch image");
  }
};
