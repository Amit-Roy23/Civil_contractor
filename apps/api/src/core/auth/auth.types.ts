export interface JwtUserPayload {
  userId: string;
  companyId: string;
  username: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  scopedLocationIds: string[];
  scopedSiteIds: string[];
  scopedPlantIds: string[];
}
