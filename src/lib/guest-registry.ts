export type GuestRegistryEntry = {
  full_name: string;
  address: string;
  gender: string;
  phone_number: string;
  nationality: string;
  passport_number: string | null;
  passport_image_key: string | null;
};

const JAPANESE_NATIONALITIES = new Set(["jp", "jpn", "japan", "japanese", "日本", "日本国籍"]);

export function isJapaneseNationality(nationality: string): boolean {
  return JAPANESE_NATIONALITIES.has(nationality.trim().toLocaleLowerCase("ja-JP"));
}

export function validateGuestRegistry(input: unknown, expectedCount: number): GuestRegistryEntry[] | null {
  if (!Array.isArray(input) || input.length !== expectedCount || input.length < 1 || input.length > 10) {
    return null;
  }

  const guests: GuestRegistryEntry[] = [];
  for (const value of input) {
    if (typeof value !== "object" || value === null) return null;
    const guest = value as Record<string, unknown>;
    const fields = ["full_name", "address", "gender", "phone_number", "nationality"] as const;
    if (
      fields.some(
        (field) =>
          typeof guest[field] !== "string" ||
          guest[field].trim().length === 0 ||
          guest[field].trim().length > 500,
      )
    ) {
      return null;
    }

    const nationality = (guest.nationality as string).trim();
    const passportNumber =
      typeof guest.passport_number === "string" ? guest.passport_number.trim() : "";
    const passportImageKey =
      typeof guest.passport_image_key === "string" ? guest.passport_image_key.trim() : "";
    if (
      !isJapaneseNationality(nationality) &&
      (!passportNumber ||
        !passportImageKey ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(
          passportImageKey.slice(passportImageKey.lastIndexOf("/") + 1),
        ))
    ) {
      return null;
    }

    guests.push({
      full_name: (guest.full_name as string).trim(),
      address: (guest.address as string).trim(),
      gender: (guest.gender as string).trim(),
      phone_number: (guest.phone_number as string).trim(),
      nationality,
      passport_number: passportNumber || null,
      passport_image_key: passportImageKey || null,
    });
  }
  return guests;
}
