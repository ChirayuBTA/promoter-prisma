export const generatePromoCode = (societyName: string) => {
  const shortName = societyName
    .toUpperCase()
    .replace(/\s+/g, "")
    .substring(0, 5);
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `P-${shortName}-${randomNum}`; // Example: P-GREENPARK-4567
};
