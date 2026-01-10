import Router, {Request, Response  } from "express";
const router = Router()

router.get("/test/:userId", (req:Request, res:Response)=>{
  const {userId} = req.params;
  const io = res.locals.io;
  
  if (io){
    io.to(`user_${userId}`).emit("new_notification", {
      message: `Test notification for user ${userId}, sent at ${new Date().toLocaleTimeString()}`
    });
    return res.status(200).json({message: `Notification sent successfully to user ${userId}`})
  }
  
  return res.status(500).json({errorMessage: "Socket.io not initialized"})
})

export default router