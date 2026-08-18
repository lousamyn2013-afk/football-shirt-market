```javascript
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "kitmarket.db");

const db = new sqlite3.Database(DB_FILE);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "kitmarket-demo-secret-change-this",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

/* =========================
   DATABASE HELPERS
========================= */

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        id: this.lastID,
        changes: this.changes
      });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows);
    });
  });
}

/* =========================
   DATABASE SETUP
========================= */

async function setupDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      club TEXT DEFAULT '',
      player TEXT DEFAULT '',
      season TEXT DEFAULT '',
      size TEXT DEFAULT '',
      condition TEXT DEFAULT '',
      type TEXT DEFAULT '',
      price REAL NOT NULL,
      description TEXT DEFAULT '',
      boosted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      listing_id INTEGER NOT NULL,
      UNIQUE(user_id, listing_id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(listing_id) REFERENCES listings(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_id INTEGER NOT NULL,
      listing_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(buyer_id) REFERENCES users(id),
      FOREIGN KEY(listing_id) REFERENCES listings(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_id INTEGER NOT NULL,
      listing_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(buyer_id) REFERENCES users(id),
      FOREIGN KEY(listing_id) REFERENCES listings(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      listing_id INTEGER,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(sender_id) REFERENCES users(id),
      FOREIGN KEY(receiver_id) REFERENCES users(id),
      FOREIGN KEY(listing_id) REFERENCES listings(id)
    )
  `);

  /* =========================
     DEMO ACCOUNT
  ========================= */

  const demoEmail = "demo@kitmarket.local";

  const existingDemo = await get(
    "SELECT id FROM users WHERE email = ?",
    [demoEmail]
  );

  let demoUserId;

  if (!existingDemo) {
    const passwordHash = await bcrypt.hash("demo123", 10);

    const result = await run(
      `
      INSERT INTO users
      (name, email, password)
      VALUES (?, ?, ?)
      `,
      [
        "Demo gebruiker",
        demoEmail,
        passwordHash
      ]
    );

    demoUserId = result.id;
  } else {
    demoUserId = existingDemo.id;
  }

  /* =========================
     DEMO LISTINGS
  ========================= */

  const listingCount = await get(
    "SELECT COUNT(*) AS count FROM listings"
  );

  if (listingCount.count === 0) {
    await run(
      `
      INSERT INTO listings
      (
        user_id,
        title,
        club,
        player,
        season,
        size,
        condition,
        type,
        price,
        description,
        boosted
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        demoUserId,
        "Ajax thuisshirt",
        "Ajax",
        "",
        "2024/25",
        "M",
        "Uitstekende staat",
        "Club",
        59.99,
        "Mooi Ajax voetbalshirt.",
        1
      ]
    );

    await run(
      `
      INSERT INTO listings
      (
        user_id,
        title,
        club,
        player,
        season,
        size,
        condition,
        type,
        price,
        description,
        boosted
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        demoUserId,
        "Nederland thuisshirt",
        "Nederland",
        "",
        "2024",
        "L",
        "Nieuw",
        "Nationale ploeg",
        79.99,
        "Nieuw Nederlands voetbalshirt.",
        0
      ]
    );

    await run(
      `
      INSERT INTO listings
      (
        user_id,
        title,
        club,
        player,
        season,
        size,
        condition,
        type,
        price,
        description,
        boosted
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        demoUserId,
        "Retro voetbalshirt",
        "Barcelona",
        "",
        "1999",
        "M",
        "Goede staat",
        "Retro",
        89.99,
        "Retro voetbalshirt voor verzamelaars.",
        0
      ]
    );
  }
}

/* =========================
   AUTH MIDDLEWARE
========================= */

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "Je moet ingelogd zijn."
    });
  }

  next();
}

/* =========================
   CURRENT USER
========================= */

app.get("/api/me", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "Niet ingelogd."
      });
    }

    const user = await get(
      `
      SELECT id, name, email, created_at
      FROM users
      WHERE id = ?
      `,
      [req.session.userId]
    );

    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({
        error: "Gebruiker bestaat niet."
      });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({
      error: "Kan gebruiker niet laden."
    });
  }
});

/* =========================
   REGISTER
========================= */

app.post("/api/register", async (req, res) => {
  try {
    const {
      name,
      email,
      password
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Vul alle velden in."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Je wachtwoord moet minimaal 6 tekens bevatten."
      });
    }

    const normalizedEmail =
      String(email).trim().toLowerCase();

    const existing = await get(
      "SELECT id FROM users WHERE email = ?",
      [normalizedEmail]
    );

    if (existing) {
      return res.status(409).json({
        error: "Er bestaat al een account met dit e-mailadres."
      });
    }

    const hash =
      await bcrypt.hash(password, 10);

    const result = await run(
      `
      INSERT INTO users
      (name, email, password)
      VALUES (?, ?, ?)
      `,
      [
        String(name).trim(),
        normalizedEmail,
        hash
      ]
    );

    req.session.userId = result.id;

    res.json({
      id: result.id,
      name: String(name).trim(),
      email: normalizedEmail
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Registreren is mislukt."
    });
  }
});

/* =========================
   LOGIN
========================= */

app.post("/api/login", async (req, res) => {
  try {
    const {
      email,
      password
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Vul e-mail en wachtwoord in."
      });
    }

    const user = await get(
      `
      SELECT *
      FROM users
      WHERE email = ?
      `,
      [
        String(email)
          .trim()
          .toLowerCase()
      ]
    );

    if (!user) {
      return res.status(401).json({
        error: "Onjuiste e-mail of wachtwoord."
      });
    }

    const valid =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!valid) {
      return res.status(401).json({
        error: "Onjuiste e-mail of wachtwoord."
      });
    }

    req.session.userId = user.id;

    res.json({
      id: user.id,
      name: user.name,
      email: user.email
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Inloggen is mislukt."
    });
  }
});

/* =========================
   LOGOUT
========================= */

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({
      success: true
    });
  });
});

/* =========================
   LISTINGS
========================= */

app.get("/api/listings", async (req, res) => {
  try {
    const q =
      String(req.query.q || "")
        .trim()
        .toLowerCase();

    const condition =
      String(req.query.condition || "")
        .trim();

    const type =
      String(req.query.type || "")
        .trim();

    const sort =
      String(req.query.sort || "recommended");

    let sql = `
      SELECT
        listings.*,
        users.name AS seller
      FROM listings
      JOIN users
        ON users.id = listings.user_id
      WHERE 1 = 1
    `;

    const params = [];

    if (q) {
      sql += `
        AND (
          LOWER(listings.title) LIKE ?
          OR LOWER(listings.club) LIKE ?
          OR LOWER(listings.player) LIKE ?
          OR LOWER(listings.season) LIKE ?
        )
      `;

      const search = `%${q}%`;

      params.push(
        search,
        search,
        search,
        search
      );
    }

    if (condition) {
      sql += `
        AND listings.condition = ?
      `;

      params.push(condition);
    }

    const types =
      type
        ? type
            .split(",")
            .map(x => x.trim())
            .filter(Boolean)
        : [];

    for (const selectedType of types) {
      sql += `
        AND listings.type LIKE ?
      `;

      params.push(
        `%${selectedType}%`
      );
    }

    if (sort === "low") {
      sql += `
        ORDER BY listings.price ASC
      `;
    } else if (sort === "high") {
      sql += `
        ORDER BY listings.price DESC
      `;
    } else if (sort === "newest") {
      sql += `
        ORDER BY listings.created_at DESC
      `;
    } else {
      sql += `
        ORDER BY listings.boosted DESC,
                 listings.created_at DESC
      `;
    }

    const listings =
      await all(sql, params);

    res.json(listings);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Kan listings niet laden."
    });
  }
});

/* =========================
   CREATE LISTING
========================= */

app.post(
  "/api/listings",
  requireLogin,
  async (req, res) => {
    try {
      const {
        title,
        club,
        player,
        season,
        size,
        condition,
        type,
        price,
        description
      } = req.body;

      if (!title) {
        return res.status(400).json({
          error: "Een titel is verplicht."
        });
      }

      const numericPrice =
        Number(price);

      if (
        !Number.isFinite(numericPrice) ||
        numericPrice <= 0
      ) {
        return res.status(400).json({
          error: "Vul een geldige prijs in."
        });
      }

      const result = await run(
        `
        INSERT INTO listings
        (
          user_id,
          title,
          club,
          player,
          season,
          size,
          condition,
          type,
          price,
          description
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          req.session.userId,
          title,
          club || "",
          player || "",
          season || "",
          size || "",
          condition || "",
          type || "",
          numericPrice,
          description || ""
        ]
      );

      const listing =
        await get(
          `
          SELECT *
          FROM listings
          WHERE id = ?
          `,
          [result.id]
        );

      res.status(201).json(listing);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "Listing publiceren is mislukt."
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
      const listings =
        await all(
          `
          SELECT *
          FROM listings
          WHERE user_id = ?
          ORDER BY created_at DESC
          `,
          [req.session.userId]
        );

      res.json(listings);
    } catch (error) {
      res.status(500).json({
        error: "Kan je listings niet laden."
      });
    }
  }
);

