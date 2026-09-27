-- CreateTable
CREATE TABLE "WishlistAnalytics" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "adds" INTEGER NOT NULL DEFAULT 0,
    "removes" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WishlistAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WishlistAnalytics_shop_month_idx" ON "WishlistAnalytics"("shop", "month");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistAnalytics_shop_day_key" ON "WishlistAnalytics"("shop", "day");
