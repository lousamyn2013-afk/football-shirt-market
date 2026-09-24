const express = require("express");
const session = require("express-session");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://torxckrcdelecwioqgyt.supabase.co";

const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const DB_KEY =
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_KEY;

if (!SUPABASE_KEY) {
  console.warn("WARNING: SUPABASE_PUBLISHABLE_KEY is not set.");
}

const publicSupabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY || "sb_publishable_placeholder"
);

const dbSupabase = createClient(
  SUPABASE_URL,
  DB_KEY || "sb_publishable_placeholder"
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "change-this-session-secret",

    resave: false,
    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

function bearerToken(req) {
  const header =
    String(req.headers.authorization || "");

  if (
    header
      .toLowerCase()
      .startsWith("bearer ")
  ) {
    return header.slice(7).trim();
  }

  return req.session.accessToken || "";
}

function userClient(token) {
  if (!token) return null;

  return createClient(
    SUPABASE_URL,
    DB_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      },

      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}

async function getAuthUser(req) {
  const token = bearerToken(req);

  if (!token || !SUPABASE_KEY) {
    return null;
  }

  const client = userClient(token);

  const {
    data,
    error
  } = await client.auth.getUser(token);

  if (
    error ||
    !data?.user
  ) {
    return null;
  }

  return {
    user: data.user,
    token,
    client
  };
}

async function requireLogin(
  req,
  res,
  next
) {
  try {
    const auth =
      await getAuthUser(req);

    if (!auth) {
      return res.status(401).json({
        error:
          "Je moet ingelogd zijn."
      });
    }

    req.auth = auth;

    next();
  } catch (error) {
    console.error(error);

    res.status(401).json({
      error:
        "Je sessie is niet geldig."
    });
  }
}

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function firstImage(imageUrls) {
  if (Array.isArray(imageUrls)) {
    return imageUrls[0] || "";
  }

  return "";
}

function profileToUser(
  profile,
  authUser
) {
  return {
    id:
      authUser?.id ||
      profile?.user_id ||
      profile?.id,

    name:
      profile?.username ||
      authUser?.user_metadata?.username ||
      authUser?.email?.split("@")[0] ||
      "Gebruiker",

    username:
      profile?.username ||
      authUser?.user_metadata?.username ||
      authUser?.email?.split("@")[0] ||
      "Gebruiker",

    email:
      authUser?.email || "",

    avatar_url:
      profile?.avatar_url || null,

    bio:
      profile?.bio || "",

    location:
      profile?.location || "",

    verified:
      profile?.verified || false,

    badges:
      Array.isArray(profile?.badges)
        ? profile.badges
        : [],

    created_at:
      profile?.created_at ||
      authUser?.created_at ||
      null,

    last_seen_at:
      profile?.last_seen_at ||
      null
  };
}

async function getProfile(
  client,
  userId
) {
  const {
    data,
    error
  } = await client
    .from("profiles")
    .select(
      "user_id,username,avatar_url,bio,location,verified,created_at,last_seen_at,badges"
    )
    .eq(
      "user_id",
      userId
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function findProfileByUsername(
  client,
  username
) {
  const {
    data,
    error
  } = await client
    .from("profiles")
    .select(
      "user_id,username,avatar_url,bio,location,verified,created_at,last_seen_at,badges"
    )
    .eq(
      "username",
      clean(username)
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function resolveUserId(
  client,
  value
) {
  const v = clean(value);

  if (!v) {
    return null;
  }

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v
    )
  ) {
    return v;
  }

  const profile =
    await findProfileByUsername(
      client,
      v
    );

  return profile?.user_id || null;
}

function mapListing(row) {
  if (!row) {
    return row;
  }

  const images =
    Array.isArray(row.image_urls)
      ? row.image_urls
      : [];

  return {
    ...row,

    id: row.id,

    seller_id:
      row.seller_id,

    seller:
      row.profiles?.username ||
      row.seller ||
      "",

    username:
      row.profiles?.username ||
      row.seller ||
      "",

    name:
      row.title,

    title:
      row.title,

    description:
      row.description || "",

    price:
      row.price,

    brand:
      row.brand || "",

    size:
      row.size || "",

    condition:
      row.condition || "",

    category:
      row.category || "",

    type:
      row.category || "",

    images,

    image:
      firstImage(images),

    status:
      row.status || "active",

    created_at:
      row.created_at
  };
}

async function getListing(
  client,
  id
) {
  const {
    data,
    error
  } = await client
    .from("listings")
    .select(
      "id,seller_id,title,description,price,brand,size,condition,category,image_urls,status,created_at,profiles!listings_seller_id_fkey(username,avatar_url,verified)"
    )
    .eq(
      "id",
      clean(id)
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}


/* =========================
   AUTH
========================= */

app.get(
  "/api/me",
  requireLogin,
  async (req, res) => {
    try {
      const profile =
        await getProfile(
          req.auth.client,
          req.auth.user.id
        );

      res.json(
        profileToUser(
          profile,
          req.auth.user
        )
      );
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Kan gebruiker niet laden."
      });
    }
  }
);


app.post(
  "/api/register",
  async (req, res) => {
    try {
      const email =
        clean(
          req.body.email
        ).toLowerCase();

      const password =
        String(
          req.body.password || ""
        );

      const username =
        clean(
          req.body.username ||
          req.body.name
        );

      const location =
        clean(
          req.body.location
        );

      if (
        !email ||
        !password ||
        !username
      ) {
        return res.status(400).json({
          error:
            "Vul gebruikersnaam, e-mail en wachtwoord in."
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          error:
            "Je wachtwoord moet minimaal 6 tekens bevatten."
        });
      }

      const {
        data,
        error
      } =
        await publicSupabase.auth.signUp(
          {
            email,
            password,

            options: {
              data: {
                username,
                location
              }
            }
          }
        );

      if (error) {
        return res.status(400).json({
          error:
            error.message
        });
      }

      if (!data?.user) {
        return res.status(400).json({
          error:
            "Account aanmaken is mislukt."
        });
      }

      if (
        data.session?.access_token
      ) {
        req.session.accessToken =
          data.session.access_token;

        req.session.userId =
          data.user.id;
      }

      res.status(201).json({
        id:
          data.user.id,

        name:
          username,

        username,

        email:
          data.user.email,

        access_token:
          data.session?.access_token ||
          null,

        needs_email_confirmation:
          !data.session
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Registreren is mislukt."
      });
    }
  }
);


app.post(
  "/api/login",
  async (req, res) => {
    try {
      const email =
        clean(
          req.body.email
        ).toLowerCase();

      const password =
        String(
          req.body.password || ""
        );

      if (
        !email ||
        !password
      ) {
        return res.status(400).json({
          error:
            "Vul e-mail en wachtwoord in."
        });
      }

      const {
        data,
        error
      } =
        await publicSupabase.auth.signInWithPassword(
          {
            email,
            password
          }
        );

      if (
        error ||
        !data?.session ||
        !data?.user
      ) {
        return res.status(401).json({
          error:
            error?.message ||
            "Onjuiste e-mail of wachtwoord."
        });
      }

      req.session.accessToken =
        data.session.access_token;

      req.session.userId =
        data.user.id;

      const profile =
        await getProfile(
          userClient(
            data.session.access_token
          ),
          data.user.id
        );

      res.json(
        profileToUser(
          profile,
          data.user
        )
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Inloggen is mislukt."
      });
    }
  }
);


app.post(
  "/api/logout",
  (req, res) => {
    req.session.destroy(
      () => {
        res.json({
          success: true
        });
      }
    );
  }
);


/* =========================
   LISTINGS
========================= */

app.get(
  "/api/listings",
  async (req, res) => {
    try {
      const client =
        SUPABASE_KEY
          ? publicSupabase
          : null;

      if (!client) {
        return res.status(500).json({
          error:
            "Supabase is niet geconfigureerd."
        });
      }

      let query =
        client
          .from("listings")
          .select(
            "id,seller_id,title,description,price,brand,size,condition,category,image_urls,status,created_at,profiles!listings_seller_id_fkey(username,avatar_url,verified)"
          );

      const q =
        clean(
          req.query.q
        ).toLowerCase();

      const condition =
        clean(
          req.query.condition
        );

      const type =
        clean(
          req.query.type
        );

      const status =
        clean(
          req.query.status
        );

      const sort =
        clean(
          req.query.sort
        ) ||
        "recommended";

      if (q) {
        query =
          query.or(
            `title.ilike.%${q}%,description.ilike.%${q}%,brand.ilike.%${q}%,category.ilike.%${q}%`
          );
      }

      if (condition) {
        query =
          query.eq(
            "condition",
            condition
          );
      }

      if (status) {
        query =
          query.eq(
            "status",
            status
          );
      } else {
        query =
          query.eq(
            "status",
            "active"
          );
      }

      const types =
        type
          .split(",")
          .map(
            x => x.trim()
          )
          .filter(Boolean);

      if (types.length === 1) {
        query =
          query.ilike(
            "category",
            `%${types[0]}%`
          );
      }

      if (types.length > 1) {
        query =
          query.in(
            "category",
            types
          );
      }

      if (sort === "low") {
        query =
          query.order(
            "price",
            {
              ascending: true
            }
          );
      } else if (
        sort === "high"
      ) {
        query =
          query.order(
            "price",
            {
              ascending: false
            }
          );
      } else {
        query =
          query.order(
            "created_at",
            {
              ascending: false
            }
          );
      }

      const {
        data,
        error
      } =
        await query;

      if (error) {
        throw error;
      }

      res.json(
        (data || []).map(
          mapListing
        )
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Kan listings niet laden."
      });
    }
  }
);


