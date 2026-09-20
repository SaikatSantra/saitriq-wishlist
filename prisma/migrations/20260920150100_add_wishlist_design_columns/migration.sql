ALTER TABLE "WishlistSettings"
ADD COLUMN "cardClass" TEXT NOT NULL DEFAULT 'sai-wishlist-page__item';

ALTER TABLE "WishlistSettings"
ADD COLUMN "customCss" TEXT NOT NULL DEFAULT '';