/* =========================
   FAVORITES
========================= */

app.post(
  "/api/favorites/:id",
  requireLogin,
  async (req, res) => {
    try {
      const listingId =
        Number(req.params.id);

      const existing =
        await get(
          `
          SELECT id
          FROM favorites
          WHERE user_id = ?
          AND listing_id = ?
          `,
          [
            req.session.userId,
            listingId
          ]
        );

      if (existing) {
        await run(
          `
          DELETE FROM favorites
          WHERE id = ?
          `,
          [existing.id]
        );

        return res.json({
          favorited: false
        });
      }

      await run(
        `
        INSERT INTO favorites
        (user_id, listing_id)
        VALUES (?, ?)
        `,
        [
          req.session.userId,
          listingId
        ]
      );

      res.json({
        favorited: true
      });
    } catch (error) {
      res.status(500).json({
        error: "Favoriet bijwerken is mislukt."
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
        Number(req.body.listingId);

      const listing =
        await get(
          `
          SELECT *
          FROM listings
          WHERE id = ?
          `,
          [listingId]
        );

      if (!listing) {
        return res.status(404).json({
          error: "Shirt niet gevonden."
        });
      }

      if (
        listing.user_id ===
        req.session.userId
      ) {
        return res.status(400).json({
          error: "Je kunt je eigen shirt niet kopen."
        });
      }

      const result =
        await run(
          `
          INSERT INTO orders
          (buyer_id, listing_id, amount)
          VALUES (?, ?, ?)
          `,
          [
            req.session.userId,
            listingId,
            listing.price
          ]
        );

      res.json({
        id: result.id,
        amount: listing.price,
        status: "pending"
      });
    } catch (error) {
      res.status(500).json({
        error: "Order aanmaken is mislukt."
      });
    }
  }
);

/* =========================
   OFFERS
========================= */

app.post(
  "/api/offers",
  requireLogin,
  async (req, res) => {
    try {
      const listingId =
        Number(req.body.listingId);

      const amount =
        Number(req.body.amount);

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          error: "Ongeldig bod."
        });
      }

      const listing =
        await get(
          `
          SELECT *
          FROM listings
          WHERE id = ?
          `,
          [listingId]
        );

      if (!listing) {
        return res.status(404).json({
          error: "Shirt niet gevonden."
        });
      }

      if (
        listing.user_id ===
        req.session.userId
      ) {
        return res.status(400).json({
          error: "Je kunt geen bod doen op je eigen shirt."
        });
      }

      const result =
        await run(
          `
          INSERT INTO offers
          (buyer_id, listing_id, amount)
          VALUES (?, ?, ?)
          `,
          [
            req.session.userId,
            listingId,
            amount
          ]
        );

      res.json({
        id: result.id,
        amount,
        status: "pending"
      });
    } catch (error) {
      res.status(500).json({
        error: "Bod verzenden is mislukt."
      });
    }
  }
);

