/** Bangladesh's 64 districts, grouped by division. */
export const DISTRICTS_BY_DIVISION: Record<string, string[]> = {
  Dhaka: ["Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj", "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail"],
  Chattogram: ["Bandarban", "Brahmanbaria", "Chandpur", "Chattogram", "Cox's Bazar", "Cumilla", "Feni", "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati"],
  Rajshahi: ["Bogura", "Chapainawabganj", "Joypurhat", "Naogaon", "Natore", "Pabna", "Rajshahi", "Sirajganj"],
  Khulna: ["Bagerhat", "Chuadanga", "Jashore", "Jhenaidah", "Khulna", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira"],
  Barishal: ["Barguna", "Barishal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur"],
  Sylhet: ["Habiganj", "Moulvibazar", "Sunamganj", "Sylhet"],
  Rangpur: ["Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Rangpur", "Thakurgaon"],
  Mymensingh: ["Jamalpur", "Mymensingh", "Netrokona", "Sherpur"],
};

export const DISTRICTS = Object.values(DISTRICTS_BY_DIVISION).flat().sort();

export interface ZoneLike {
  key: string;
  districts: string[];
  isActive: boolean;
  position: number;
}

/** Zone with the district listed wins; otherwise the first active fallback zone (empty districts). */
export function zoneForDistrict<T extends ZoneLike>(zones: T[], district: string): T | null {
  const active = zones.filter((z) => z.isActive).sort((a, b) => a.position - b.position);
  return (
    active.find((z) => z.districts.some((d) => d.toLowerCase() === district.toLowerCase())) ??
    active.find((z) => z.districts.length === 0) ??
    null
  );
}

export function deliveryEstimate(minDays: number, maxDays: number, from = new Date()): { from: Date; to: Date } {
  const add = (d: number) => {
    const x = new Date(from);
    x.setDate(x.getDate() + d);
    return x;
  };
  return { from: add(minDays), to: add(maxDays) };
}