app.get(
  "/api/listings/:id",
  async (req, res) => {
    try {
      const client =
        SUPABASE_KEY
          ? publicSupabase
          : null;

      const row =
        await getListing(
          client,
          req.params.id
        );

      if (!row) {
        return res.status(404).json({
          error:
            "Shirt niet gevonden."
        });
      }

      res.json(
        mapListing(row)
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Kan listing niet laden."
      });
    }
  }
);


app.post(
  "/api/listings",
  requireLogin,
  async (req, res) => {
    try {
      const title =
        clean(
          req.body.title ||
          req.body.name
        );

      const description =
        clean(
          req.body.description
        );

      const price =
        Number(
          req.body.price
        );

      const brand =
        clean(
          req.body.brand
        );

      const size =
        clean(
          req.body.size
        );

      const condition =
        clean(
          req.body.condition
        );

      const category =
        clean(
          req.body.category ||
          req.body.type
        );

      let image_urls =
        req.body.image_urls ||
        req.body.images ||
        [];

      if (
        typeof image_urls ===
        "string"
      ) {
        try {
          image_urls =
            JSON.parse(
              image_urls
            );
        } catch {
          image_urls =
            image_urls
              .split(",")
              .map(
                x => x.trim()
              )
              .filter(Boolean);
        }
      }

      if (!Array.isArray(image_urls)) {
        image_urls = [];
      }

      if (!title) {
        return res.status(400).json({
          error:
            "Vul een titel in."
        });
      }

      if (
        !Number.isFinite(price) ||
        price <= 0
      ) {
        return res.status(400).json({
          error:
            "Vul een geldige prijs in."
        });
      }

      const payload = {
        seller_id:
          req.auth.user.id,

        title,

        description,

        price,

        brand,

        size,

        condition,

        category,

        image_urls,

        status:
          "active"
      };

      const {
        data,
        error
      } =
        await req.auth.client
          .from("listings")
          .insert(payload)
          .select(
            "id,seller_id,title,description,price,brand,size,condition,category,image_urls,status,created_at"
          )
          .single();

      if (error) {
        throw error;
      }

      res.status(201).json(
        mapListing(data)
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Listing publiceren is mislukt."
      });
    }
  }
);


