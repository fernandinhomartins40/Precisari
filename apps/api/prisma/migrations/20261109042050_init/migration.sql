-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'APPLE', 'GOOGLE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'AUTO');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DestinationType" AS ENUM ('BEACH', 'MOUNTAIN', 'URBAN', 'RURAL', 'CULTURAL');

-- CreateEnum
CREATE TYPE "Aggressiveness" AS ENUM ('CONSERVATIVE', 'BALANCED', 'BOLD');

-- CreateEnum
CREATE TYPE "CalendarSourceType" AS ENUM ('ICAL', 'CHANNEX');

-- CreateEnum
CREATE TYPE "CalendarSourceStatus" AS ENUM ('PENDING', 'OK', 'ERROR');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('PRICE', 'MIN_STAY', 'ORPHAN', 'ADJACENT');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PENDING', 'APPROVED', 'DISMISSED', 'APPLIED', 'REVERTED');

-- CreateEnum
CREATE TYPE "EventSize" AS ENUM ('P', 'M', 'G', 'XG');

-- CreateEnum
CREATE TYPE "HolidayScope" AS ENUM ('NATIONAL', 'STATE', 'MUNICIPAL');

-- CreateEnum
CREATE TYPE "HolidayKind" AS ENUM ('REGULAR', 'CARNIVAL', 'NEW_YEAR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "authProvider" "AuthProvider" NOT NULL DEFAULT 'EMAIL',
    "providerSubject" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "dailyNotificationHour" INTEGER NOT NULL DEFAULT 9,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "emailWeeklySummary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "provider" TEXT NOT NULL DEFAULT 'none',
    "providerRef" TEXT,
    "propertyCount" INTEGER NOT NULL DEFAULT 1,
    "currentPeriodEnd" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "ibgeCode" TEXT,
    "destinationType" "DestinationType" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "basePrice" INTEGER NOT NULL,
    "minPrice" INTEGER NOT NULL,
    "maxPrice" INTEGER NOT NULL,
    "cleaningFee" INTEGER NOT NULL DEFAULT 0,
    "monthlyFixedCosts" INTEGER,
    "platformFeePct" DOUBLE PRECISION NOT NULL DEFAULT 0.03,
    "aggressiveness" "Aggressiveness" NOT NULL DEFAULT 'BALANCED',
    "rulesConfig" JSONB NOT NULL DEFAULT '{"enabled":{}}',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "listingUrl" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSource" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "type" "CalendarSourceType" NOT NULL DEFAULT 'ICAL',
    "urlEncrypted" TEXT,
    "urlMasked" TEXT,
    "contentHash" TEXT,
    "channexPropertyId" TEXT,
    "channexTokenEnc" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "status" "CalendarSourceStatus" NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ical',
    "externalUid" TEXT NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
    "revenue" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NightPrice" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'free',
    "suggestedPrice" INTEGER NOT NULL,
    "minStay" INTEGER NOT NULL,
    "discountPct" DOUBLE PRECISION,
    "factors" JSONB NOT NULL,
    "heat" DOUBLE PRECISION NOT NULL,
    "isOrphan" BOOLEAN NOT NULL DEFAULT false,
    "headline" TEXT,
    "explanation" TEXT,
    "factorsHash" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "engineVersion" TEXT NOT NULL,

    CONSTRAINT "NightPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "ActionType" NOT NULL,
    "fromValue" INTEGER NOT NULL,
    "toValue" INTEGER NOT NULL,
    "estimatedGain" INTEGER NOT NULL DEFAULT 0,
    "status" "ActionStatus" NOT NULL DEFAULT 'PENDING',
    "headline" TEXT,
    "explanation" TEXT,
    "factors" JSONB NOT NULL DEFAULT '[]',
    "decidedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExplanationCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExplanationCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "size" "EventSize" NOT NULL,
    "radiusKm" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "scope" "HolidayScope" NOT NULL,
    "state" CHAR(2),
    "ibgeCode" TEXT,
    "name" TEXT NOT NULL,
    "isBridge" BOOLEAN NOT NULL DEFAULT false,
    "kind" "HolidayKind" NOT NULL DEFAULT 'REGULAR',

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolVacation" (
    "id" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "year" INTEGER NOT NULL,

    CONSTRAINT "SchoolVacation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeatherForecast" (
    "id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL,
    "precipProb" DOUBLE PRECISION NOT NULL,
    "precipMm" DOUBLE PRECISION,
    "tempMin" DOUBLE PRECISION NOT NULL,
    "tempMax" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeatherForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "OtpCode_email_createdAt_idx" ON "OtpCode"("email", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerRef_key" ON "Subscription"("providerRef");

-- CreateIndex
CREATE INDEX "Property_userId_idx" ON "Property"("userId");

-- CreateIndex
CREATE INDEX "Property_city_state_idx" ON "Property"("city", "state");

-- CreateIndex
CREATE INDEX "CalendarSource_propertyId_idx" ON "CalendarSource"("propertyId");

-- CreateIndex
CREATE INDEX "Booking_propertyId_checkIn_idx" ON "Booking"("propertyId", "checkIn");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_propertyId_source_externalUid_key" ON "Booking"("propertyId", "source", "externalUid");

-- CreateIndex
CREATE UNIQUE INDEX "NightPrice_propertyId_date_key" ON "NightPrice"("propertyId", "date");

-- CreateIndex
CREATE INDEX "Action_propertyId_status_idx" ON "Action"("propertyId", "status");

-- CreateIndex
CREATE INDEX "Action_propertyId_date_idx" ON "Action"("propertyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ExplanationCache_cacheKey_key" ON "ExplanationCache"("cacheKey");

-- CreateIndex
CREATE INDEX "Event_city_state_startDate_idx" ON "Event"("city", "state", "startDate");

-- CreateIndex
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_scope_state_ibgeCode_name_key" ON "Holiday"("date", "scope", "state", "ibgeCode", "name");

-- CreateIndex
CREATE INDEX "SchoolVacation_state_year_idx" ON "SchoolVacation"("state", "year");

-- CreateIndex
CREATE UNIQUE INDEX "WeatherForecast_lat_lng_date_key" ON "WeatherForecast"("lat", "lng", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_expoPushToken_key" ON "DeviceToken"("expoPushToken");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_key_userId_route_key" ON "IdempotencyKey"("key", "userId", "route");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_externalId_key" ON "WebhookEvent"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSource" ADD CONSTRAINT "CalendarSource_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NightPrice" ADD CONSTRAINT "NightPrice_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
