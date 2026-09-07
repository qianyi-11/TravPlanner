import { redirect } from "next/navigation";

export default async function LiveRedirect({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  redirect(`/trips/${tripId}/plan`);
}
