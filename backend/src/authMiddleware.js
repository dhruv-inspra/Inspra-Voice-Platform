import { getAuth } from "./firebaseAdmin.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Missing auth token." });
    }

    const decoded = await getAuth().verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || "",
      name: decoded.name || decoded.email || "User"
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired auth token." });
  }
}
