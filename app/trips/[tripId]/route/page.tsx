import { redirect } from "next/navigation";
export default function RouteRedirect({ params }: { params: Promise<{ tripId: string }> }) { return params.then(({ tripId }) => redirect(`/trips/${tripId}/generating`)); }