/* =========================
   MY LISTINGS
========================= */

app.get(
  "/api/mine",
  requireLogin,
  async (req, res) => {
    try {
      const {
        data,
        error
      } =
        await req.auth.client
          .from("listings")
          .select("*")
          .eq(
            "seller_id",
            req.auth.user.id
          )
          .order(
            "created_at",
            {
              ascending: false
            }
          );

      if (error) {
        throw error;
      }

      res.json(
        (data || []).map(
          mapListing
        )
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Kan je listings niet laden."
      });
    }
  }
);


/* =========================
   FAVORITES
========================= */

app.get(
  "/api/favorites",
  requireLogin,
  async (req, res) => {
    try {
      const {
        data,
        error
      } =
        await req.auth.client
          .from("favorites")
          .select(
            "id,user_id,listing_id,created_at"
          )
          .eq(
            "user_id",
            req.auth.user.id
          )
          .order(
            "created_at",
            {
              ascending: false
            }
          );

      if (error) {
        throw error;
      }

      res.json(
        data || []
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Favorieten laden is mislukt."
      });
    }
  }
);


app.post(
  "/api/favorites/:id",
  requireLogin,
  async (req, res) => {
    try {
      const listingId =
        clean(
          req.params.id
        );

      const {
        data: existing,
        error: findError
      } =
        await req.auth.client
          .from("favorites")
          .select("id")
          .eq(
            "user_id",
            req.auth.user.id
          )
          .eq(
            "listing_id",
            listingId
          )
          .maybeSingle();

      if (findError) {
        throw findError;
      }

      if (existing) {
        const {
          error
        } =
          await req.auth.client
            .from("favorites")
            .delete()
            .eq(
              "id",
              existing.id
            );

        if (error) {
          throw error;
        }

        return res.json({
          favorited: false
        });
      }

      const {
        error
      } =
        await req.auth.client
          .from("favorites")
          .insert({
            user_id:
              req.auth.user.id,

            listing_id:
              listingId
          });

      if (error) {
        throw error;
      }

      res.json({
        favorited: true
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Favoriet bijwerken is mislukt."
      });
    }
  }
);


