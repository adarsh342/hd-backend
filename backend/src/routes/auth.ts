import express from "express"
import passport from "passport"
import User from "../models/User"
import { generateToken, generateOTP } from "../utils/jwt"
import { sendOTPEmail, sendWelcomeEmail } from "../utils/email"
import { signupSchema, verifyOTPSchema, signinSchema, resendOTPSchema } from "../validation/auth"

const router = express.Router()

// Signup - Send OTP
router.post("/signup", async (req, res) => {
  try {
    const { error, value } = signupSchema.validate(req.body)
    if (error) {
      return res.status(400).json({ message: error.details[0].message })
    }

    const { name, email, dateOfBirth } = value

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser && existingUser.isEmailVerified) {
      return res.status(400).json({ message: "User already exists with this email" })
    }

    // Generate OTP
    const otp = generateOTP()
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    if (existingUser) {
      // Update existing unverified user
      existingUser.name = name
      existingUser.dateOfBirth = new Date(dateOfBirth)
      existingUser.otp = otp
      existingUser.otpExpires = otpExpires
      await existingUser.save()
    } else {
      // Create new user
      await User.create({
        name,
        email,
        dateOfBirth: new Date(dateOfBirth),
        otp,
        otpExpires,
        authProvider: "email",
      })
    }

    // Send OTP email
    await sendOTPEmail(email, otp, name)

    res.status(200).json({
      message: "OTP sent successfully to your email",
      email,
    })
  } catch (error: any) {
    console.error("Signup error:", error)
    res.status(500).json({ message: "Failed to send OTP. Please check your email configuration." })
  }
})

// Verify OTP and Complete Signup
router.post("/verify-otp", async (req, res) => {
  try {
    const { error, value } = verifyOTPSchema.validate(req.body)
    if (error) {
      return res.status(400).json({ message: error.details[0].message })
    }

    const { email, otp } = value

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(400).json({ message: "User not found" })
    }

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" })
    }

    if (!user.otpExpires || user.otpExpires < new Date()) {
      return res.status(400).json({ message: "OTP has expired" })
    }

    // Verify user
    user.isEmailVerified = true
    user.otp = undefined
    user.otpExpires = undefined
    await user.save()

    // Send welcome email
    await sendWelcomeEmail(email, user.name)

    // Generate JWT token
    const token = generateToken((user._id as any).toString())

    res.status(200).json({
      message: "Email verified successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        dateOfBirth: user.dateOfBirth,
        avatar: user.avatar,
        authProvider: user.authProvider,
      },
    })
  } catch (error: any) {
    console.error("Verify OTP error:", error)
    res.status(500).json({ message: "Internal server error" })
  }
})

// Signin - Send OTP
router.post("/signin", async (req, res) => {
  try {
    const { error, value } = resendOTPSchema.validate(req.body)
    if (error) {
      return res.status(400).json({ message: error.details[0].message })
    }

    const { email } = value

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(400).json({ message: "User not found with this email" })
    }

    if (!user.isEmailVerified) {
      return res.status(400).json({ message: "Please complete your signup first" })
    }

    if (user.authProvider === "firebase") {
      return res.status(400).json({ message: "Please use Google sign-in for this account" })
    }

    // Generate OTP
    const otp = generateOTP()
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    user.otp = otp
    user.otpExpires = otpExpires
    await user.save()

    // Send OTP email
    await sendOTPEmail(email, otp, user.name)

    res.status(200).json({
      message: "OTP sent successfully to your email",
      email,
    })
  } catch (error: any) {
    console.error("Signin error:", error)
    res.status(500).json({ message: "Failed to send OTP. Please check your email configuration." })
  }
})

// Verify Signin OTP
router.post("/signin-verify", async (req, res) => {
  try {
    const { error, value } = signinSchema.validate(req.body)
    if (error) {
      return res.status(400).json({ message: error.details[0].message })
    }

    const { email, otp } = value

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(400).json({ message: "User not found" })
    }

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" })
    }

    if (!user.otpExpires || user.otpExpires < new Date()) {
      return res.status(400).json({ message: "OTP has expired" })
    }

    // Clear OTP
    user.otp = undefined
    user.otpExpires = undefined
    await user.save()

    // Generate JWT token
    const token = generateToken((user._id as any).toString())

    res.status(200).json({
      message: "Signed in successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        dateOfBirth: user.dateOfBirth,
        avatar: user.avatar,
        authProvider: user.authProvider,
      },
    })
  } catch (error: any) {
    console.error("Signin verify error:", error)
    res.status(500).json({ message: "Internal server error" })
  }
})

// Resend OTP
router.post("/resend-otp", async (req, res) => {
  try {
    const { error, value } = resendOTPSchema.validate(req.body)
    if (error) {
      return res.status(400).json({ message: error.details[0].message })
    }

    const { email } = value

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(400).json({ message: "User not found" })
    }

    // Generate new OTP
    const otp = generateOTP()
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    user.otp = otp
    user.otpExpires = otpExpires
    await user.save()

    // Send OTP email
    await sendOTPEmail(email, otp, user.name)

    res.status(200).json({
      message: "OTP resent successfully",
    })
  } catch (error: any) {
    console.error("Resend OTP error:", error)
    res.status(500).json({ message: "Failed to resend OTP" })
  }
})

// Firebase Google Auth
router.post("/google-firebase", async (req, res) => {
  try {
    const { firebaseUid, name, email, avatar } = req.body

    if (!firebaseUid || !email) {
      return res.status(400).json({ message: "Firebase UID and email are required" })
    }

    // Check if user already exists
    let user = await User.findOne({
      $or: [{ firebaseUid }, { email }],
    })

    if (user) {
      // Update existing user with Firebase UID if not set
      if (!user.firebaseUid) {
        user.firebaseUid = firebaseUid
        user.authProvider = "firebase"
        if (avatar && !user.avatar) user.avatar = avatar
        await user.save()
      }
    } else {
      // Create new user
      user = await User.create({
        firebaseUid,
        name: name || "Google User",
        email,
        avatar,
        authProvider: "firebase",
        isEmailVerified: true, // Google accounts are pre-verified
      })

      // Send welcome email
      await sendWelcomeEmail(email, user.name)
    }

    // Generate JWT token
    const token = generateToken((user._id as any).toString())

    res.status(200).json({
      message: "Google authentication successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        dateOfBirth: user.dateOfBirth,
        avatar: user.avatar,
        authProvider: user.authProvider,
      },
    })
  } catch (error: any) {
    console.error("Firebase Google auth error:", error)
    res.status(500).json({ message: "Internal server error" })
  }
})

// Google OAuth routes (keeping for backward compatibility)
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }))

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: `${process.env.FRONTEND_URL}/signin?error=google_auth_failed` }),
  async (req, res) => {
    try {
      const user = req.user as any
      const token = generateToken(user._id.toString())

      // Redirect to frontend with token
      res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`)
    } catch (error) {
      console.error("Google OAuth callback error:", error)
      res.redirect(`${process.env.FRONTEND_URL}/signin?error=auth_failed`)
    }
  },
)

export default router
