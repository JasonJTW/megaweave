import express from "express";
const router = express.Router();
import signupAPI from "./signup";
import signinAPI from "./signin";
import getCurrentUser from "./currentUser";
import signoutAPI from "./signout";
//* Test api
router.post("/test", (req, res) => {
  console.log("API test called");
  res.json({ message: "You're inside docker!" });
});

router.get("/test", (req, res) => {
  console.log("API test called");
  res.json({ message: "You're inside docker!" });
});

router.use("/signup", signupAPI);
router.use("/signin", signinAPI);
router.use("/currentUser", getCurrentUser);
router.use("/signout", signoutAPI);
export default router;
