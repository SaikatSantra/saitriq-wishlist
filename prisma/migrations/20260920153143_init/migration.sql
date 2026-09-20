-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productHandle" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productImage" TEXT,
    "productPrice" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistSettings" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "heading" TEXT NOT NULL DEFAULT 'My wishlist',
    "emptyMessage" TEXT NOT NULL DEFAULT 'You have not saved any products yet.',
    "columns" INTEGER NOT NULL DEFAULT 4,
    "showPrices" BOOLEAN NOT NULL DEFAULT true,
    "showRemove" BOOLEAN NOT NULL DEFAULT true,
    "buttonLabel" TEXT NOT NULL DEFAULT 'Remove',
    "cardClass" TEXT NOT NULL DEFAULT 'sai-wishlist-page__item',
    "customCss" TEXT NOT NULL DEFAULT '',
    "buttonMode" TEXT NOT NULL DEFAULT 'icon-text',
    "customSvg" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WishlistSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WishlistItem_shop_customerId_idx" ON "WishlistItem"("shop", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_shop_customerId_productId_key" ON "WishlistItem"("shop", "customerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistSettings_shop_key" ON "WishlistSettings"("shop");
