import { redirect } from "next/navigation";
export default function AllPlacesRedirect({ params }: { params: Promise<{ tripId: string }> }) { return params.then(({ tripId }) => redirect(`/trips/${tripId}/places`)); }