/* =========================
   OFFERS
========================= */

app.get(
  "/api/offers",
  requireLogin,
  async (req, res) => {
    try {
      const {
        data,
        error
      } =
        await req.auth.client
          .from("offers")
          .select("*")
          .or(
            `buyer_id.eq.${req.auth.user.id},seller_id.eq.${req.auth.user.id}`
          )
          .order(
            "created_at",
            {
              ascending: false
            }
          );

      if (error) {
        throw error;
      }

      res.json(
        data || []
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Biedingen laden is mislukt."
      });
    }
  }
);


app.post(
  "/api/offers",
  requireLogin,
  async (req, res) => {
    try {
      const listingId =
        clean(
          req.body.listing_id ||
          req.body.listingId ||
          req.body.itemId
        );

      const listing =
        await getListing(
          req.auth.client,
          listingId
        );

      if (!listing) {
        return res.status(404).json({
          error:
            "Shirt niet gevonden."
        });
      }

      const amount =
        Number(
          req.body.amount ||
          req.body.offerAmount ||
          req.body.price
        );

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          error:
            "Vul een geldig bod in."
        });
      }

      if (
        listing.seller_id ===
        req.auth.user.id
      ) {
        return res.status(400).json({
          error:
            "Je kunt niet op je eigen shirt bieden."
        });
      }

      const {
        data,
        error
      } =
        await req.auth.client
          .from("offers")
          .insert({
            listing_id:
              listingId,

            buyer_id:
              req.auth.user.id,

            seller_id:
              listing.seller_id,

            amount,

            status:
              "pending"
          })
          .select("*")
          .single();

      if (error) {
        throw error;
      }

      res.status(201).json(
        data
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Bod versturen is mislukt."
      });
    }
  }
);


