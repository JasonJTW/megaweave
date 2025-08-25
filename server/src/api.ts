import express from "express";
const router = express.Router();
import signupAPI from "./signup";
import signinAPI from "./signin";
import getCurrentUser from "./currentUser";
import signoutAPI from "./signout";
import postAPI from "./posts";
import categoriesAPI from "./categories";
import conditionsAPI from "./conditions";
import avatarAPI from "./avatar";
import userprofileAPI from "./userprofile";
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
router.use("/posts", postAPI);
router.use("/categories", categoriesAPI);
router.use("/conditions", conditionsAPI);
router.use("/avatar", avatarAPI);
router.use("/userprofile", userprofileAPI);
export default router;
