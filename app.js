//jshint esversion:6
// constants
require('dotenv').config()
const mongoose = require('mongoose');
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const app = express();
const _ = require("lodash")
const session = require("express-session")
const passport = require("passport")
const passportLocalMongoose = require("passport-local-mongoose")
const GoogleStrategy = require('passport-google-oauth20').Strategy
const findOrCreate = require('mongoose-findorcreate')
const emailJS = require('@emailjs/browser')
const flash = require('connect-flash')
const { uuid } = require('uuidv4');

main().catch(err => console.log(err));

async function main() {
    // app setups
    app.set('view engine', 'ejs')
    app.use(bodyParser.urlencoded({extended: true}))
    app.use(express.static("public"))

    app.use(session({
        secret: process.env.SECRET,
        resave: false,
        saveUninitialized: false
    }))
    app.use(passport.initialize())
    app.use(passport.session())
    app.use(flash())

    // emailJS setup
    emailJS.init(process.env.EMAILJS_KEY)


    // mongo setup
    await mongoose.connect(process.env.URL);
    console.log("Connected");
    mongoose.set('strictQuery', false);

    // user schema setup
    const userSchema = new mongoose.Schema({
        email: String,
        username: String,
        password: String,
        googleId: {type:String, unique:true, sparse: true },
        secret: [String],
        status: {
          type: String, 
          enum: ['Pending', 'Active'],
          default: 'Pending'
        },
        confirmationCode: { 
          type: String, 
          unique: true, sparse: true}
    })
    userSchema.plugin(passportLocalMongoose)
    userSchema.plugin(findOrCreate)

    // setup mongoose model
    const User = new mongoose.model("user", userSchema)

    //passport setups
    passport.use(User.createStrategy())

    passport.serializeUser(function(user, done){

      done(null, user.id);
    
    });

    passport.deserializeUser(function(id, done){
    
      User.findById(id, function(err, user){
    
        done(err, user);
    
      });
    
    });

    // setup google strategy
    passport.use(new GoogleStrategy({
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/secrets",
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    }, (acessToken, refreshToken, profile, cb) => {
      console.log(profile)
      User.findOrCreate({ username: profile.id,googleId: profile.id, status:"Active"}, (err, user) => {
        return cb(err, user)
      })
    }))

    // route setups

    // home route
    app.route("/").get( (req, res)=> {
      res.render("home")
    })

    // register route
    app.route("/register").get((req, res) => {
      res.render("register", { message: req.flash('message') })
    })
    .post((req, res) => {
      const rand = uuid()// create confirmation code

      User.register({username: req.body.username, confirmationCode: rand}, req.body.password, (err, user) => {
        if (err) {
            console.log(err)
            req.flash('message', 'Email already exists!');
            res.redirect("/register")
        } else { 
            const userParams = { // setup email parameters
              code: "localhost:3000/confirm/" + rand,
              email: req.body.username
            }
            emailJS.send(process.env.EMAILJS_ID, process.env.EMAILJS_TEMPLATE, userParams, process.env.EMAILJS_KEY).then(response => { // send the email with the link
              console.log('SUCCESS!', response.status, response.text)
            }, error => {
              console.log('FAILED...', error)
            })
          req.flash('message', 'check your email.');
          res.redirect("/login")
            
        }
      })
    })

    // login route

    app.route("/login").get((req,res) => {
      res.render("login", { message: req.flash('message') })
    })
    .post((req,res) => {
        //check the DB to see if the username that was used to login exists in the DB
        User.findOne({username: req.body.username}, (err, foundUser) => {
          if(foundUser){
            if (foundUser.status != "Active") {
              req.flash('message', 'Please verify');
              res.redirect("/login")
            }
            const user = new User({
              username: req.body.username,
              password: req.body.password
            });
            //use the "user" object that was just created to check against the username and password in the database
            //in this case below, "user" will either return a "false" boolean value if it doesn't match, or it will
            //return the user found in the database
            passport.authenticate("local", (err, user) => {
              if(err){
                console.log(err);
              } else {
                if(user){
                  //if true, then log the user in, else redirect to login page
                  req.login(user, err =>{
                  res.redirect("/secrets");
                  });
                } else {
                  req.flash('message', 'User not found! Make sure your email and/or password are correct');
                  res.redirect("/login");
                }
              }
            })(req, res);
          //if no username is found at all, redirect to login page.
          } else {
            //user does not exists
            req.flash('message', 'User not found! Make sure your email and/or password are correct');
            res.redirect("/login")
          }
        });
    })

    // secrets route

    app.route("/secrets").get((req,res) => {
      // The below line was added so we can't display the "/secrets" page
      // after we logged out using the "back" button of the browser, which
      // would normally display the browser cache and thus expose the 
      // "/secrets" page we want to protect.
      res.set(
        'Cache-Control', 
        'no-cache, private, no-store, must-revalidate, max-stal e=0, post-check=0, pre-check=0'
      );
      if (req.isAuthenticated()) {
        User.find({"secret": {$ne: null}}, function(err, foundUsers) {
          if (err) console.log(err)
          else {
            if (foundUsers) {
              
              res.render("secrets",{usersWithSecrets: foundUsers})
            }
          }
        })
          
      } else {
        req.flash('message', 'Session ended!')
        res.redirect("/login")}
    })

    app.route("/logout").get((req, res) => {
      req.logout(function(err) {console.log(err)})
      res.redirect("/")
    })

    // get setups

    app.get("/auth/google", passport.authenticate('google', {scope: ['email', 'profile'], prompt : "select_account"}));

    app.get("/auth/google/secrets", passport.authenticate('google', {failureRedirect: '/login'}),
    function(req, res) {
      res.redirect('/secrets')
    })

    app.get('/submit', function(req, res) {
      res.set(
        'Cache-Control', 
        'no-cache, private, no-store, must-revalidate, max-stal e=0, post-check=0, pre-check=0'
    );
    if (req.isAuthenticated()) {
        res.render("submit")
    } else {
      req.flash('message', 'Session ended!');
      res.redirect("/login")
    }
    })
    
    app.get('/confirm/:code', (req, res) => {
      const code = req.params.code
      User.findOne({
        confirmationCode: code
      }, (err, foundUser) => {
        if (err) return res.status(404).send({ message: "User Not found." })
        else if (foundUser) {
          foundUser.status = "Active"
          foundUser.save(function(){
            req.flash('message', 'Verifyed!')
            res.redirect("/login")
          })
        }
      } )
    })

    // post setups
    
    app.post("/submit", function(req,res) {
      const submittedSecret = req.body.secret
      const userId = req.user.id
      User.findById(userId, function(err, foundUser) {
        if (err) console.log(err)
        else {if (foundUser) {
          foundUser.secret.push(submittedSecret)
          foundUser.save(function(){res.redirect("/secrets")})
        }}
      })
    })



  
    // server listen
    app.listen(3000, function() {
      console.log("Server started on port 3000");
    });
}