async function updateOfferStatus(
  req,
  res,
  status
) {
  try {
    const offerId =
      clean(
        req.params.id
      );

    const {
      data: offer,
      error: findError
    } =
      await req.auth.client
        .from("offers")
        .select("*")
        .eq(
          "id",
          offerId
        )
        .maybeSingle();

    if (findError) {
      throw findError;
    }

    if (!offer) {
      return res.status(404).json({
        error:
          "Bod niet gevonden."
      });
    }

    if (
      offer.seller_id !==
      req.auth.user.id
    ) {
      return res.status(403).json({
        error:
          "Je mag dit bod niet aanpassen."
      });
    }

    const {
      data,
      error
    } =
      await req.auth.client
        .from("offers")
        .update({
          status
        })
        .eq(
          "id",
          offerId
        )
        .select("*")
        .single();

    if (error) {
      throw error;
    }

    res.json(
      data
    );

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        "Bod bijwerken is mislukt."
    });
  }
}

app.post(
  "/api/offers/:id/accept",
  requireLogin,
  (req, res) =>
    updateOfferStatus(
      req,
      res,
      "accepted"
    )
);

app.post(
  "/api/offers/:id/reject",
  requireLogin,
  (req, res) =>
    updateOfferStatus(
      req,
      res,
      "rejected"
    )
);


/* =========================
   MESSAGES
========================= */

app.get(
  "/api/messages",
  requireLogin,
  async (req, res) => {
    try {
      const {
        data,
        error
      } =
        await req.auth.client
          .from("messages")
          .select(
            "id,sender_id,receiver_id,listing_id,text,read,created_at"
          )
          .or(
            `sender_id.eq.${req.auth.user.id},receiver_id.eq.${req.auth.user.id}`
          )
          .order(
            "created_at",
            {
              ascending: true
            }
          );

      if (error) {
        throw error;
      }

      res.json(
        data || []
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Inbox laden is mislukt."
      });
    }
  }
);


app.post(
  "/api/messages",
  requireLogin,
  async (req, res) => {
    try {
      const receiverId =
        await resolveUserId(
          req.auth.client,
          req.body.receiver_id ||
          req.body.to
        );

      if (!receiverId) {
        return res.status(404).json({
          error:
            "Ontvanger niet gevonden."
        });
      }

      const senderId =
        req.auth.user.id;

      const listingId =
        clean(
          req.body.listing_id ||
          req.body.itemId
        ) || null;

      const text =
        clean(
          req.body.text ||
          req.body.body
        );

      if (!text) {
        return res.status(400).json({
          error:
            "Bericht is leeg."
        });
      }

      const payload = {
        sender_id:
          senderId,

        receiver_id:
          receiverId,

        listing_id:
          listingId,

        text,

        read:
          false
      };

      const {
        data,
        error
      } =
        await req.auth.client
          .from("messages")
          .insert(payload)
          .select("*")
          .single();

      if (error) {
        throw error;
      }

      res.status(201).json(
        data
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Bericht verzenden is mislukt."
      });
    }
  }
);


app.post(
  "/api/messages/:id/read",
  requireLogin,
  async (req, res) => {
    try {
      const {
        data,
        error
      } =
        await req.auth.client
          .from("messages")
          .update({
            read: true
          })
          .eq(
            "id",
            clean(
              req.params.id
            )
          )
          .eq(
            "receiver_id",
            req.auth.user.id
          )
          .select("*")
          .single();

      if (error) {
        throw error;
      }

      res.json(
        data
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Bericht kon niet als gelezen worden gemarkeerd."
      });
    }
  }
);


/* =========================
   NOTIFICATIONS
========================= */

app.post(
  "/api/notifications",
  requireLogin,
  async (req, res) => {
    try {
      const ownerId =
        await resolveUserId(
          req.auth.client,
          req.body.owner_user_id ||
          req.body.ownerUsername ||
          req.body.to
        );

      if (!ownerId) {
        return res.status(404).json({
          error:
            "Gebruiker voor melding niet gevonden."
        });
      }

      const listingId =
        clean(
          req.body.listing_id ||
          req.body.itemId
        ) || null;

      const payload = {
        user_id:
          ownerId,

        type:
          clean(
            req.body.type
          ) ||
          "system",

        title:
          clean(
            req.body.title ||
            req.body.itemName ||
            "Melding"
          ),

        message:
          clean(
            req.body.message ||
            req.body.text
          ),

        listing_id:
          listingId,

        read:
          Boolean(
            req.body.read
          ),

        created_at:
          req.body.date ||
          undefined
      };

      if (!payload.created_at) {
        delete payload.created_at;
      }

      const {
        data,
        error
      } =
        await req.auth.client
          .from("notifications")
          .insert(payload)
          .select("*")
          .single();

      if (error) {
        throw error;
      }

      res.status(201).json(
        data
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Melding opslaan is mislukt."
      });
    }
  }
);


