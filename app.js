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

    // mongo setup
    await mongoose.connect('mongodb://127.0.0.1/userDB');
    console.log("Connected");
    mongoose.set('strictQuery', false);

    // user schema setup
    const userSchema = new mongoose.Schema({
        email: String,
        password: String
    })
    userSchema.plugin(passportLocalMongoose)

    // setup mongoose model
    const User = new mongoose.model("user", userSchema)

    passport.use(User.createStrategy())
    passport.serializeUser(User.serializeUser())
    passport.deserializeUser(User.deserializeUser())
    // get setups
    app.get("/", function(req, res) {
        res.render("home")
    })

    app.get("/login", function(req, res) {
        res.render("login")
    })

    app.get("/register", function(req, res) {
        res.render("register")
    })
    app.get("/secrets", function(req, res) {
        // The below line was added so we can't display the "/secrets" page
        // after we logged out using the "back" button of the browser, which
        // would normally display the browser cache and thus expose the 
        // "/secrets" page we want to protect.
        res.set(
            'Cache-Control', 
            'no-cache, private, no-store, must-revalidate, max-stal e=0, post-check=0, pre-check=0'
        );
        if (req.isAuthenticated()) {
            res.render("secrets")
        } else res.redirect("/login")
    })
    app.get("/logout", function(req, res) {
        req.logout(function(err) {console.log(err)})
        res.redirect("/")
    })
    // post setups
    app.post("/register", function(req, res) {
        User.register({username: req.body.username}, req.body.password, function(err, user) {
            if (err) {
                console.log(err)
                res.redirect("/register")
            } else {
                passport.authenticate("local") (req, res, function()  {
                    res.redirect("/secrets")
                })
            }
        })
    })
    app.post("/login", function(req, res){
        //check the DB to see if the username that was used to login exists in the DB
        User.findOne({username: req.body.username}, function(err, foundUser){
          //if username is found in the database, create an object called "user" that will store the username and password
          //that was used to login
          if(foundUser){
          const user = new User({
            username: req.body.username,
            password: req.body.password
          });
            //use the "user" object that was just created to check against the username and password in the database
            //in this case below, "user" will either return a "false" boolean value if it doesn't match, or it will
            //return the user found in the database
            passport.authenticate("local", function(err, user){
              if(err){
                console.log(err);
              } else {
                //this is the "user" returned from the passport.authenticate callback, which will be either
                //a false boolean value if no it didn't match the username and password or
                //a the user that was found, which would make it a truthy statement
                if(user){
                  //if true, then log the user in, else redirect to login page
                  req.login(user, function(err){
                  res.redirect("/secrets");
                  });
                } else {
                  res.redirect("/login");
                }
              }
            })(req, res);
          //if no username is found at all, redirect to login page.
          } else {
            //user does not exists
            res.redirect("/login")
          }
        });
      });




  
    // server listen
    app.listen(3000, function() {
      console.log("Server started on port 3000");
    });
}