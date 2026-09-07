import { redirect } from "next/navigation";
export default function MyPlacesRedirect({ params }: { params: Promise<{ tripId: string }> }) { return params.then(({ tripId }) => redirect(`/trips/${tripId}/places?mine=1`)); }