app.get(
  "/api/notifications",
  requireLogin,
  async (req, res) => {
    try {
      const {
        data,
        error
      } =
        await req.auth.client
          .from("notifications")
          .select("*")
          .eq(
            "user_id",
            req.auth.user.id
          )
          .order(
            "created_at",
            {
              ascending: false
            }
          );

      if (error) {
        throw error;
      }

      res.json(
        data || []
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Meldingen laden is mislukt."
      });
    }
  }
);


/* =========================
   REVIEWS
========================= */

app.post(
  "/api/reviews",
  requireLogin,
  async (req, res) => {
    try {
      const rating =
        Number(
          req.body.rating
        );

      const toUser =
        await resolveUserId(
          req.auth.client,
          req.body.to ||
          req.body.to_user_id
        );

      const orderId =
        clean(
          req.body.order_id ||
          req.body.orderId
        ) || null;

      if (
        !toUser ||
        !Number.isInteger(
          rating
        ) ||
        rating < 1 ||
        rating > 5
      ) {
        return res.status(400).json({
          error:
            "Ongeldige review."
        });
      }

      const payload = {
        order_id:
          orderId,

        from_user_id:
          req.auth.user.id,

        to_user_id:
          toUser,

        rating,

        text:
          clean(
            req.body.text
          )
      };

      const {
        data,
        error
      } =
        await req.auth.client
          .from("reviews")
          .insert(payload)
          .select("*")
          .single();

      if (error) {
        throw error;
      }

      res.status(201).json(
        data
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Review plaatsen is mislukt."
      });
    }
  }
);


app.get(
  "/api/reviews/:userId",
  async (req, res) => {
    try {
      const client =
        SUPABASE_KEY
          ? publicSupabase
          : null;

      const {
        data,
        error
      } =
        await client
          .from("reviews")
          .select("*")
          .eq(
            "to_user_id",
            clean(
              req.params.userId
            )
          )
          .order(
            "created_at",
            {
              ascending: false
            }
          );

      if (error) {
        throw error;
      }

      res.json(
        data || []
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Reviews laden is mislukt."
      });
    }
  }
);


/* =========================
   ORDERS
========================= */

app.post(
  "/api/orders",
  requireLogin,
  async (req, res) => {
    try {
      const listingId =
        clean(
          req.body.listing_id ||
          req.body.listingId ||
          req.body.itemId
        );

      const listing =
        await getListing(
          req.auth.client,
          listingId
        );

      if (!listing) {
        return res.status(404).json({
          error:
            "Shirt niet gevonden."
        });
      }

      if (
        listing.seller_id ===
        req.auth.user.id
      ) {
        return res.status(400).json({
          error:
            "Je kunt je eigen shirt niet kopen."
        });
      }

      const price =
        Number(
          req.body.price ??
          req.body.amount ??
          listing.price
        );

      const {
        data,
        error
      } =
        await req.auth.client
          .from("orders")
          .insert({
            listing_id:
              listingId,

            buyer_id:
              req.auth.user.id,

            seller_id:
              listing.seller_id,

            price,

            status:
              "pending",

            tracking_number:
              clean(
                req.body.tracking_number
              ) || null
          })
          .select("*")
          .single();

      if (error) {
        throw error;
      }

      res.status(201).json(
        data
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Order aanmaken is mislukt."
      });
    }
  }
);


app.get(
  "/api/orders",
  requireLogin,
  async (req, res) => {
    try {
      const {
        data,
        error
      } =
        await req.auth.client
          .from("orders")
          .select("*")
          .or(
            `buyer_id.eq.${req.auth.user.id},seller_id.eq.${req.auth.user.id}`
          )
          .order(
            "created_at",
            {
              ascending: false
            }
          );

      if (error) {
        throw error;
      }

      res.json(
        data || []
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Orders laden is mislukt."
      });
    }
  }
);


