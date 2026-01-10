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
import memberAPI from "./member";
import commentAPI from "./comments";
import statsAPI from "./stats";
import weavesAPI from "./weaves";
import healthAPI from "./health";
import notificationsAPI from "./notifications";
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
router.use("/member", memberAPI);
router.use("/comments", commentAPI);
router.use("/user/stats", statsAPI);
router.use("/weaves", weavesAPI);
router.use("/health", healthAPI);
router.use("/notification", notificationsAPI)
export default router;