/* =========================
   INBOX
========================= */

app.get(
  "/api/messages",
  requireLogin,
  async (req, res) => {
    try {
      const messages =
        await all(
          `
          SELECT
            messages.*,
            users.name AS sender,
            listings.title AS listing
          FROM messages
          JOIN users
            ON users.id = messages.sender_id
          LEFT JOIN listings
            ON listings.id = messages.listing_id
          WHERE messages.receiver_id = ?
          ORDER BY messages.created_at DESC
          `,
          [req.session.userId]
        );

      res.json(messages);
    } catch (error) {
      res.status(500).json({
        error: "Inbox laden is mislukt."
      });
    }
  }
);

/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    app: "KitMarket",
    time: new Date().toISOString()
  });
});

/* =========================
   FRONTEND
========================= */

app.use(
  express.static(__dirname)
);

/* =========================
   START
========================= */

async function start() {
  try {
    await setupDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log("");
      console.log("=================================");
      console.log(" Football-Shirt-Market");
      console.log(" Server draait!");
      console.log("=================================");
      console.log(
        `http://localhost:${PORT}`
      );
      console.log("");
      console.log(
        "Demo account:"
      );
      console.log(
        "demo@kitmarket.local"
      );
      console.log(
        "demo123"
      );
      console.log("");
    });
  } catch (error) {
    console.error(
      "Database/server starten mislukt:",
      error
    );

    process.exit(1);
  }
}

start();
```
