import { PageHeader } from "@/components/ui";
import { getBookingRequests } from "@/lib/queries";
import { BookingsClient } from "./bookings-client";

export const dynamic = "force-dynamic";

export default async function BookingInboxPage() {
  const requests = await getBookingRequests();
  return (
    <>
      <PageHeader title="Booking requests" />
      <BookingsClient requests={requests} />
    </>
  );
}
