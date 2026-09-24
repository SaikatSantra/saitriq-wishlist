const WISHLIST_TYPE = "$app:wishlist";
const ANALYTICS_TYPE = "$app:wishlist_analytics";

const METAOBJECT_BY_HANDLE = `#graphql
  query MetaobjectByHandle($handle: MetaobjectHandleInput!) {
    metaobjectByHandle(handle: $handle) {
      id
      handle
      fields { key value }
    }
  }
`;

const METAOBJECT_UPSERT = `#graphql
  mutation UpsertMetaobject($handle: MetaobjectHandleInput!, $values: JSON!) {
    metaobjectUpsert(handle: $handle, values: $values) {
      metaobject { id handle fields { key value } }
      userErrors { field message code }
    }
  }
`;

const METAOBJECT_CREATE = `#graphql
  mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject { id handle fields { key value } }
      userErrors { field message }
    }
  }
`;

const METAOBJECT_DELETE = `#graphql
  mutation DeleteMetaobject($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors { field message }
    }
  }
`;

const METAOBJECTS = `#graphql
  query WishlistMetaobjects($type: String!) {
    metaobjects(type: $type, first: 250) {
      nodes { id handle fields { key value } }
    }
  }
`;

const fields = (values) =>
  Object.entries(values)
    .filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    )
    .map(([key, value]) => ({ key, value: String(value) }));

const values = (input) =>
  Object.fromEntries(
    Object.entries(input).filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    ),
  );

const validUrl = (value) => {
  if (!value) return null;
  const candidate = String(value).trim();
  const normalized = candidate.startsWith("//")
    ? `https:${candidate}`
    : candidate;
  try {
    const url = new URL(normalized);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
};

const payloadErrors = (payload) => payload?.errors || [];

const assertNoErrors = (result, operation) => {
  const errors = result?.userErrors || [];
  if (errors.length) {
    throw new Error(
      `${operation} failed: ${errors.map((error) => error.message).join(", ")}`,
    );
  }
};

const readPayload = async (response, operation) => {
  const payload = await response.json();
  const errors = payloadErrors(payload);
  if (errors.length) {
    throw new Error(
      `${operation} failed: ${errors.map((error) => error.message).join(", ")}`,
    );
  }
  return payload;
};

const readByHandle = async (admin, type, handle) => {
  const response = await admin.graphql(METAOBJECT_BY_HANDLE, {
    variables: { handle: { type, handle } },
  });
  const payload = await readPayload(response, "Metaobject lookup");
  return payload.data?.metaobjectByHandle || null;
};

export const wishlistHandle = (customerId, productId) =>
  `customer-${customerId}-product-${productId}`
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .slice(0, 255);

export const guestWishlistHandle = (visitorId, productId) =>
  `guest-${visitorId}-product-${productId}`
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .slice(0, 255);

export const analyticsHandle = (month) => `month-${month}`;
export const dailyAnalyticsHandle = (day) => `day-${day}`;

export const upsertWishlist = async (admin, item) => {
  const handle = (item.handleFactory || wishlistHandle)(
    item.customerId,
    item.productId,
  );
  const existing = await readByHandle(admin, WISHLIST_TYPE, handle);
  const metaobjectValues = values({
    customer_id: item.customerId,
    product_id: item.productId,
    product_handle: item.productHandle,
    product_title: item.productTitle,
    product_image: validUrl(item.productImage),
    product_price: item.productPrice,
    added_at: item.addedAt,
  });

  if (existing) {
    const response = await admin.graphql(METAOBJECT_UPSERT, {
      variables: {
        handle: { type: WISHLIST_TYPE, handle },
        values: metaobjectValues,
      },
    });
    const payload = await readPayload(response, "Wishlist update");
    assertNoErrors(payload.data?.metaobjectUpsert, "Wishlist update");
    return {
      metaobject: payload.data.metaobjectUpsert.metaobject,
      created: false,
    };
  }

  const response = await admin.graphql(METAOBJECT_CREATE, {
    variables: {
      metaobject: {
        type: WISHLIST_TYPE,
        handle,
        fields: fields(metaobjectValues),
      },
    },
  });
  const payload = await readPayload(response, "Wishlist create");
  if (payload.data?.metaobjectCreate?.userErrors?.length) {
    const retry = await admin.graphql(METAOBJECT_UPSERT, {
      variables: {
        handle: { type: WISHLIST_TYPE, handle },
        values: metaobjectValues,
      },
    });
    const retryPayload = await readPayload(retry, "Wishlist retry");
    assertNoErrors(retryPayload.data?.metaobjectUpsert, "Wishlist retry");
    return {
      metaobject: retryPayload.data.metaobjectUpsert.metaobject,
      created: false,
    };
  }
  assertNoErrors(payload.data?.metaobjectCreate, "Wishlist create");
  return {
    metaobject: payload.data.metaobjectCreate.metaobject,
    created: true,
  };
};

export const deleteWishlist = async (
  admin,
  customerId,
  productId,
  handleFactory = wishlistHandle,
) => {
  const existing = await readByHandle(
    admin,
    WISHLIST_TYPE,
    handleFactory(customerId, productId),
  );
  if (!existing) return false;
  const response = await admin.graphql(METAOBJECT_DELETE, {
    variables: { id: existing.id },
  });
  const payload = await readPayload(response, "Wishlist delete");
  assertNoErrors(payload.data?.metaobjectDelete, "Wishlist delete");
  return true;
};

export const deleteCustomerWishlists = async (
  admin,
  customerId,
  handleFactory = wishlistHandle,
) => {
  const items = await listCustomerWishlists(admin, customerId);
  for (const item of items) {
    await deleteWishlist(admin, customerId, item.productId, handleFactory);
  }
  return items.length;
};

export const listCustomerWishlists = async (admin, customerId) => {
  const items = await listWishlists(admin);
  return items.filter((item) => item.customerId === customerId);
};

export const listWishlists = async (admin) => {
  const response = await admin.graphql(METAOBJECTS, {
    variables: { type: WISHLIST_TYPE },
  });
  const payload = await readPayload(response, "Wishlist lookup");
  const nodes = payload.data?.metaobjects?.nodes || [];
  return nodes
    .map((node) => ({
      id: node.id,
      ...Object.fromEntries(
        node.fields.map((field) => [field.key, field.value]),
      ),
    }))
    .map(toWishlistItem);
};

export const countWishlistSavesForMonth = async (admin, month) => {
  const items = await listWishlists(admin);
  return items.filter((item) => {
    const timestamp = String(item.createdAt || "").trim();
    if (!timestamp) return false;
    if (timestamp.startsWith(month)) return true;
    const parsed = new Date(timestamp);
    return !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 7) === month;
  }).length;
};

