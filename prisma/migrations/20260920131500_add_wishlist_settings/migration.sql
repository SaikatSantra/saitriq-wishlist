CREATE TABLE "WishlistSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "heading" TEXT NOT NULL DEFAULT 'My wishlist',
    "emptyMessage" TEXT NOT NULL DEFAULT 'You have not saved any products yet.',
    "columns" INTEGER NOT NULL DEFAULT 4,
    "showPrices" BOOLEAN NOT NULL DEFAULT true,
    "showRemove" BOOLEAN NOT NULL DEFAULT true,
    "buttonLabel" TEXT NOT NULL DEFAULT 'Remove',
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "WishlistSettings_shop_key"
ON "WishlistSettings"("shop");

ALTER TABLE "WishlistItem" ADD COLUMN "productPrice" TEXT;
