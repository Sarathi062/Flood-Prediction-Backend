const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

console.log("from passport",process.env.callbackURL);
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.G_CLIENT_ID,
      clientSecret: process.env.G_CLIENT_SECRET,
      callbackURL: process.env.callbackURL,
    },
    (accessToken, refreshToken, profile, done) => {
      return done(null, profile);
    }
  )
);

// VERY IMPORTANT: export the passport instance
module.exports = passport;
