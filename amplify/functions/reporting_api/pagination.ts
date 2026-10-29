/** Seitenaufteilung der Kunden-API, ohne Version (Felder des `pagination`-Objekts legt die Versionsschicht fest). */

export interface PageInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/** `page` hinter der letzten Seite ergibt leere Einträge, keinen Fehler. */
export function paginate<T>(records: T[], page: number, limit: number): { items: T[]; pageInfo: PageInfo } {
  const total = records.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  return {
    items: records.slice(start, start + limit),
    pageInfo: {
      page,
      limit,
      total,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  };
}
