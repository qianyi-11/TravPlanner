import { redirect } from "next/navigation";
export default function VoteResultsRedirect({ params }: { params: Promise<{ tripId: string }> }) { return params.then(({ tripId }) => redirect(`/trips/${tripId}/vote`)); }
