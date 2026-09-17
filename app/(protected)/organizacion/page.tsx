import { getOrgData } from "@/app/actions/organizacion";
import OrgDashboard from "./OrgDashboard";

export default async function OrganizacionPage() {
  const data = await getOrgData();
  return <OrgDashboard data={data} />;
}