const toWishlistItem = (item) => ({
  id: item.id,
  productId: item.product_id,
  productHandle: item.product_handle,
  productTitle: item.product_title,
  productImage: item.product_image || null,
  productPrice: item.product_price || null,
  customerId: item.customer_id,
  createdAt: item.added_at,
});

export const getAnalytics = async (admin, month) => {
  const metaobject = await readByHandle(
    admin,
    ANALYTICS_TYPE,
    analyticsHandle(month),
  );
  const values = Object.fromEntries(
    (metaobject?.fields || []).map((field) => [field.key, field.value]),
  );
  return {
    metaobject,
    adds: Number(values.adds || 0),
    removes: Number(values.removes || 0),
    uniqueCustomers: Number(values.unique_customers || 0),
  };
};

export const getAnalyticsHistory = async (admin, month) => {
  const response = await admin.graphql(METAOBJECTS, {
    variables: { type: ANALYTICS_TYPE },
  });
  const payload = await readPayload(response, "Analytics lookup");

  return (payload.data?.metaobjects?.nodes || [])
    .map((node) => ({
      id: node.id,
      handle: node.handle,
      ...Object.fromEntries(
        node.fields.map((field) => [field.key, field.value]),
      ),
    }))
    .filter(
      (item) =>
        item.month === month && item.day && item.handle.startsWith("day-"),
    )
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((item) => ({
      day: item.day,
      adds: Number(item.adds || 0),
      removes: Number(item.removes || 0),
    }));
};

const upsertAnalyticsEntry = async (admin, handle, entry) => {
  const response = await admin.graphql(METAOBJECT_UPSERT, {
    variables: {
      handle: { type: ANALYTICS_TYPE, handle },
      values: values(entry),
    },
  });
  const payload = await readPayload(response, "Analytics update");
  assertNoErrors(payload.data?.metaobjectUpsert, "Analytics update");
};

export const recordAnalytics = async (admin, month, changes) => {
  const current = await getAnalytics(admin, month);
  const day = new Date().toISOString().slice(0, 10);
  const timestamp = new Date().toISOString();

  await upsertAnalyticsEntry(admin, analyticsHandle(month), {
    month,
    day: `${month}-01`,
    adds: current.adds + (changes.adds || 0),
    removes: current.removes + (changes.removes || 0),
    unique_customers: current.uniqueCustomers + (changes.uniqueCustomers || 0),
    updated_at: timestamp,
  });

  const history = await getAnalyticsHistory(admin, month);
  const today = history.find((entry) => entry.day === day);
  await upsertAnalyticsEntry(admin, dailyAnalyticsHandle(day), {
    month,
    day,
    adds: (today?.adds || 0) + (changes.adds || 0),
    removes: (today?.removes || 0) + (changes.removes || 0),
    unique_customers: changes.uniqueCustomers || 0,
    updated_at: timestamp,
  });

  return { ...current, adds: current.adds + (changes.adds || 0) };
};

export const monthlyLimit = (plan) =>
  ({ free: 100, standard: 500, enterprise: Infinity })[plan] ?? 100;

export { WISHLIST_TYPE, ANALYTICS_TYPE };