app.post(
  "/api/orders/:id/status",
  requireLogin,
  async (req, res) => {
    try {
      const id =
        clean(
          req.params.id
        );

      const status =
        clean(
          req.body.status
        );

      const allowed = [
        "pending",
        "paid",
        "shipped",
        "delivered",
        "completed",
        "cancelled",
        "issue"
      ];

      if (
        !allowed.includes(
          status
        )
      ) {
        return res.status(400).json({
          error:
            "Ongeldige orderstatus."
        });
      }

      const {
        data: order,
        error: findError
      } =
        await req.auth.client
          .from("orders")
          .select("*")
          .eq(
            "id",
            id
          )
          .maybeSingle();

      if (findError) {
        throw findError;
      }

      if (!order) {
        return res.status(404).json({
          error:
            "Order niet gevonden."
        });
      }

      if (
        order.buyer_id !==
          req.auth.user.id &&
        order.seller_id !==
          req.auth.user.id
      ) {
        return res.status(403).json({
          error:
            "Geen toegang tot deze order."
        });
      }

      const {
        data,
        error
      } =
        await req.auth.client
          .from("orders")
          .update({
            status
          })
          .eq(
            "id",
            id
          )
          .select("*")
          .single();

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        order: data
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Orderstatus wijzigen is mislukt."
      });
    }
  }
);


app.post(
  "/api/orders/:id/pay",
  requireLogin,
  async (req, res) => {
    try {
      const {
        data,
        error
      } =
        await req.auth.client
          .from("orders")
          .update({
            status:
              "paid"
          })
          .eq(
            "id",
            clean(
              req.params.id
            )
          )
          .eq(
            "buyer_id",
            req.auth.user.id
          )
          .select("*")
          .single();

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        order: data
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Betaling kon niet worden verwerkt."
      });
    }
  }
);


app.post(
  "/api/orders/:id/issue",
  requireLogin,
  async (req, res) => {
    try {
      const {
        data,
        error
      } =
        await req.auth.client
          .from("orders")
          .update({
            status:
              "issue"
          })
          .eq(
            "id",
            clean(
              req.params.id
            )
          )
          .eq(
            "buyer_id",
            req.auth.user.id
          )
          .select("*")
          .single();

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        order: data
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Probleem melden is mislukt."
      });
    }
  }
);


/* =========================
   PAYMENT / BOOST
========================= */

app.post(
  "/api/checkout/session",
  requireLogin,
  async (req, res) => {
    res.json({
      url: null,
      success: false,
      message:
        "Stripe is nog niet gekoppeld. De website kan voorlopig haar lokale betaalpagina gebruiken."
    });
  }
);


app.post(
  "/api/payments/setup-session",
  requireLogin,
  async (req, res) => {
    res.json({
      url: null,
      success: false,
      message:
        "Stripe is nog niet gekoppeld."
    });
  }
);


app.post(
  "/api/boosts/pay",
  requireLogin,
  async (req, res) => {
    res.json({
      success: false,
      message:
        "Boost-betalingen worden pas geactiveerd nadat Stripe is gekoppeld."
    });
  }
);


/* =========================
   HEALTH
========================= */

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      ok: true,
      app:
        "Football-Shirt-Market",
      database:
        "supabase",
      time:
        new Date().toISOString()
    });
  }
);


/* =========================
   FRONTEND
========================= */

app.use(
  express.static(__dirname)
);

app.get(
  "*",
  (req, res, next) => {
    if (
      req.path.startsWith(
        "/api/"
      )
    ) {
      return next();
    }

    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );
  }
);


app.use(
  (
    err,
    req,
    res,
    next
  ) => {
    console.error(err);

    res.status(500).json({
      error:
        "Interne serverfout."
    });
  }
);


app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "================================="
    );

    console.log(
      " Football-Shirt-Market"
    );

    console.log(
      " Supabase backend draait!"
    );

    console.log(
      ` http://localhost:${PORT}`
    );

    console.log(
      "================================="
    );
  }
);
