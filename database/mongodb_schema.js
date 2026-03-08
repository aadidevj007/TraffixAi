/*
  TraffixAI MongoDB Schema/Indexes
  Usage:
    mongosh "mongodb://127.0.0.1:27017/traffixai" database/mongodb_schema.js
*/

const dbName = "traffixai";
const database = db.getSiblingDB(dbName);

database.createCollection("users");
database.createCollection("uploads");
database.createCollection("system_stats");

database.users.createIndex({ firebase_uid: 1 }, { unique: true, name: "uid_unique" });
database.users.createIndex({ email: 1 }, { name: "email_lookup" });

database.uploads.createIndex({ user_id: 1, created_at: -1 }, { name: "user_uploads" });
database.uploads.createIndex({ status: 1, sentToAdmin: 1 }, { name: "admin_queue" });
database.uploads.createIndex({ timestamp: 1 }, { name: "time_series" });

database.system_stats.updateOne(
  { _id: "global" },
  {
    $setOnInsert: {
      total_users: 0,
      total_uploads: 0,
      total_accidents: 0,
      total_violations: 0,
      updated_at: new Date().toISOString(),
    },
  },
  { upsert: true }
);

print("TraffixAI schema and indexes created.");

