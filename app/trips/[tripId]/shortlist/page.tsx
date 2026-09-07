import { redirect } from "next/navigation";

export default async function ShortlistRedirect({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  redirect(`/trips/${tripId}/places`);
}
