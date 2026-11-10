-- Channex: room type / rate plan ids, Airbnb link time and last pushed snapshot.
ALTER TABLE "CalendarSource" ADD COLUMN "channexRoomTypeId" TEXT,
ADD COLUMN "channexRatePlanId" TEXT,
ADD COLUMN "channexLinkedAt" TIMESTAMP(3),
ADD COLUMN "channexPushed" JSONB;
