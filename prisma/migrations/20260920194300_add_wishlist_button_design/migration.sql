ALTER TABLE "WishlistSettings"
ADD COLUMN "buttonMode" TEXT NOT NULL DEFAULT 'icon-text';

ALTER TABLE "WishlistSettings"
ADD COLUMN "customSvg" TEXT NOT NULL DEFAULT '';
