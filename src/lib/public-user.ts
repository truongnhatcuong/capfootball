export const publicUserSelect = { id: true, name: true, image: true, ratingAvg: true, ratingCount: true, noShowCount: true, createdAt: true } as const;
export function publicUser<T extends { ratingCount: number; ratingAvg: number | null }>(user: T) {
  return { ...user, ratingAvg: user.ratingCount >= 3 ? user.ratingAvg : null };
}
